import { kmBetween } from "./earthquakes";
import { DISTRICTS, PLACES, type Place } from "./places";
import { PROVINCE_BY_ID } from "./province-of";

// Reportes «¿Lo sentiste?» de las personas. No son una medición: son respuestas sin verificar, y así se presentan.
// Privacidad: de cada reporte solo se guarda la localidad que eligió la persona (de una lista: nunca su ubicación exacta) y
// un identificador cifrado para no contar dos veces el mismo dispositivo. Lo que se publica está siempre agrupado por localidad.

// Fuerza con que se sintió, en palabras de la vida diaria (equivale, a grandes rasgos, a la escala de Mercalli Modificada).
export const INTENSITIES = [
  { value: 1, name: "Leve", detail: "Lo noté, pero muchos no lo sintieron. Se movieron lámparas o cosas colgadas.", mmi: 3 },
  { value: 2, name: "Moderado", detail: "Lo sintió casi todo el mundo. Vibraron ventanas, puertas y platos.", mmi: 5 },
  { value: 3, name: "Fuerte", detail: "Costaba mantenerse de pie. Se cayeron objetos de los estantes.", mmi: 6 },
  { value: 4, name: "Muy fuerte", detail: "Hubo grietas o daños en casas o edificios.", mmi: 7 },
] as const;
export type Intensity = (typeof INTENSITIES)[number]["value"];

export const PLACE_INDEX = new Map<string, Place>(PLACES.map(place => [place.id, place]));

// Lo que llega del formulario, ya validado.
// `hint`: hora y epicentro del sismo tal como los ve la página. Solo sirven para encontrar el mismo sismo en el catálogo si su
// id cambió (el IGC lo revisa) o si el servidor todavía no lo tiene; los datos que se guardan siempre salen del catálogo.
export type EventHint = { time: number; lat: number; lng: number };
export type ReportInput = { eventId: string; felt: boolean; intensity: Intensity | null; placeId: string; hint?: EventHint };

