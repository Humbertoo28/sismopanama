import { REGION, SINCE, isPanamaPlace, kmBetween } from "./earthquakes";

// Contexto histórico: los sismos grandes que el catálogo del USGS ubica en Panamá desde 1900. Todo sale de los registros
// (conteos, máximos, orden); no hay modelos, estimaciones ni textos generados. La página muestra además de dónde sale.

export const HISTORY_MIN_MAG = 6;
export const HISTORY_START = "1900-01-01";
export const HISTORY_REVALIDATE_SECONDS = 1800;

export type HistoricQuake = {
  id: string;
  time: number;
  mag: number;
  magType: string | null;
  place: string;
  lat: number;
  lng: number;
  depth: number | null;
  // Pertenece a la secuencia actual (desde el 9 de octubre de 2026).
  current: boolean;
  // Página del sismo en el USGS (solo si el enlace es del propio sitio del USGS).
  url: string | null;
  // Lo que el USGS publica de sus productos: intensidad máxima de su ShakeMap (mmi) y reportes del «¿Lo sentiste?» (felt y cdi). null = no hay.
  mmi: number | null;
  felt: number | null;
  cdi: number | null;
};

type GeoFeature = {
  id?: unknown;
  properties?: { time?: unknown; mag?: unknown; magType?: unknown; place?: unknown; url?: unknown; mmi?: unknown; felt?: unknown; cdi?: unknown };
  geometry?: { coordinates?: unknown };
};

export function historyUrl() {
  const params = new URLSearchParams({
    format: "geojson",
    starttime: HISTORY_START,
    minmagnitude: String(HISTORY_MIN_MAG),
    minlatitude: REGION.minlatitude,
    maxlatitude: REGION.maxlatitude,
    minlongitude: REGION.minlongitude,
    maxlongitude: REGION.maxlongitude,
    orderby: "time-asc",
    limit: "1000",
  });
  return `https://earthquake.usgs.gov/fdsnws/event/1/query?${params}`;
}

const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

// Separa lo que el USGS ubica en Panamá de lo que cae en el mismo recuadro pero está en Costa Rica, Colombia u otro lugar:
// con la regla del resto del sitio (la etiqueta del lugar), no con un contorno geográfico.
export function parseHistory(data: unknown): { panama: HistoricQuake[]; excluded: HistoricQuake[] } {
  const features = (data as { features?: GeoFeature[] } | null)?.features;
  const panama: HistoricQuake[] = [];
  const excluded: HistoricQuake[] = [];
  if (!Array.isArray(features)) return { panama, excluded };
  for (const item of features) {
    const p = item?.properties;
    const c = item?.geometry?.coordinates;
    if (typeof item?.id !== "string" || !p || !isNumber(p.time) || !isNumber(p.mag) || typeof p.place !== "string") continue;
    if (!Array.isArray(c) || !isNumber(c[0]) || !isNumber(c[1])) continue;
    const quake: HistoricQuake = {
      id: item.id,
      time: p.time,
      mag: p.mag,
      magType: typeof p.magType === "string" ? p.magType : null,
      place: p.place,
      lat: c[1],
      lng: c[0],
      depth: isNumber(c[2]) ? c[2] : null,
      current: p.time >= SINCE,
      url: typeof p.url === "string" && p.url.startsWith("https://earthquake.usgs.gov/") ? p.url : null,
      mmi: isNumber(p.mmi) ? p.mmi : null,
      felt: isNumber(p.felt) ? p.felt : null,
      cdi: isNumber(p.cdi) ? p.cdi : null,
    };
    (isPanamaPlace(p.place) ? panama : excluded).push(quake);
  }
  const byTime = (a: HistoricQuake, b: HistoricQuake) => a.time - b.time;
  return { panama: panama.sort(byTime), excluded: excluded.sort(byTime) };
}

export type HistorySummary = {
  total: number;
  firstYear: number;
  m7plus: number;
  m65to69: number;
  m6to64: number;
  top: HistoricQuake[];
  decades: Decade[];
  // El mayor de la secuencia actual, su lugar en el orden por magnitud (1 = el mayor de la lista) y los datos para compararlo.
  mainshock: HistoricQuake | null;
  rank: number | null;
  previousLargest: HistoricQuake | null;
  previousM7: HistoricQuake | null;
  currentSequence: number;
  excludedCount: number;
  excludedLargest: HistoricQuake | null;
};

const byMagnitude = (a: HistoricQuake, b: HistoricQuake) => b.mag - a.mag || b.time - a.time;

export type Decade = { decade: number; count: number; max: number };

// Cuántos sismos y cuál fue el mayor en cada década, sin dejar décadas vacías en medio (cuentan 0).
export function decadeSeries(quakes: HistoricQuake[]): Decade[] {
  const decades = new Map<number, { count: number; max: number }>();
  for (const quake of quakes) {
    const decade = Math.floor(new Date(quake.time).getUTCFullYear() / 10) * 10;
    const entry = decades.get(decade) ?? { count: 0, max: 0 };
    decades.set(decade, { count: entry.count + 1, max: Math.max(entry.max, quake.mag) });
  }
  if (!decades.size) return [];
  const series: Decade[] = [];
  for (let decade = Math.min(...decades.keys()); decade <= Math.max(...decades.keys()); decade += 10) series.push({ decade, ...(decades.get(decade) ?? { count: 0, max: 0 }) });
  return series;
}

