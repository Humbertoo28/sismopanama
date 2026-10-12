import { SINCE } from "./earthquakes";
import { queryUsgs } from "./usgs";

// Llegadas reales de las ondas sísmicas a las estaciones, tal como las publica el USGS (producto «phase-data» de cada sismo):
// la hora a la que cada estación registró la onda P y la onda S. No se calcula nada: solo se recorta y se ordena lo publicado.

export type PhaseStation = {
  // Red y estación («CU.BCIP»).
  code: string;
  distanceKm: number;
  // Rumbo desde el epicentro hasta la estación, en grados.
  azimuth: number;
  // Segundos desde el origen del sismo hasta el registro de la primera onda P y de la primera onda S (null si no la registró).
  p: number | null;
  s: number | null;
};

export type EventPhases = { id: string; stations: PhaseStation[]; total: number; fetchedAt: string };

type Detail = {
  geometry?: { coordinates?: number[] };
  properties?: { time?: number; products?: { "phase-data"?: { contents?: { "quakeml.xml"?: { url?: string } } }[] } };
};

const KM_PER_DEGREE = 111.195;
const NEARBY_KM = 1500;
const MAX_STATIONS = 12;

const tag = (xml: string, name: string) => new RegExp(`<${name}>\\s*([^<]*?)\\s*</${name}>`).exec(xml)?.[1];
const timeOf = (xml: string) => {
  const value = /<time>\s*<value>([^<]*)<\/value>/.exec(xml)?.[1];
  return value ? Date.parse(value) : NaN;
};

export function parsePhases(xml: string, id: string): EventPhases {
  const origin = timeOf(/<origin[ >][\s\S]*?<\/origin>/.exec(xml)?.[0] ?? "");
  const picks = new Map<string, { time: number; code: string }>();
  for (const match of xml.matchAll(/<pick [^>]*publicID="([^"]*)"[^>]*>([\s\S]*?)<\/pick>/g)) {
    const network = /networkCode="([A-Za-z0-9]{1,8})"/.exec(match[2])?.[1];
    const station = /stationCode="([A-Za-z0-9]{1,8})"/.exec(match[2])?.[1];
    const time = timeOf(match[2]);
    if (network && station && Number.isFinite(time)) picks.set(match[1], { time, code: `${network}.${station}` });
  }
  const stations = new Map<string, PhaseStation>();
  if (Number.isFinite(origin)) {
    for (const match of xml.matchAll(/<arrival[^>]*>([\s\S]*?)<\/arrival>/g)) {
      const pick = picks.get(tag(match[1], "pickID") ?? "");
      const phase = tag(match[1], "phase") ?? "";
      const degrees = Number(tag(match[1], "distance"));
      const azimuth = Number(tag(match[1], "azimuth"));
      const seconds = pick ? (pick.time - origin) / 1000 : NaN;
      if (!pick || !Number.isFinite(degrees) || !Number.isFinite(azimuth) || !Number.isFinite(seconds) || seconds < 0 || !/^[PpSs]/.test(phase)) continue;
      const entry = stations.get(pick.code) ?? { code: pick.code, distanceKm: Math.round(degrees * KM_PER_DEGREE), azimuth: Math.round(azimuth), p: null, s: null };
      const key = /^[Pp]/.test(phase) ? "p" : "s";
      const rounded = Math.round(seconds * 10) / 10;
      if (entry[key] === null || rounded < (entry[key] as number)) entry[key] = rounded;
      stations.set(pick.code, entry);
    }
  }
  const all = [...stations.values()].sort((a, b) => a.distanceKm - b.distanceKm);
  return { id, stations: all.filter(station => station.distanceKm <= NEARBY_KM).slice(0, MAX_STATIONS), total: all.length, fetchedAt: new Date().toISOString() };
}

// Devuelve null si el sismo no existe en el USGS o no es de esta secuencia (después del 9 de octubre y en la región de Panamá).
export async function fetchEventPhases(id: string): Promise<EventPhases | null> {
  let detail: Detail | null;
  try {
    detail = (await queryUsgs({ eventid: id })) as Detail | null;
  } catch (error) {
    // El USGS contesta 404 (o 400) cuando el id no existe: no es una falla suya.
    if (/ 40[04]$/.test(String((error as Error).message))) return null;
    throw error;
  }
  const [lng, lat] = detail?.geometry?.coordinates ?? [];
  const time = detail?.properties?.time;
  if (!detail || !Number.isFinite(time) || time! < SINCE || !(lat > 4 && lat < 12) || !(lng > -86 && lng < -75)) return null;
  const url = detail.properties?.products?.["phase-data"]?.[0]?.contents?.["quakeml.xml"]?.url;
  if (!url || !url.startsWith("https://earthquake.usgs.gov/")) return { id, stations: [], total: 0, fetchedAt: new Date().toISOString() };
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000), cache: "no-store" });
  if (!response.ok) throw new Error(`USGS phase-data respondió ${response.status}`);
  const xml = await response.text();
  if (xml.length > 4_000_000) throw new Error("phase-data demasiado grande");
  return parsePhases(xml, id);
}
