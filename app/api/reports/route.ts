import { createHmac } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { SINCE, kmBetween, type Earthquake } from "../../../lib/earthquakes";
import { recentPanamaEvents } from "../../../lib/catalogs";
import { REPORT_WINDOW_MS, flagFor, parseReport, summarize, summarizeEvent, type EventSummary, type ReportRow } from "../../../lib/felt-reports";
import { insertReport, listReports, reportsAvailable } from "../../../lib/felt-store";
import { readJsonObject } from "../../../lib/push-validation";
import { getClientIp } from "../../../lib/rate-limit";

export const dynamic = "force-dynamic";

// Reportes «¿Lo sentiste?».
//   GET  /api/reports            → resumen de todos los sismos con reportes (propios o del USGS).
//   GET  /api/reports?event=<id> → un sismo: reportes agrupados por localidad.
//   POST /api/reports            → enviar un reporte { eventId, felt, intensity?, placeId }.
// Lo publicado está siempre agrupado: nunca sale un reporte suelto ni el identificador del dispositivo.

const EVENT_PARAM = /^(?:[a-z]{2}[0-9a-z]{6,12}|igc:\d{9,11}|emsc:[0-9A-Za-z_-]{4,40})$/;
const NO_STORE = { "Cache-Control": "no-store" };

type Lookup = { byId: Map<string, Earthquake>; list: Earthquake[] };
async function lookup(maxAgeMs?: number): Promise<Lookup | null> {
  try {
    const list = await recentPanamaEvents(SINCE, maxAgeMs);
    const byId = new Map<string, Earthquake>();
    for (const event of list) for (const id of [event.id, ...(event.properties.aliases ?? [])]) byId.set(id, event);
    return { byId, list };
  } catch (error) {
    console.error("[reportes] catálogos no disponibles:", error);
    return null;
  }
}

// Un mismo sismo puede haberse reportado con el id de un catálogo y hoy figurar con el de otro (el USGS publica después): se
// agrupan con el registro actual y se usan sus datos al día (magnitud revisada, lugar).
function canonical(rows: ReportRow[], events: Lookup | null): ReportRow[] {
  if (!events) return rows;
  return rows.map(row => {
    const event = events.byId.get(row.event_id);
    if (!event) return row;
    const [lng, lat] = event.geometry.coordinates;
    return { ...row, event_id: event.id, event_time: event.properties.time, event_mag: event.properties.mag, event_place: event.properties.place, event_lat: lat, event_lng: lng };
  });
}

// Lo que publica el USGS de «¿Lo sentiste?» para un sismo (si es suyo): cuántas respuestas y dónde reportar.
function usgsFelt(event: Earthquake | undefined) {
  if (!event || (event.properties.source ?? "usgs") !== "usgs") return { usgsFelt: null, usgsUrl: null };
  const url = event.properties.url?.startsWith("https://earthquake.usgs.gov/earthquakes/eventpage/") ? event.properties.url : null;
  return { usgsFelt: typeof event.properties.felt === "number" ? event.properties.felt : null, usgsUrl: url ? `${url}/tellus` : null };
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const keys = [...params.keys()];
  const eventId = params.get("event");
  if (keys.length > 1 || (keys.length === 1 && (keys[0] !== "event" || !eventId || !EVENT_PARAM.test(eventId)))) {
    return NextResponse.json({ error: "Parámetros no admitidos" }, { status: 400, headers: NO_STORE });
  }
  if (!reportsAvailable()) {
    return NextResponse.json({ error: "Los reportes aún no están disponibles.", configured: false }, { status: 503, headers: NO_STORE });
  }
  try {
    const events = await lookup();
    if (eventId) {
      const event = events?.byId.get(eventId);
      const ids = event ? [event.id, ...(event.properties.aliases ?? [])] : [eventId];
      const result = summarizeEvent(canonical(await listReports({ eventIds: ids }), events));
      const usgs = usgsFelt(event);
      if (!result && !event) return NextResponse.json({ error: "Sismo no encontrado" }, { status: 404, headers: { "Cache-Control": "public, s-maxage=60" } });
      const [lng, lat] = event?.geometry.coordinates ?? [0, 0];
      const body = result ?? {
        event: { id: event!.id, time: event!.properties.time, mag: event!.properties.mag, place: event!.properties.place, lat, lng, total: 0, yes: 0, no: 0, byIntensity: [0, 0, 0, 0], farthestKm: null },
        places: [],
        fetchedAt: new Date().toISOString(),
      };
      return NextResponse.json({ ...body, event: { ...body.event, ...usgs } }, { headers: { "Cache-Control": "public, max-age=15, s-maxage=30, stale-while-revalidate=60" } });
    }
    const dashboard = summarize(canonical(await listReports({ since: SINCE }), events), SINCE);
    // Se suman los sismos que solo tienen reportes en el USGS, para tener las dos fuentes en la misma lista.
    const listed = new Set(dashboard.events.map(item => item.id));
    const withUsgs: (EventSummary & { usgsFelt: number | null; usgsUrl: string | null })[] = dashboard.events.map(item => ({ ...item, ...usgsFelt(events?.byId.get(item.id)) }));
    for (const event of events?.list ?? []) {
      const usgs = usgsFelt(event);
      if (listed.has(event.id) || !usgs.usgsFelt) continue;
      const [lng, lat] = event.geometry.coordinates;
      withUsgs.push({ id: event.id, time: event.properties.time, mag: event.properties.mag, place: event.properties.place, lat, lng, total: 0, yes: 0, no: 0, byIntensity: [0, 0, 0, 0], farthestKm: null, ...usgs });
    }
    withUsgs.sort((a, b) => b.time - a.time);
    return NextResponse.json({ ...dashboard, events: withUsgs }, { headers: { "Cache-Control": "public, max-age=15, s-maxage=30, stale-while-revalidate=60" } });
  } catch (error) {
    console.error("[reportes] lectura:", error);
    return NextResponse.json({ error: "No se pudieron consultar los reportes." }, { status: 502, headers: NO_STORE });
  }
}