function parseHint(value: unknown): EventHint | undefined {
  if (!value || typeof value !== "object") return undefined;
  const { time, lat, lng } = value as Record<string, unknown>;
  if (typeof time !== "number" || typeof lat !== "number" || typeof lng !== "number") return undefined;
  if (!Number.isFinite(time) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return undefined;
  return { time, lat, lng };
}

// Datos del sismo que el servidor guarda junto al reporte (los toma del catálogo, no de lo que manda el navegador).
export type ReportedEvent = { id: string; time: number; mag: number | null; place: string | null; lat: number; lng: number };

// Una fila guardada (sin el identificador del dispositivo, que nunca sale del servidor).
export type ReportRow = {
  event_id: string;
  event_time: number;
  event_mag: number | null;
  event_place: string | null;
  event_lat: number;
  event_lng: number;
  felt: boolean;
  intensity: number | null;
  place_id: string;
  created_at: string;
};

const EVENT_ID = /^(?:[a-z]{2}[0-9a-z]{6,12}|igc:\d{9,11}|emsc:[0-9A-Za-z_-]{4,40})$/;

export function parseReport(body: Record<string, unknown> | null): ReportInput | null {
  if (!body) return null;
  const { eventId, felt, intensity, placeId } = body;
  const hint = parseHint(body.hint);
  if (typeof eventId !== "string" || !EVENT_ID.test(eventId)) return null;
  if (typeof felt !== "boolean") return null;
  if (typeof placeId !== "string" || !PLACE_INDEX.has(placeId)) return null;
  if (!felt) return intensity === undefined || intensity === null ? { eventId, felt, intensity: null, placeId, hint } : null;
  if (typeof intensity !== "number" || !INTENSITIES.some(item => item.value === intensity)) return null;
  return { eventId, felt, intensity: intensity as Intensity, placeId, hint };
}

// ---------- Controles contra reportes falsos ----------
// El servidor no puede comprobar dónde estaba nadie (tampoco con el GPS, que lo entrega el propio navegador). Lo que sí puede
// es apartar lo que no es creíble: esos reportes se guardan, pero no se cuentan en lo que se publica.

// Solo se aceptan reportes de sismos de los últimos 15 días (incluye el sismo principal del 9 de octubre durante la emergencia).
export const REPORT_WINDOW_MS = 15 * 24 * 3_600_000;

// Hasta qué distancia es creíble que alguien sienta un sismo de esta magnitud, con margen amplio: unos 120 km para M 3,
// 480 km para M 5 y más de 2 000 km para M 7.7 (la sacudida fuerte llega a mucho menos: un tercio).
export function feltRadiusKm(mag: number) {
  return 60 * 2 ** (mag - 2);
}

// No se filtra por país de la conexión: el sitio pasa por Cloudflare y por redes móviles que salen por otros países, y ese
// filtro apartaba reportes reales de Panamá. Solo se aparta lo que no cuadra con la distancia y la magnitud del sismo.
export type Flag = "poco-creible";

export function flagFor(input: ReportInput, event: ReportedEvent): Flag | null {
  if (!input.felt || event.mag === null) return null;
  const place = PLACE_INDEX.get(input.placeId);
  if (!place) return null;
  const km = kmBetween(event.lat, event.lng, place.lat, place.lng);
  const reach = feltRadiusKm(event.mag);
  if (km > reach) return "poco-creible";
  if ((input.intensity ?? 0) >= 3 && km > reach / 3) return "poco-creible";
  return null;
}

// Localidad más cercana a un punto (el formulario la usa con el GPS: la posición no sale del teléfono, solo la localidad).
export function nearestPlace(lat: number, lng: number) {
  let best: { place: Place; km: number } | null = null;
  for (const place of PLACES) {
    const km = kmBetween(lat, lng, place.lat, place.lng);
    if (!best || km < best.km) best = { place, km };
  }
  return best;
}

export function placeTitle(place: Place) {
  const district = DISTRICTS[place.district]?.name;
  const province = PROVINCE_BY_ID.get(place.province)?.name;
  return [place.name, district && district !== place.name ? district : null, province].filter(Boolean).join(", ");
}

// ---------- Lo que se publica (siempre agregado) ----------

export type EventSummary = {
  id: string;
  time: number;
  mag: number | null;
  place: string | null;
  lat: number;
  lng: number;
  total: number;
  yes: number;
  no: number;
  // Reportes «lo sentí» por fuerza: [leve, moderado, fuerte, muy fuerte].
  byIntensity: [number, number, number, number];
  // Distancia (km) entre el epicentro y la localidad más lejana donde alguien lo sintió.
  farthestKm: number | null;
};

export type PlaceSummary = { id: string; name: string; label: string; lat: number; lng: number; yes: number; no: number; byIntensity: [number, number, number, number]; km: number };

export type ReportsDashboard = {
  since: number;
  totals: { reports: number; yes: number; no: number; events: number };
  events: EventSummary[];
  fetchedAt: string;
};

export type EventReports = { event: EventSummary; places: PlaceSummary[]; fetchedAt: string };

function emptySummary(row: ReportRow): EventSummary {
  return { id: row.event_id, time: Number(row.event_time), mag: row.event_mag === null ? null : Number(row.event_mag), place: row.event_place, lat: Number(row.event_lat), lng: Number(row.event_lng), total: 0, yes: 0, no: 0, byIntensity: [0, 0, 0, 0], farthestKm: null };
}

function add(summary: { yes: number; no: number; byIntensity: number[] }, row: ReportRow) {
  if (row.felt) {
    summary.yes++;
    const level = Number(row.intensity);
    if (level >= 1 && level <= 4) summary.byIntensity[level - 1]++;
  } else summary.no++;
}

export function summarize(rows: ReportRow[], since: number): ReportsDashboard {
  const events = new Map<string, EventSummary>();
  let yes = 0;
  for (const row of rows) {
    const summary = events.get(row.event_id) ?? emptySummary(row);
    events.set(row.event_id, summary);
    summary.total++;
    add(summary, row);
    if (row.felt) {
      yes++;
      const place = PLACE_INDEX.get(row.place_id);
      if (place) {
        const km = kmBetween(summary.lat, summary.lng, place.lat, place.lng);
        summary.farthestKm = Math.max(summary.farthestKm ?? 0, Math.round(km));
      }
    }
  }
  const list = [...events.values()].sort((a, b) => b.time - a.time);
  return { since, totals: { reports: rows.length, yes, no: rows.length - yes, events: list.length }, events: list, fetchedAt: new Date().toISOString() };
}

export function summarizeEvent(rows: ReportRow[]): EventReports | null {
  if (!rows.length) return null;
  const [event] = summarize(rows, 0).events;
  const places = new Map<string, PlaceSummary>();
  for (const row of rows) {
    const place = PLACE_INDEX.get(row.place_id);
    if (!place) continue;
    const summary = places.get(place.id) ?? { id: place.id, name: place.name, label: placeTitle(place), lat: place.lat, lng: place.lng, yes: 0, no: 0, byIntensity: [0, 0, 0, 0] as [number, number, number, number], km: Math.round(kmBetween(event.lat, event.lng, place.lat, place.lng)) };
    places.set(place.id, summary);
    add(summary, row);
  }
  return { event, places: [...places.values()].sort((a, b) => b.yes + b.no - (a.yes + a.no)), fetchedAt: new Date().toISOString() };
}

// Fuerza que más se repitió en una localidad (o null si nadie lo sintió allí).
export function typicalIntensity(byIntensity: readonly number[]) {
  let best = -1;
  byIntensity.forEach((count, index) => {
    if (count > 0 && (best < 0 || count >= byIntensity[best])) best = index;
  });
  return best < 0 ? null : INTENSITIES[best];
}
