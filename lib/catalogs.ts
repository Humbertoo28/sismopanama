import { REGION, isPanamaPlace, sameEvent, type Earthquake } from "./earthquakes";
import { isValidEarthquake, queryUsgs } from "./usgs";

// Un solo catálogo no basta. El USGS tarda en publicar los sismos medianos y no lista los pequeños; EMSC
// los publica antes, pero hoy un sismo de M 5 tardó ~30 minutos en aparecer allí, mientras el Instituto de
// Geociencias de la Universidad de Panamá (IGC), que opera la red sísmica nacional, lo publicó a los 3.
// Se consultan los tres y se combinan; si uno falla, los otros siguen sirviendo.
export type CatalogStatus = { usgs: boolean; igc: boolean; emsc: boolean };
// "panama": los sismos de Panamá (lo que usa toda la app: lista, alertas, conteos). "nearby": los de alrededor (Costa Rica,
// Colombia, mar abierto) dentro de la misma zona del mapa; solo se muestran si la persona enciende «Incluir alrededores».
export type Scope = "panama" | "nearby";

const inRegion = (lat: number, lon: number) =>
  lat >= Number(REGION.minlatitude) && lat <= Number(REGION.maxlatitude) && lon >= Number(REGION.minlongitude) && lon <= Number(REGION.maxlongitude);
// Región de EMSC (regiones de Flinn-Engdahl, en inglés y mayúsculas) en español: "PANAMA-COSTA RICA BORDER REGION" →
// "Frontera Panamá-Costa Rica", "SOUTH OF PANAMA" → "Al sur de Panamá".
const titleCase = (value: string) => value.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, gap: string, letter: string) => gap + letter.toUpperCase()).replace(/\bPanama\b/g, "Panamá");
const DIRECTION: Record<string, string> = { NORTH: "norte", SOUTH: "sur", EAST: "este", WEST: "oeste" };
function regionEs(region: string) {
  const upper = region.trim().toUpperCase();
  const border = /^(.+?)-(.+?) BORDER REGION$/.exec(upper);
  if (border) return `Frontera ${titleCase(border[1])}-${titleCase(border[2])}`;
  const side = /^(NORTH|SOUTH|EAST|WEST) OF (.+)$/.exec(upper);
  if (side) return `Al ${DIRECTION[side[1]]} de ${titleCase(side[2])}`;
  const coast = /^(?:OFF )?COAST OF (.+)$/.exec(upper);
  if (coast) return `Frente a la costa de ${titleCase(coast[1])}`;
  return titleCase(region);
}

type EmscProperties = {
  source_id?: string; time?: string; mag?: number; magtype?: string; depth?: number;
  lat?: number; lon?: number; flynn_region?: string; evtype?: string;
};

async function fetchUsgs(since: number, scope: Scope = "panama"): Promise<Earthquake[]> {
  const data = (await queryUsgs({
    starttime: new Date(since).toISOString(), orderby: "time", limit: "2000", ...REGION,
  })) as { features?: Earthquake[] } | null;
  return (data?.features ?? [])
    .filter(item => isValidEarthquake(item) && isPanamaPlace(item.properties.place) === (scope === "panama"))
    .map(item => ({ ...item, properties: { ...item.properties, source: "usgs" as const, ...(scope === "nearby" ? { nearby: true } : {}) } }));
}

const IGC_URL = "https://sismosgeociencias.up.ac.pa/";
const IGC_MIN_INTERVAL_MS = 4_000;
// El IGC no tiene API: publica una tabla HTML de los últimos 7 días. Se lee con respeto: identificándonos,
// con caché condicional (ETag) y sin consultar más de una vez cada 4 s por instancia del servidor.
let igcCache: { at: number; etag: string | null; events: Earthquake[]; nearby: Earthquake[] } | null = null;

const entities: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };
const text = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/&(amp|lt|gt|quot|#39|nbsp);/g, m => entities[m]).replace(/\s+/g, " ").trim();

// Hora local de Panamá (UTC−5, sin horario de verano): "2026-10-09" + "3:54:56PM".
function igcTime(date: string, clock: string) {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)$/i.exec(clock);
  if (!d || !t) return NaN;
  const hour = (Number(t[1]) % 12) + (t[4].toUpperCase() === "PM" ? 12 : 0);
  return Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), hour + 5, Number(t[2]), Number(t[3]));
}

