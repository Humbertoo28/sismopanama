import { REGION, isPanamaPlace, sameEvent, type Earthquake } from "./earthquakes";
import { isValidEarthquake, queryUsgs } from "./usgs";

// Un solo catálogo no basta. El USGS tarda en publicar los sismos medianos y no lista los pequeños; EMSC
// los publica antes, pero hoy un sismo de M 5 tardó ~30 minutos en aparecer allí, mientras el Instituto de
// Geociencias de la Universidad de Panamá (IGC), que opera la red sísmica nacional, lo publicó a los 3.
// Se consultan los tres y se combinan; si uno falla, los otros siguen sirviendo.
export type CatalogStatus = { usgs: boolean; igc: boolean; emsc: boolean };

type EmscProperties = {
  source_id?: string; time?: string; mag?: number; magtype?: string; depth?: number;
  lat?: number; lon?: number; flynn_region?: string; evtype?: string;
};

async function fetchUsgs(since: number): Promise<Earthquake[]> {
  const data = (await queryUsgs({
    starttime: new Date(since).toISOString(), orderby: "time", limit: "2000", ...REGION,
  })) as { features?: Earthquake[] } | null;
  return (data?.features ?? [])
    .filter(item => isValidEarthquake(item) && isPanamaPlace(item.properties.place))
    .map(item => ({ ...item, properties: { ...item.properties, source: "usgs" as const } }));
}

const IGC_URL = "https://sismosgeociencias.up.ac.pa/";
const IGC_MIN_INTERVAL_MS = 8_000;
// El IGC no tiene API: publica una tabla HTML de los últimos 7 días. Se lee con respeto: identificándonos,
// con caché condicional (ETag) y sin consultar más de una vez cada 8 s por instancia del servidor.
let igcCache: { at: number; etag: string | null; events: Earthquake[] } | null = null;

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

export function parseIgc(html: string): Earthquake[] {
  const events = new Map<string, Earthquake>();
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
    if (!isIgcPanamaEvent(place, lat, lon, mag)) continue;
    // Sin país en la etiqueta: se completa para que se lea igual que los demás ("Panamá a 33km al oeste de Tonosí").
    if (/^a\s+\d/i.test(place)) place = `Panamá ${place}`;
    const id = `igc:${Math.round(time / 1000)}`;
    const reviewed = /^REVISADO$/i.test(state);
    // El IGC a veces repite la misma fila: se conserva una, y la revisada si una de las dos lo está.
    if (events.has(id) && events.get(id)!.properties.status === "reviewed" && !reviewed) continue;
    events.set(id, {
      id,
      properties: {
        mag,
        place,
        time,
        url: IGC_URL,
        status: reviewed ? "reviewed" : "automatic",
        source: "igc",
      },
      geometry: { coordinates: [lon, lat, depth ? Number(depth[1]) : undefined] },
    });
  }
  return [...events.values()];
}

export async function fetchIgc(since: number): Promise<Earthquake[]> {
  const now = Date.now();
  if (igcCache && now - igcCache.at < IGC_MIN_INTERVAL_MS) return igcCache.events.filter(e => e.properties.time >= since);
  const headers: Record<string, string> = {
    Accept: "text/html",
    "User-Agent": "SismoPanama/1.0 (+https://sismopanama.vercel.app)",
  };
  if (igcCache?.etag) headers["If-None-Match"] = igcCache.etag;
  const response = await fetch(IGC_URL, { headers, signal: AbortSignal.timeout(15_000), cache: "no-store" });
  if (response.status === 304 && igcCache) {
    igcCache.at = now;
    return igcCache.events.filter(e => e.properties.time >= since);
  }
  if (!response.ok) throw new Error(`IGC respondió ${response.status}`);
  const html = await response.text();
  if (html.length > 3_000_000) throw new Error("Respuesta del IGC demasiado grande");
  const events = parseIgc(html);
  if (events.length === 0 && !/Listado de sismos/i.test(html)) throw new Error("La página del IGC cambió de formato");
  igcCache = { at: now, etag: response.headers.get("etag"), events };
  return events.filter(e => e.properties.time >= since);
}

async function fetchEmsc(since: number): Promise<Earthquake[]> {
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
    if (!isPanamaPlace(p.flynn_region)) return [];
    const lat = p.lat!;
    const lon = p.lon!;
    return [{
      id: `emsc:${p.source_id}`,
      properties: {
        mag: Number.isFinite(p.mag) ? p.mag! : null,
        place: `Panamá (${Math.abs(lat).toFixed(2)}°${lat >= 0 ? "N" : "S"}, ${Math.abs(lon).toFixed(2)}°${lon < 0 ? "O" : "E"})`,
        time,
        url: `https://www.emsc-csem.org/Earthquake_information/earthquake.php?id=${encodeURIComponent(p.source_id)}`,
        magType: p.magtype ? p.magtype[0].toUpperCase() + p.magtype.slice(1) : null,
        source: "emsc",
      },
      geometry: { coordinates: [lon, lat, Number.isFinite(p.depth) ? p.depth : undefined] },
    }];
  });
}

// Si el mismo sismo está en los dos catálogos se conserva el del USGS (trae profundidad revisada, alerta
// PAGER, reportes de "lo sentí"...) y se anota el id del otro en `aliases`, para que una alerta que ya
// se dio con el registro de EMSC no se repita cuando el USGS publique el suyo.
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
    return { ...event, properties: { ...event.properties, aliases: [...(event.properties.aliases ?? []), secondary[best].id] } };
  });
  const onlySecondary = secondary.filter((_, index) => !used.has(index));
  return [...merged, ...onlySecondary].sort((a, b) => b.properties.time - a.properties.time);
}

export async function fetchPanamaEvents(since: number): Promise<{ events: Earthquake[]; catalogs: CatalogStatus }> {
  const [usgs, igc, emsc] = await Promise.allSettled([fetchUsgs(since), fetchIgc(since), fetchEmsc(since)]);
  if (usgs.status === "rejected") console.error("USGS no disponible:", usgs.reason);
  if (igc.status === "rejected") console.error("IGC no disponible:", igc.reason);
  if (emsc.status === "rejected") console.error("EMSC no disponible:", emsc.reason);
  const [fromUsgs, fromIgc, fromEmsc] = [usgs, igc, emsc].map(result => result.status === "fulfilled" ? result.value : []);
  if (usgs.status === "rejected" && igc.status === "rejected" && emsc.status === "rejected") throw new Error("Ningún catálogo respondió");
  // Prioridad al elegir qué registro mostrar de un mismo sismo: USGS (revisión y datos adicionales), luego
  // IGC (red local, etiqueta del lugar) y por último EMSC.
  return {
    events: merge(merge(fromUsgs, fromIgc), fromEmsc),
    catalogs: { usgs: usgs.status === "fulfilled", igc: igc.status === "fulfilled", emsc: emsc.status === "fulfilled" },
  };
}
