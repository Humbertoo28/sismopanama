import type { Earthquake, EarthquakeResponse } from "./earthquakes";
import { HISTORY_REVALIDATE_SECONDS, historyUrl, parseHistory, type HistoricQuake } from "./history";
import { loadQuakeData } from "./load-quakes";
import { placeName, placeOfEvent } from "./place-of";
import { FAR_OFFSHORE, OUTSIDE, provinceKey } from "./province-of";
import { PROVINCES, type Province } from "./provinces";

// Lo que dicen las páginas por provincia y comarca (/sismos y /sismos/[provincia]). Todo sale de los catálogos: los sismos de la
// secuencia actual, de /api/earthquakes (IGC, USGS y EMSC combinados), y los de magnitud 6 o más desde 1900, del USGS (los mismos de
// /historia). A cada sismo se le asigna provincia con las mismas reglas del filtro del mapa (lib/province-of.ts): dentro del límite o
// en el mar frente a su costa. No hay cifras estimadas ni texto generado: si una provincia no tiene sismos, la página lo dice.

export const SEQUENCE_START_TEXT = "9 de octubre de 2026";
const HOUR = 3_600_000;
const RECENT_COUNT = 20;
const PLACE_COUNT = 6;
const HISTORIC_COUNT = 10;

export const provinceById = (id: string): Province | undefined => PROVINCES.find(province => province.id === id);

/** Para frases: "Chiriquí", "la provincia de Panamá" (para no confundirla con el país) o "la comarca Guna Yala". */
export function provinceNoun(province: Province) {
  if (province.kind === "comarca") return `la comarca ${province.name}`;
  return province.id === "panama" ? "la provincia de Panamá" : province.name;
}

export type PlaceCount = { name: string; count: number };

export type ProvinceStats = {
  id: string;
  total: number;
  last24h: number;
  lastHour: number;
  m4plus: number;
  m5plus: number;
  latest: Earthquake | null;
  strongest: Earthquake | null;
  recent: Earthquake[];
  places: PlaceCount[];
  /** Sismos de magnitud 6 o más desde 1900 anteriores a la secuencia actual, del mayor al menor, y cuántos hubo en total. */
  historic: HistoricQuake[];
  historicTotal: number;
};

export type ProvincePages = {
  stats: Record<string, ProvinceStats>;
  /** false si no se pudieron consultar los sismos en vivo: entonces los conteos de la secuencia no valen y no se publican. */
  liveOk: boolean;
  dataTime: number | null;
  catalogs: EarthquakeResponse["catalogs"] | null;
};

// Un sismo del historial con la forma de los del catálogo en vivo, igual que en /historia, para decir en qué provincia cae.
const asEarthquake = (quake: HistoricQuake): Earthquake => ({
  id: quake.id,
  properties: { mag: quake.mag, place: quake.place, time: quake.time, url: quake.url, source: "usgs" },
  geometry: { coordinates: [quake.lng, quake.lat, quake.depth ?? undefined] },
});

// Misma consulta (y misma caché) que /historia. Si el USGS no responde, las páginas salen sin la lista de sismos grandes.
async function loadHistoricQuakes(): Promise<HistoricQuake[]> {
  try {
    const response = await fetch(historyUrl(), { headers: { Accept: "application/geo+json, application/json" }, next: { revalidate: HISTORY_REVALIDATE_SECONDS } });
    if (!response.ok) throw new Error(`El USGS respondió ${response.status}`);
    return parseHistory(await response.json()).panama;
  } catch (error) {
    console.error("Historial del USGS no disponible para las páginas por provincia:", error);
    return [];
  }
}

const newestFirst = (a: Earthquake, b: Earthquake) => b.properties.time - a.properties.time;
const strongestFirst = (a: Earthquake, b: Earthquake) => (b.properties.mag ?? -1) - (a.properties.mag ?? -1) || b.properties.time - a.properties.time;

function emptyStats(id: string): ProvinceStats {
  return { id, total: 0, last24h: 0, lastHour: 0, m4plus: 0, m5plus: 0, latest: null, strongest: null, recent: [], places: [], historic: [], historicTotal: 0 };
}

function groupByProvince<T>(items: T[], idOf: (item: T) => string) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const id = idOf(item);
    if (id === FAR_OFFSHORE || id === OUTSIDE) continue;
    groups.set(id, [...(groups.get(id) ?? []), item]);
  }
  return groups;
}

export async function loadProvincePages(): Promise<ProvincePages> {
  const [data, historic] = await Promise.all([loadQuakeData(), loadHistoricQuakes()]);
  // «Últimas 24 horas» y «última hora» se miden desde el momento de los datos (el que dice la página), no desde que alguien la abre.
  const now = (data && Date.parse(data.fetchedAt)) || Date.now();
  const live = groupByProvince((data?.features ?? []).filter(event => !event.properties.nearby), provinceKey);
  const past = groupByProvince(historic.filter(quake => !quake.current), quake => provinceKey(asEarthquake(quake)));

  const stats: Record<string, ProvinceStats> = {};
  for (const province of PROVINCES) {
    const events = [...(live.get(province.id) ?? [])].sort(newestFirst);
    const placeCounts = new Map<string, number>();
    for (const event of events) {
      const place = placeOfEvent(event);
      if (place) placeCounts.set(placeName(place.place), (placeCounts.get(placeName(place.place)) ?? 0) + 1);
    }
    const older = [...(past.get(province.id) ?? [])].sort((a, b) => b.mag - a.mag || b.time - a.time);
    stats[province.id] = {
      ...emptyStats(province.id),
      total: events.length,
      last24h: events.filter(event => now - event.properties.time <= 24 * HOUR).length,
      lastHour: events.filter(event => now - event.properties.time <= HOUR).length,
      m4plus: events.filter(event => (event.properties.mag ?? 0) >= 4).length,
      m5plus: events.filter(event => (event.properties.mag ?? 0) >= 5).length,
      latest: events[0] ?? null,
      strongest: [...events].sort(strongestFirst)[0] ?? null,
      recent: events.slice(0, RECENT_COUNT),
      places: [...placeCounts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "es")).slice(0, PLACE_COUNT),
      historic: older.slice(0, HISTORIC_COUNT),
      historicTotal: older.length,
    };
  }
  return { stats, liveOk: Boolean(data), dataTime: data ? Date.parse(data.fetchedAt) || now : null, catalogs: data?.catalogs ?? null };
}

// Con menos datos que estos la página sería casi solo texto fijo: no se ofrece a Google (ni va en el sitemap), aunque siga existiendo y
// enlazada desde /sismos para quien la busque. Cuentan los sismos de la secuencia y los grandes desde 1900.
const MIN_ITEMS = 3;

/**
 * ¿Tiene la página suficiente que decir? Si los sismos en vivo no se pudieron consultar, no se decide por eso: no se retira nada por
 * un fallo pasajero.
 */
export function hasContent(pages: ProvincePages, id: string) {
  const stats = pages.stats[id];
  return !pages.liveOk || stats.total + stats.historicTotal >= MIN_ITEMS;
}