// Un sismo del IGC es de Panamá si su etiqueta lo dice, pero la etiqueta no es fiable: a veces el IGC la escribe sin
// país ("Localizado en a 33km al oeste de Tonosí"), y esos sismos, de M 4+ dentro de la secuencia del terremoto, se
// descartaban hasta que el USGS o el EMSC publicaban el mismo sismo minutos después. Reglas, de la más a la menos clara:
//  - dice Panamá y no nombra otro país: es de Panamá;
//  - "Región Fronteriza Panamá-…" con M 3 o más: se siente en Panamá (los de M menor son ruido del otro lado);
//  - sin ningún país y dentro del territorio panameño (la posición sí es fiable): es de Panamá;
//  - nombra Costa Rica, Colombia u otro lugar, o cae fuera: no.
const IGC_BORDER = /Regi[oó]n Fronteriza\s+Panam[aá]/i;
const IGC_FOREIGN = /Costa Rica|Colombia|Nicaragua|Ecuador|Centroam[eé]rica|Pac[ií]fico|Caribe|Océano|Oceano/i;
export function isIgcPanamaEvent(place: string, lat: number, lon: number, mag: number) {
  if (IGC_BORDER.test(place)) return mag >= 3;
  if (isPanamaPlace(place)) return true;
  if (IGC_FOREIGN.test(place)) return false;
  // Sin país en la etiqueta: se decide por la posición (a esta latitud, más al oeste de -83° ya es Costa Rica).
  return lat >= 6 && lat <= 10.7 && lon >= -83 && lon <= -77;
}

// Sismos de Panamá de la tabla del IGC.
export function parseIgc(html: string): Earthquake[] {
  return parseIgcAll(html).panama;
}

// Los de Panamá y, aparte, los de alrededor (dentro de la zona del mapa).
export function parseIgcAll(html: string): { panama: Earthquake[]; nearby: Earthquake[] } {
  const events = new Map<string, Earthquake>();
  const nearby = new Map<string, Earthquake>();
  for (const row of html.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(match => text(match[1]));
    if (cells.length < 8) continue;
    const [state, date, clock, latText, lonText, depthText, magText, region] = cells;
    const time = igcTime(date, clock);
    const lat = Number(latText);
    const lon = Number(lonText);
    const mag = Number(magText);
    const depth = /^(\d+(?:\.\d+)?)\s*km$/i.exec(depthText);
    // Se valida todo: lo que llega de una página ajena nunca se da por bueno sin comprobarlo.
    if (!Number.isFinite(time) || !(lat > 4 && lat < 12) || !(lon > -86 && lon < -75) || !(mag >= 0 && mag < 10)) continue;
    let place = region.replace(/^Localizado en\s+/i, "").slice(0, 120);
    const isPanama = isIgcPanamaEvent(place, lat, lon, mag);
    if (!isPanama && !inRegion(lat, lon)) continue;
    const target = isPanama ? events : nearby;
    // Sin país en la etiqueta: se completa para que se lea igual que los demás ("Panamá a 33km al oeste de Tonosí").
    if (/^a\s+\d/i.test(place)) place = `Panamá ${place}`;
    const id = `igc:${Math.round(time / 1000)}`;
    const reviewed = /^REVISADO$/i.test(state);
    // El IGC a veces repite la misma fila: se conserva una, y la revisada si una de las dos lo está.
    if (target.has(id) && target.get(id)!.properties.status === "reviewed" && !reviewed) continue;
    target.set(id, {
      id,
      properties: {
        mag,
        place,
        time,
        url: IGC_URL,
        status: reviewed ? "reviewed" : "automatic",
        source: "igc",
        ...(isPanama ? {} : { nearby: true }),
      },
      geometry: { coordinates: [lon, lat, depth ? Number(depth[1]) : undefined] },
    });
  }
  return { panama: [...events.values()], nearby: [...nearby.values()] };
}

export async function fetchIgc(since: number, scope: Scope = "panama"): Promise<Earthquake[]> {
  const pick = (cache: NonNullable<typeof igcCache>) => (scope === "panama" ? cache.events : cache.nearby).filter(e => e.properties.time >= since);
  const now = Date.now();
  if (igcCache && now - igcCache.at < IGC_MIN_INTERVAL_MS) return pick(igcCache);
  const headers: Record<string, string> = {
    Accept: "text/html",
    "User-Agent": "OjoPanama/1.0 (+https://www.ojopanama.com)",
  };
  if (igcCache?.etag) headers["If-None-Match"] = igcCache.etag;
  const response = await fetch(IGC_URL, { headers, signal: AbortSignal.timeout(15_000), cache: "no-store" });
  if (response.status === 304 && igcCache) {
    igcCache.at = now;
    return pick(igcCache);
  }
  if (!response.ok) throw new Error(`IGC respondió ${response.status}`);
  const html = await response.text();
  if (html.length > 3_000_000) throw new Error("Respuesta del IGC demasiado grande");
  const { panama, nearby } = parseIgcAll(html);
  if (panama.length === 0 && !/Listado de sismos/i.test(html)) throw new Error("La página del IGC cambió de formato");
  igcCache = { at: now, etag: response.headers.get("etag"), events: panama, nearby };
  return pick(igcCache);
}