export function buildHistory(panama: HistoricQuake[], excluded: HistoricQuake[], topCount = 12): HistorySummary {
  const sorted = [...panama].sort(byMagnitude);
  const before = panama.filter(q => !q.current);
  const current = panama.filter(q => q.current);
  const mainshock = [...current].sort(byMagnitude)[0] ?? null;
  return {
    total: panama.length,
    firstYear: panama.length ? new Date(panama[0].time).getUTCFullYear() : new Date(HISTORY_START).getUTCFullYear(),
    m7plus: panama.filter(q => q.mag >= 7).length,
    m65to69: panama.filter(q => q.mag >= 6.5 && q.mag < 7).length,
    m6to64: panama.filter(q => q.mag < 6.5).length,
    top: sorted.slice(0, topCount),
    decades: decadeSeries(panama),
    mainshock,
    rank: mainshock ? panama.filter(q => q.mag > mainshock.mag).length + 1 : null,
    previousLargest: [...before].sort(byMagnitude)[0] ?? null,
    previousM7: [...before].filter(q => q.mag >= 7).sort((a, b) => b.time - a.time)[0] ?? null,
    currentSequence: current.length,
    excludedCount: excluded.length,
    excludedLargest: [...excluded].sort(byMagnitude)[0] ?? null,
  };
}

// El USGS escribe el lugar en inglés ("44 km ESE of Burica, Panama"). Se pasa al español con la misma estructura y las
// abreviaturas de rumbo de siempre (el oeste es "O", no "W"): "44 km ESE de Burica, Panamá".
const COMPASS_WORDS: Record<string, string> = { north: "norte", south: "sur", east: "este", west: "oeste" };
export function placeEs(place: string) {
  const text = place.trim();
  const km = /^(\d+)\s*km\s+([NSEW]{1,3})\s+of\s+(.+)$/i.exec(text);
  const word = /^(north|south|east|west)\s+of\s+(.+)$/i.exec(text);
  const translated = km
    ? `${km[1]} km ${km[2].toUpperCase().replace(/W/g, "O")} de ${km[3]}`
    : word
      ? `${COMPASS_WORDS[word[1].toLowerCase()].replace(/^./, c => c.toUpperCase())} de ${word[2]}`
      : text;
  return translated.replace(/Panama$/, "Panamá");
}

// La magnitud con la precisión que publica el USGS: un decimal, o dos cuando los datos los traen (6.96, 7.18). Redondear a
// uno haría que un 6.96 se leyera "7.0" y no cuadrara con el conteo de sismos de M 7 o más.
export function formatMag(mag: number) {
  return Math.abs(mag * 10 - Math.round(mag * 10)) < 1e-9 ? mag.toFixed(1) : mag.toFixed(2);
}

// Fechas en hora universal, como las publica el USGS: es la fecha que traen todas las referencias (en hora de Panamá, algunos
// sismos ocurrieron la noche anterior).
const dateUTC = new Intl.DateTimeFormat("es-PA", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" });
export function formatDateUTC(time: number) {
  return dateUTC.format(new Date(time));
}


// ---- Lo que usa la página interactiva. Todo sale de los registros: fechas, conteos y distancias entre posiciones publicadas. ----

export type Era = "e1" | "e2" | "e3" | "now";
export function eraOf(quake: HistoricQuake): Era {
  if (quake.current) return "now";
  const year = new Date(quake.time).getUTCFullYear();
  return year < 1950 ? "e1" : year < 2000 ? "e2" : "e3";
}

export const yearOf = (time: number) => new Date(time).getUTCFullYear();

// Años cumplidos entre dos fechas (en hora universal): del 20 de enero de 1904 al 9 de octubre de 2026 son 122.
export function yearsBetween(from: number, to: number) {
  const a = new Date(from);
  const b = new Date(to);
  let years = b.getUTCFullYear() - a.getUTCFullYear();
  if (b.getUTCMonth() < a.getUTCMonth() || (b.getUTCMonth() === a.getUTCMonth() && b.getUTCDate() < a.getUTCDate())) years -= 1;
  return years;
}

// El puesto de cada sismo por magnitud (1 = el mayor de la lista), con el mismo desempate que la tabla: a igual magnitud, el más reciente.
export function rankById(quakes: HistoricQuake[]) {
  return new Map([...quakes].sort(byMagnitude).map((quake, index) => [quake.id, index + 1] as const));
}

export type HistoryFilter = { minMag: number; from: number; to: number };
// Los sismos de magnitud `minMag` o más cuyo año (UTC) cae entre `from` y `to`, ambos incluidos.
export function filterQuakes(quakes: HistoricQuake[], { minMag, from, to }: HistoryFilter) {
  return quakes.filter(quake => quake.mag >= minMag && yearOf(quake.time) >= from && yearOf(quake.time) <= to);
}

const dayKey = (time: number) => new Date(time).toISOString().slice(0, 10);
// Los otros sismos de la lista que ocurrieron el mismo día (UTC).
export function sameDay(quake: HistoricQuake, all: HistoricQuake[]) {
  return all.filter(other => other.id !== quake.id && dayKey(other.time) === dayKey(quake.time)).sort((a, b) => a.time - b.time);
}

// Cuántos sismos de la lista (contando el propio) tienen su posición publicada a `km` kilómetros o menos de la de `quake`.
export function withinKm(quake: HistoricQuake, all: HistoricQuake[], km: number) {
  return all.filter(other => other.id === quake.id || kmBetween(quake.lat, quake.lng, other.lat, other.lng) <= km).length;
}

export const distanceKm = (a: HistoricQuake, b: HistoricQuake) => kmBetween(a.lat, a.lng, b.lat, b.lng);

// Los de M 7 o más en orden de fecha, cada uno con los años cumplidos desde el anterior (null en el primero).
export function m7Gaps(quakes: HistoricQuake[]) {
  const big = quakes.filter(quake => quake.mag >= 7).sort((a, b) => a.time - b.time);
  return big.map((quake, index) => ({ quake, years: index === 0 ? null : yearsBetween(big[index - 1].time, quake.time) }));
}