// Clave secreta para cifrar el identificador del dispositivo y de la conexión (HMAC): no se guarda la IP ni se puede recuperar.
function secret() {
  return process.env.REPORTS_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || (process.env.NODE_ENV !== "production" ? "solo-desarrollo" : null);
}

const hmac = (key: string, value: string) => createHmac("sha256", key).update(value).digest("base64url").slice(0, 32);

export async function POST(request: NextRequest) {
  // Solo desde esta misma página: un formulario de otro sitio no puede enviar reportes en nombre de quien lo visita.
  const origin = request.headers.get("origin");
  const originHost = (() => { try { return origin ? new URL(origin).host : null; } catch { return "inválido"; } })();
  if (origin && originHost !== request.headers.get("host")) {
    return NextResponse.json({ error: "Origen no permitido" }, { status: 403, headers: NO_STORE });
  }
  const input = parseReport(await readJsonObject(request, 1024));
  if (!input) return NextResponse.json({ error: "Reporte incompleto o no válido." }, { status: 400, headers: NO_STORE });
  const key = secret();
  if (!key || !reportsAvailable()) {
    return NextResponse.json({ error: "Los reportes aún no están disponibles." }, { status: 503, headers: NO_STORE });
  }
  try {
    let events = await lookup();
    if (!events) return NextResponse.json({ error: "No se pudo comprobar el sismo. Inténtalo en un momento." }, { status: 503, headers: NO_STORE });
    // El sismo tiene que existir en los catálogos: así nadie inventa sismos ni reporta en nombre de otro. Cada servidor guarda
    // su propia copia de los catálogos y el IGC cambia el id al revisar un sismo, así que la página puede ir unos segundos por
    // delante: se busca también el mismo sismo por hora y epicentro y, si es muy reciente, con los catálogos recién pedidos.
    const find = (from: Lookup) => {
      const byId = from.byId.get(input.eventId);
      if (byId || !input.hint) return byId;
      const { time, lat, lng } = input.hint;
      return from.list.find(item => {
        const [itemLng, itemLat] = item.geometry.coordinates;
        return Math.abs(item.properties.time - time) <= 60_000 && kmBetween(lat, lng, itemLat, itemLng) <= 120;
      });
    };
    let event = find(events);
    const veryRecent = input.hint && Date.now() - input.hint.time < 2 * 3_600_000;
    if (!event && veryRecent) {
      const fresh = await lookup(0);
      if (fresh) {
        events = fresh;
        event = find(fresh);
      }
    }
    if (!event) {
      return veryRecent
        ? NextResponse.json({ error: "Estamos confirmando el sismo con los catálogos.", code: "pending" }, { status: 404, headers: NO_STORE })
        : NextResponse.json({ error: "Ese sismo no está en la lista." }, { status: 404, headers: NO_STORE });
    }
    if (Date.now() - event.properties.time > REPORT_WINDOW_MS) {
      return NextResponse.json({ error: "Ese sismo es de hace más de 15 días: ya no se reciben reportes." }, { status: 410, headers: NO_STORE });
    }
    const ip = getClientIp(request);
    const agent = (request.headers.get("user-agent") ?? "").slice(0, 200);
    const day = new Date().toISOString().slice(0, 10);
    const [lng, lat] = event.geometry.coordinates;
    // Lo que no es creíble se guarda apartado y no se cuenta. A quien lo envía se le responde igual que siempre: así no sabe
    // qué filtro lo apartó ni cómo esquivarlo.
    const flagged = flagFor(input, { id: event.id, time: event.properties.time, mag: event.properties.mag, place: event.properties.place, lat, lng });
    const result = await insertReport({
      event_id: event.id,
      event_time: event.properties.time,
      event_mag: event.properties.mag,
      event_place: event.properties.place,
      event_lat: lat,
      event_lng: lng,
      felt: input.felt,
      intensity: input.intensity,
      place_id: input.placeId,
      created_at: new Date().toISOString(),
      reporter: hmac(key, `dispositivo|${ip}|${agent}`),
      ip_key: hmac(key, `conexion|${ip}|${day}`),
      flagged,
    });
    if (result === "duplicate") return NextResponse.json({ error: "Ya enviaste un reporte de este sismo. ¡Gracias!", duplicate: true }, { status: 409, headers: NO_STORE });
    if (result === "limited") return NextResponse.json({ error: "Se enviaron muchos reportes desde tu conexión. Inténtalo más tarde." }, { status: 429, headers: NO_STORE });
    if (result === "unavailable") return NextResponse.json({ error: "Los reportes aún no están disponibles." }, { status: 503, headers: NO_STORE });
    return NextResponse.json({ ok: true, eventId: event.id }, { status: 201, headers: NO_STORE });
  } catch (error) {
    console.error("[reportes] envío:", error);
    return NextResponse.json({ error: "No se pudo guardar tu reporte. Inténtalo de nuevo." }, { status: 500, headers: NO_STORE });
  }
}