// Sismos que un catálogo publicó y la institución local desmintió: no se muestran ni se cuentan ni se avisan, en ningún lugar de
// la web (todo sale de estas consultas). Cada uno lleva su motivo; no se agrega nada sin una razón comprobable.
//  - emsc:2074346 — «M 4.0» de las 16:25 del 13 de octubre de 2026 cerca de Juan Díaz (solo EMSC, autor UNA). El IGC lo desmintió;
//    su tabla y la del USGS no lo tienen y 87 s antes hubo un M 4.8 profundo en el norte de Colombia (probable falsa asociación).
const RETRACTED_EVENTS = new Set(["emsc:2074346"]);

// Sismos que el IGC publicó por otro medio (su canal oficial de Telegram) mientras su tabla no responde («Estamos en mantenimiento»):
// se agregan a mano, uno por uno, con lo que el propio IGC publicó, que es lo que dicen los mensajes que mostró quien administra el sitio:
// estado (REVISADO o PRELIMINAR), fecha y hora local, magnitud, profundidad y «localizado en Panamá a N km al <rumbo> de <lugar>».
// Esos mensajes no traen coordenadas: la posición es la que sale de ese rumbo y esa distancia contados desde el lugar de referencia (su
// punto de GeoNames), es decir, APROXIMADA: el IGC da el rumbo en ocho direcciones y la distancia redondeada (varios km de diferencia).
// Si la tabla del IGC ya trae el mismo sismo (menos de un minuto y 120 km de diferencia) se usa el de la tabla y este se descarta;
// cuando el IGC vuelva a responder se borra esta lista. Con `silent` el sismo se agrega sin avisarlo (ver `noAlert` en earthquakes.ts).
const COMPASS: Record<string, number> = { norte: 0, noreste: 45, este: 90, sureste: 135, sur: 180, suroeste: 225, oeste: 270, noroeste: 315 };
// Puntos de referencia (GeoNames; Coiba es el de lib/places.ts).
const REFERENCE_POINTS: Record<string, { lat: number; lng: number }> = {
  "Las Tablas": { lat: 7.766, lng: -80.278 },
  "Soná": { lat: 8.009, lng: -81.317 },
  "Tonosí": { lat: 7.407, lng: -80.439 },
  "Coiba": { lat: 7.503, lng: -81.695 },
};
type ManualIgc = { local: string; mag: number; depth: number; reviewed: boolean; km: number; dir: keyof typeof COMPASS; from: keyof typeof REFERENCE_POINTS; silent?: boolean };
const MANUAL_IGC: ManualIgc[] = [
  // 15 de octubre, 8:31:37 a. m.: PRELIMINAR, M 4.9, 10 km, «a 29km al sureste de Las Tablas». Se avisó (alerta push enviada a las 8:50 a. m.).
  { local: "2026-10-15T08:31:37-05:00", mag: 4.9, depth: 10, reviewed: false, km: 29, dir: "sureste", from: "Las Tablas" },
  // 15 de octubre, 9:02:49 a. m.: PRELIMINAR, M 3.7, 10 km, «a 38km al este de Coiba». Se agrega CON aviso (a pedido de quien administra el sitio).
  { local: "2026-10-15T09:02:49-05:00", mag: 3.7, depth: 10, reviewed: false, km: 38, dir: "este", from: "Coiba" },
  // Mensajes del canal del IGC del 14 y 15 de octubre mostrados el 15 de octubre a las 9 a. m.; se agregan sin avisar.
  { local: "2026-10-15T07:48:28-05:00", mag: 3.5, depth: 12, reviewed: true, km: 29, dir: "sur", from: "Soná", silent: true },
  { local: "2026-10-15T06:59:03-05:00", mag: 3.6, depth: 13, reviewed: true, km: 33, dir: "noreste", from: "Coiba", silent: true },
  { local: "2026-10-15T06:03:17-05:00", mag: 3.8, depth: 20, reviewed: true, km: 33, dir: "suroeste", from: "Soná", silent: true },
  { local: "2026-10-15T01:24:40-05:00", mag: 3.7, depth: 10, reviewed: false, km: 34, dir: "noroeste", from: "Tonosí", silent: true },
  { local: "2026-10-15T00:38:15-05:00", mag: 3.4, depth: 10, reviewed: false, km: 31, dir: "sur", from: "Soná", silent: true },
  { local: "2026-10-15T00:15:44-05:00", mag: 3.7, depth: 10, reviewed: false, km: 15, dir: "noreste", from: "Tonosí", silent: true },
  { local: "2026-10-14T23:03:04-05:00", mag: 4.5, depth: 10, reviewed: false, km: 18, dir: "noroeste", from: "Tonosí", silent: true },
  { local: "2026-10-14T22:58:21-05:00", mag: 3.7, depth: 10, reviewed: false, km: 33, dir: "este", from: "Coiba", silent: true },
];

