import { type Earthquake } from "./earthquakes";

// Cálculos del panel /analisis. Solo trabajan con sismos que los catálogos (USGS, IGC, EMSC) ya publicaron: conteos,
// máximos, medianas y agrupaciones. No hay modelos, pronósticos ni estimaciones: lo que se muestra es lo que se registró.
// Funciones puras (sin red ni DOM) para poder probarlas con datos sintéticos.

export const MINUTE = 60_000;
export const HOUR = 3_600_000;
export const DAY = 86_400_000;
const PANAMA_OFFSET = 5 * HOUR; // Panamá es UTC−5 todo el año

export type Source = "usgs" | "igc" | "emsc";
export const SOURCES: Source[] = ["usgs", "igc", "emsc"];

export type Quake = {
  id: string;
  time: number;
  mag: number;
  depth: number | null;
  lat: number;
  lng: number;
  place: string;
  source: Source;
  url: string | null;
};

// Los sismos sin magnitud publicada no se pueden ordenar ni agrupar por magnitud: el panel los deja fuera y lo avisa.
export function toQuakes(events: Earthquake[]): Quake[] {
  return events.flatMap((event): Quake[] => {
    const { mag, time, place, source, url } = event.properties;
    const [lng, lat, depth] = event.geometry.coordinates;
    if (mag === null || !Number.isFinite(mag) || !Number.isFinite(time) || !Number.isFinite(lat) || !Number.isFinite(lng)) return [];
    return [{
      id: event.id, time, mag, lat, lng,
      depth: Number.isFinite(depth) ? depth! : null,
      place: place || "Ubicación no especificada",
      source: source ?? "usgs",
      url: url ?? null,
    }];
  });
}

// ---------- filtros ----------

export type WindowKey = "1h" | "6h" | "24h" | "7d" | "all";
export const WINDOWS: { key: WindowKey; label: string; ms: number }[] = [
  { key: "1h", label: "1 h", ms: HOUR },
  { key: "6h", label: "6 h", ms: 6 * HOUR },
  { key: "24h", label: "24 h", ms: DAY },
  { key: "7d", label: "7 d", ms: 7 * DAY },
  { key: "all", label: "Todo", ms: Infinity },
];

export type Filters = { window: WindowKey; minMag: number; sources: Source[] };
export const DEFAULT_FILTERS: Filters = { window: "all", minMag: 0, sources: SOURCES };

export function windowStart(key: WindowKey, now: number, earliest: number) {
  const ms = WINDOWS.find((item) => item.key === key)?.ms ?? Infinity;
  return Number.isFinite(ms) ? now - ms : earliest;
}

// `sequenceStart`: dónde empieza "Todo" (por defecto, el sismo más antiguo). El panel lo fija un poco antes del sismo
// principal para que un sismo suelto de días anteriores no estire el gráfico.
export function filterQuakes(quakes: Quake[], filters: Filters, now: number, sequenceStart?: number): Quake[] {
  const earliest = sequenceStart ?? quakes.reduce((min, quake) => Math.min(min, quake.time), now);
  const from = windowStart(filters.window, now, earliest);
  return quakes.filter((quake) => quake.time >= from && quake.mag >= filters.minMag && filters.sources.includes(quake.source));
}

// ---------- series ----------

const BUCKETS = [5 * MINUTE, 15 * MINUTE, 30 * MINUTE, HOUR, 3 * HOUR, 6 * HOUR, 12 * HOUR, DAY];

// El intervalo más fino que deja el gráfico en ~48 barras como máximo.
export function pickBucket(spanMs: number) {
  return BUCKETS.find((size) => spanMs / size <= 48) ?? DAY;
}

// Los intervalos empiezan en horas redondas de Panamá (UTC−5): la hora local es time − 5 h.
const alignTo = (time: number, size: number) => Math.floor((time - PANAMA_OFFSET) / size) * size + PANAMA_OFFSET;

export type Bucket = { start: number; count: number; cumulative: number; maxMag: number | null };