export const MANUAL_IGC_EVENTS: Earthquake[] = MANUAL_IGC.map(item => {
  const time = Date.parse(item.local);
  const ref = REFERENCE_POINTS[item.from];
  const bearing = (COMPASS[item.dir] * Math.PI) / 180;
  const lat = ref.lat + (item.km * Math.cos(bearing)) / 110.57;
  const lng = ref.lng + (item.km * Math.sin(bearing)) / (111.32 * Math.cos((ref.lat * Math.PI) / 180));
  return {
    id: `igc:${Math.round(time / 1000)}`,
    properties: {
      mag: item.mag,
      place: `Panamá a ${item.km}km al ${item.dir} de ${item.from}`,
      time,
      url: IGC_URL,
      status: item.reviewed ? ("reviewed" as const) : ("automatic" as const),
      source: "igc" as const,
      ...(item.silent ? { noAlert: true } : {}),
    },
    geometry: { coordinates: [Number(lng.toFixed(3)), Number(lat.toFixed(3)), item.depth] as [number, number, number] },
  };
});

export function withManualIgc(fromIgc: Earthquake[], since: number): Earthquake[] {
  const missing = MANUAL_IGC_EVENTS.filter(manual => manual.properties.time >= since && !fromIgc.some(real => sameEvent(real, manual)));
  return missing.length ? [...fromIgc, ...missing] : fromIgc;
}

async function fetchEmsc(since: number, scope: Scope = "panama"): Promise<Earthquake[]> {
  const query = new URLSearchParams({
    format: "json", orderby: "time", limit: "2000", starttime: new Date(since).toISOString().slice(0, 19), ...REGION,
  });
  const response = await fetch(`https://www.seismicportal.eu/fdsnws/event/1/query?${query}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (response.status === 204) return [];
  if (!response.ok) throw new Error(`EMSC respondió ${response.status}`);
  const data = (await response.json()) as { features?: { properties?: EmscProperties }[] };
  return (data.features ?? []).flatMap((item): Earthquake[] => {
    const p = item.properties;
    const time = Date.parse(p?.time ?? "");
    if (!p?.source_id || !Number.isFinite(time) || !Number.isFinite(p.lat) || !Number.isFinite(p.lon)) return [];
    if (p.evtype && p.evtype !== "ke") return []; // solo sismos conocidos, no explosiones ni otros eventos
    if (RETRACTED_EVENTS.has(`emsc:${p.source_id}`)) return [];
    if (isPanamaPlace(p.flynn_region) !== (scope === "panama")) return [];
    const lat = p.lat!;
    const lon = p.lon!;
    const coords = `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? "N" : "S"}, ${Math.abs(lon).toFixed(2)}°${lon < 0 ? "O" : "E"}`;
    return [{
      id: `emsc:${p.source_id}`,
      properties: {
        mag: Number.isFinite(p.mag) ? p.mag! : null,
        place: scope === "panama" ? `Panamá (${coords})` : `${p.flynn_region ? regionEs(p.flynn_region) : "Fuera de Panamá"} (${coords})`,
        time,
        url: `https://www.emsc-csem.org/Earthquake_information/earthquake.php?id=${encodeURIComponent(p.source_id)}`,
        magType: p.magtype ? p.magtype[0].toUpperCase() + p.magtype.slice(1) : null,
        source: "emsc",
        ...(scope === "nearby" ? { nearby: true } : {}),
      },
      geometry: { coordinates: [lon, lat, Number.isFinite(p.depth) ? p.depth : undefined] },
    }];
  });
}

// Si el mismo sismo está en los dos catálogos se conserva el del USGS (trae profundidad revisada, alerta
// PAGER, reportes de "lo sentí"...) y se anota el id del otro en `aliases`, para que una alerta que ya
// se dio con el registro de EMSC no se repita cuando el USGS publique el suyo.
const reportOf = (event: Earthquake) => ({ source: event.properties.source ?? "usgs", mag: event.properties.mag, magType: event.properties.magType ?? null });
function merge(primary: Earthquake[], secondary: Earthquake[]) {
  const used = new Set<number>();
  const merged = primary.map(event => {
    let best = -1;
    let bestGap = Infinity;
    secondary.forEach((other, index) => {
      const gap = Math.abs(event.properties.time - other.properties.time);
      if (!used.has(index) && gap < bestGap && sameEvent(event, other)) {
        best = index;
        bestGap = gap;
      }
    });
    if (best < 0) return event;
    used.add(best);
    return {
      ...event,
      properties: {
        ...event.properties,
        aliases: [...(event.properties.aliases ?? []), secondary[best].id],
        agencies: [...(event.properties.agencies ?? [reportOf(event)]), reportOf(secondary[best])],
        // Un sismo agregado a mano sin avisar sigue sin avisarse aunque otro catálogo lo publique después.
        ...(event.properties.noAlert || secondary[best].properties.noAlert ? { noAlert: true } : {}),
      },
    };
  });
  const onlySecondary = secondary.filter((_, index) => !used.has(index));
  return [...merged, ...onlySecondary].sort((a, b) => b.properties.time - a.properties.time);
}

export async function fetchPanamaEvents(since: number): Promise<{ events: Earthquake[]; catalogs: CatalogStatus }> {
  const [usgs, igc, emsc] = await Promise.allSettled([fetchUsgs(since), fetchIgc(since), fetchEmsc(since)]);
  if (usgs.status === "rejected") console.error("USGS no disponible:", usgs.reason);
  if (igc.status === "rejected") console.error("IGC no disponible:", igc.reason);
  if (emsc.status === "rejected") console.error("EMSC no disponible:", emsc.reason);
  const [fromUsgs, igcRows, fromEmsc] = [usgs, igc, emsc].map(result => result.status === "fulfilled" ? result.value : []);
  const fromIgc = withManualIgc(igcRows, since);
  if (usgs.status === "rejected" && igc.status === "rejected" && emsc.status === "rejected") throw new Error("Ningún catálogo respondió");
  // Prioridad al elegir qué registro mostrar de un mismo sismo: USGS (revisión y datos adicionales), luego
  // IGC (red local, etiqueta del lugar) y por último EMSC.
  return {
    events: merge(merge(fromUsgs, fromIgc), fromEmsc),
    catalogs: { usgs: usgs.status === "fulfilled", igc: igc.status === "fulfilled", emsc: emsc.status === "fulfilled" },
  };
}

// Sismos de los alrededores de Panamá (Costa Rica, Colombia, mar abierto) dentro de la zona del mapa, combinados igual que
// los de Panamá. No los usa nada más que la lista y el mapa cuando se pide «Incluir alrededores»: ni alertas ni conteos.
export async function fetchNearbyEvents(since: number): Promise<{ events: Earthquake[]; catalogs: CatalogStatus }> {
  const [usgs, igc, emsc] = await Promise.allSettled([fetchUsgs(since, "nearby"), fetchIgc(since, "nearby"), fetchEmsc(since, "nearby")]);
  if (usgs.status === "rejected" && igc.status === "rejected" && emsc.status === "rejected") throw new Error("Ningún catálogo respondió");
  const [fromUsgs, fromIgc, fromEmsc] = [usgs, igc, emsc].map(result => result.status === "fulfilled" ? result.value : []);
  return {
    events: merge(merge(fromUsgs, fromIgc), fromEmsc),
    catalogs: { usgs: usgs.status === "fulfilled", igc: igc.status === "fulfilled", emsc: emsc.status === "fulfilled" },
  };
}

// Sismos de la secuencia ya combinados, guardados unos segundos por instancia del servidor: los reportes «¿Lo sentiste?»
// los consultan para comprobar que el sismo existe y para agrupar los registros de un mismo sismo, sin pedir los tres
// catálogos en cada envío.
let recent: { at: number; since: number; events: Promise<Earthquake[]> } | null = null;
export function recentPanamaEvents(since: number, maxAgeMs = 20_000): Promise<Earthquake[]> {
  const now = Date.now();
  if (!recent || recent.since !== since || now - recent.at > maxAgeMs) {
    const events = fetchPanamaEvents(since).then(result => result.events);
    recent = { at: now, since, events };
    // Si falla, la próxima consulta lo vuelve a intentar.
    events.catch(() => { if (recent?.events === events) recent = null; });
  }
  return recent.events;
}