export function activitySeries(quakes: Quake[], from: number, to: number, size: number): Bucket[] {
  if (!(to > from)) return [];
  const first = alignTo(from, size);
  const buckets: Bucket[] = [];
  for (let start = first; start <= to; start += size) buckets.push({ start, count: 0, cumulative: 0, maxMag: null });
  for (const quake of quakes) {
    const bucket = buckets[Math.floor((alignTo(quake.time, size) - first) / size)];
    if (!bucket) continue;
    bucket.count += 1;
    bucket.maxMag = bucket.maxMag === null ? quake.mag : Math.max(bucket.maxMag, quake.mag);
  }
  let total = 0;
  for (const bucket of buckets) bucket.cumulative = total += bucket.count;
  return buckets;
}

export function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ---------- distribuciones ----------

export type Band = { label: string; count: number };

export const DEPTH_BANDS = [
  { label: "0–10 km", max: 10 },
  { label: "10–30 km", max: 30 },
  { label: "30–70 km", max: 70 },
  { label: "Más de 70 km", max: Infinity },
] as const;

export function depthHistogram(quakes: Quake[]): { bands: Band[]; unknown: number } {
  const counts: number[] = DEPTH_BANDS.map(() => 0);
  let unknown = 0;
  for (const quake of quakes) {
    if (quake.depth === null) { unknown += 1; continue; }
    counts[DEPTH_BANDS.findIndex((band) => quake.depth! < band.max)] += 1;
  }
  return { bands: DEPTH_BANDS.map((band, index) => ({ label: band.label, count: counts[index] })), unknown };
}

export const MAG_BANDS = [
  { label: "Menos de 4", max: 4 },
  { label: "4 a 4.9", max: 5 },
  { label: "5 a 5.9", max: 6 },
  { label: "6 a 6.9", max: 7 },
  { label: "7 o más", max: Infinity },
] as const;

export function magnitudeHistogram(quakes: Quake[]): Band[] {
  const counts: number[] = MAG_BANDS.map(() => 0);
  for (const quake of quakes) counts[MAG_BANDS.findIndex((band) => quake.mag < band.max)] += 1;
  return MAG_BANDS.map((band, index) => ({ label: band.label, count: counts[index] }));
}

// ---------- lectura en texto: solo hechos registrados ----------

export function ago(ms: number) {
  const minutes = Math.max(0, Math.floor(ms / MINUTE));
  if (minutes < 1) return "hace instantes";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `hace ${hours} h${minutes % 60 ? ` ${minutes % 60} min` : ""}`;
  return `hace ${Math.floor(hours / 24)} días`;
}

const strongest = (list: Quake[]) => list.reduce<Quake | null>((best, quake) => (!best || quake.mag > best.mag ? quake : best), null);
const latestOf = (list: Quake[]) => list.reduce<Quake | null>((best, quake) => (!best || quake.time > best.time ? quake : best), null);

// Frases con lo que ya ocurrió; ningún número sale de un modelo.
export function observedFacts(quakes: Quake[], mainshockTime: number | null, now: number): string[] {
  const facts: string[] = [];
  const latest = latestOf(quakes);
  if (latest) {
    const last1h = quakes.filter((quake) => now - quake.time <= HOUR).length;
    const last24h = quakes.filter((quake) => now - quake.time <= DAY).length;
    facts.push(`El último sismo registrado fue de M ${latest.mag.toFixed(1)} ${ago(now - latest.time)}. En la última hora se registraron ${last1h} y en las últimas 24 h, ${last24h}.`);
  }
  const day = quakes.filter((quake) => now - quake.time <= DAY);
  const top24 = strongest(day);
  if (top24 && day.length > 1) facts.push(`El mayor de las últimas 24 h fue de M ${top24.mag.toFixed(1)} (${ago(now - top24.time)}).`);
  if (mainshockTime !== null) {
    const after = quakes.filter((quake) => quake.time > mainshockTime);
    const top = strongest(after);
    if (top) facts.push(`Desde el sismo principal se han registrado ${after.length} réplicas; la mayor fue de M ${top.mag.toFixed(1)} (${ago(now - top.time)}).`);
  }
  return facts;
}
