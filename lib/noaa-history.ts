import { kmBetween } from "./earthquakes";
import { formatMag, type HistoricQuake } from "./history";
import type { Fact, FactSource } from "./history-facts";

// Datos de NOAA NCEI para los sismos de la historia, de dos bases de datos oficiales de ese organismo de Estados Unidos:
//   · Base de datos mundial de sismos significativos (NCEI/WDS, doi:10.7289/V5TD9V7K): magnitud, heridos, muertos, daños, intensidad.
//   · Base de datos mundial histórica de tsunamis (NCEI/WDS, doi:10.7289/V5PN93H7): si hubo tsunami, qué tan seguro es, altura del agua.
// Se piden al servicio público de NOAA cada vez que la página se regenera (cada media hora), nunca se guardan copias en el código. Un
// registro de NOAA solo se une a un sismo del USGS si coinciden en hora (hasta 20 min) y en lugar (hasta 200 km). De cada registro solo se
// toman campos con nombre y unidad conocidos y, para los textos, frases enteras que se comprueban contra el texto actual de NOAA antes de
// mostrarse: si NOAA cambió la frase, esa curiosidad no se muestra.

const API = "https://www.ngdc.noaa.gov/hazel/hazard-service/api/v1";
const PAGE = "https://www.ngdc.noaa.gov/hazel/view/hazards";
const REVALIDATE_SECONDS = 1800;
const MAX_MINUTES = 20;
const MAX_KM = 200;

export type NoaaEarthquake = {
  id: number;
  year: number;
  month?: number | null;
  day?: number | null;
  hour?: number | null;
  minute?: number | null;
  second?: number | null;
  locationName?: string;
  latitude?: number;
  longitude?: number;
  eqDepth?: number | null;
  eqMagnitude?: number | null;
  eqMagMw?: number | null;
  eqMagMs?: number | null;
  intensity?: number | null;
  deaths?: number | null;
  injuries?: number | null;
  damageMillionsDollars?: number | null;
  tsunamiEventId?: number | null;
};

export type NoaaTsunami = {
  id: number;
  eventValidity?: number | null;
  maxWaterHeight?: number | null;
  housesDestroyedTotal?: number | null;
  housesDamagedTotal?: number | null;
  comments?: string | null;
};

const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

const noaaTime = (item: NoaaEarthquake) =>
  isNumber(item.month) && isNumber(item.day) && isNumber(item.hour) && isNumber(item.minute)
    ? Date.UTC(item.year, item.month - 1, item.day, item.hour, item.minute, isNumber(item.second) ? item.second : 0)
    : null;

// A cada registro de NOAA le toca como mucho un sismo del USGS (el más cercano en el tiempo dentro de los límites), y viceversa.
export function matchNoaa(noaa: NoaaEarthquake[], quakes: HistoricQuake[]) {
  const pairs: { noaa: NoaaEarthquake; quake: HistoricQuake; minutes: number }[] = [];
  for (const item of noaa) {
    const time = noaaTime(item);
    if (time === null || !isNumber(item.latitude) || !isNumber(item.longitude)) continue;
    for (const quake of quakes) {
      const minutes = Math.abs(quake.time - time) / 60_000;
      if (minutes <= MAX_MINUTES && kmBetween(quake.lat, quake.lng, item.latitude, item.longitude) <= MAX_KM) pairs.push({ noaa: item, quake, minutes });
    }
  }
  pairs.sort((a, b) => a.minutes - b.minutes);
  const usedNoaa = new Set<number>();
  const usedQuake = new Set<string>();
  const result = new Map<string, NoaaEarthquake>();
  for (const pair of pairs) {
    if (usedNoaa.has(pair.noaa.id) || usedQuake.has(pair.quake.id)) continue;
    usedNoaa.add(pair.noaa.id);
    usedQuake.add(pair.quake.id);
    result.set(pair.quake.id, pair.noaa);
  }
  return result;
}

// Para comparar una frase con el texto de NOAA: sin etiquetas, con las comillas y los espacios iguales.
export function normalizeText(text: string) {
  return text
    .replace(/<[^>]*>/g, " ")
    .replace(/&#34;|&quot;|[“”]/g, '"')
    .replace(/&#39;|&apos;|[‘’]/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

// Frases de la descripción de NOAA de cada tsunami, con su traducción. `original` debe aparecer tal cual en el texto actual de NOAA.
export const EXCERPTS: Record<number, { es: string; original: string }[]> = {
  1434: [{
    original: "At Bocas a slight tidal wave carried canoes and debris 200m inland. The telephone cable connecting Bocas with the mainland was pulled apart in two places.",
    es: "En Bocas del Toro, una ola leve arrastró canoas y escombros 200 m tierra adentro, y el cable telefónico que unía Bocas con tierra firme se partió en dos lugares.",
  }],
  1671: [{
    original: "At Puerto Armuelles, two large anchored buoys were displaced 300 m from the moorage out to sea, in such a way that their relative position did not change. The water level several times passed the mark of the highest high tides, although flood tides should have been small at this time of year.",
    es: "En Puerto Armuelles, dos boyas grandes ancladas se desplazaron 300 m mar adentro desde su amarre sin cambiar su posición una respecto a la otra, y el nivel del agua pasó varias veces la marca de las mareas altas más altas, aunque en esa época del año las mareas altas debían ser pequeñas.",
  }],
  1928: [{
    original: "A small tsunami occurred and was registered 2.7 hours, later by the tide gauge at San Cristobal (Galapagos Islands) with an amplitude of 10 cm and with approximately the same height by the tide gauge at Puerto Armuelles.",
    es: "Ocurrió un pequeño tsunami: el mareógrafo de San Cristóbal (Galápagos) lo registró 2.7 horas después, con una amplitud de 10 cm, y el de Puerto Armuelles con una altura parecida.",
  }, {
    original: "Reference #273 lists 30 cm at San Cristobal and Puerto Armuelles.",
    es: "Otra fuente de las que cita NOAA (la n.º 273) da 30 cm en San Cristóbal y en Puerto Armuelles.",
  }],
  5668: [{
    original: "Extensive cracking and liquefaction of the ground was observed along the banks of the river at Pajanosa, as well as on the main road to Tonosi.",
    es: "Se observaron grietas extensas y licuefacción del suelo a orillas del río en Pajanosa y en el camino principal a Tonosí.",
  }, {
    original: "A few hours after the earthquake a submarine slide ruptured the Central & South American cable near the islet of Frailes del Norte, about 25 km off the south coast of Los Santos province.",
    es: "Unas horas después del sismo, un deslizamiento submarino rompió el cable «Central & South American» cerca del islote Frailes del Norte, a unos 25 km de la costa sur de la provincia de Los Santos.",
  }, {
    original: "It has been reported that the broken end of the cable was found at a depth of 1463 m, whereas when the cable was first laid, the depth was only about 305.m",
    es: "Según un informe, el extremo roto del cable se halló a 1,463 m de profundidad, cuando al tenderlo la profundidad allí era de solo unos 305 m.",
  }],
  5669: [{
    original: 'A "local" tsunami designation is assigned to this event, as well as a "-1" tsunami magnitude (Imamura-Iida scale) which is 50 cm.',
    es: "NOAA le asigna la designación de tsunami «local» y una magnitud de tsunami de −1 (escala Imamura-Iida), que corresponde a 50 cm.",
  }, {
    original: "No reference to this tsunami event is found outside of reference #273.",
    es: "NOAA aclara que no hay referencias a este tsunami fuera de una sola fuente (la n.º 273 de su lista).",
  }],
  6193: [{
    original: "Sinaproc reported Increased wave activity reported at Isla Caña",
    es: "Según NOAA, Sinaproc reportó mayor actividad de olas en Isla Caña.",
  }, {
    original: "Reference #14527 reports inundation at Isla Cañas",
    es: "Otra fuente de las que cita NOAA (la n.º 14527) reporta inundación en Isla Cañas.",
  }],
};

// Lo que NOAA llama «validez» del tsunami (los textos de NOAA: «definite tsunami», «probable tsunami», «questionable tsunami», «very doubtful tsunami»).
const VALIDITY: Record<number, { es: string; en: string }> = {
  4: { es: "tsunami definitivo", en: "definite tsunami" },
  3: { es: "tsunami probable", en: "probable tsunami" },
  2: { es: "tsunami dudoso", en: "questionable tsunami" },
  1: { es: "tsunami muy dudoso", en: "very doubtful tsunami" },
};

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
const plural = (n: number, one: string, many: string) => `${n.toLocaleString("es-PA")} ${n === 1 ? one : many}`;
const trim = (value: number) => String(Number(value.toFixed(3)));

function quakeSource(item: NoaaEarthquake): FactSource {
  return { kind: "noaa", label: `NOAA NCEI · sismos significativos (registro ${item.id})`, url: `${PAGE}/earthquake/event-more-info/${item.id}`, data: `${API}/earthquakes/${item.id}` };
}
function tsunamiSource(id: number): FactSource {
  return { kind: "noaa", label: `NOAA NCEI · tsunamis (evento ${id})`, url: `${PAGE}/tsunami/event-more-info/${id}`, data: `${API}/tsunamis/events/${id}` };
}

// Las curiosidades de un sismo a partir de su registro de NOAA y, si lo hay, el de su tsunami. Solo entra lo que el registro trae.
export function noaaFacts(quake: HistoricQuake, item: NoaaEarthquake, tsunami: NoaaTsunami | null): Fact[] {
  const list: Fact[] = [];
  const source = quakeSource(item);

  // La magnitud y la profundidad de cada catálogo: se dice si coinciden y, si no, se muestran las dos.
  const values: { label: string; value: number }[] = [];
  if (isNumber(item.eqMagMw)) values.push({ label: "Mw", value: item.eqMagMw });
  if (isNumber(item.eqMagMs)) values.push({ label: "Ms", value: item.eqMagMs });
  if (!values.length && isNumber(item.eqMagnitude)) values.push({ label: "M", value: item.eqMagnitude });
  if (values.length) {
    const usgsType = quake.magType ? quake.magType.charAt(0).toUpperCase() + quake.magType.slice(1).toLowerCase() : "M";
    const noaaText = values.map(entry => `${entry.label} ${formatMag(entry.value)}`).join(" y ");
    const agree = values.some(entry => Math.abs(entry.value - quake.mag) < 0.05);
    const depth = isNumber(item.eqDepth) && quake.depth !== null && Math.round(item.eqDepth) !== Math.round(quake.depth)
      ? ` En profundidad, NOAA anota ${trim(item.eqDepth)} km y el USGS, ${trim(Math.round(quake.depth))} km.`
      : "";
    list.push({
      id: "noaa-magnitude",
      text: `NOAA NCEI registra este sismo con ${noaaText}; el USGS, con ${usgsType} ${formatMag(quake.mag)}. ${agree ? "La cifra del USGS coincide con una de las de NOAA." : "Los dos catálogos no publican la misma cifra."}${depth}`,
      source,
    });
  }
  if (isNumber(item.intensity) && item.intensity >= 1 && item.intensity <= 12) {
    list.push({ id: "noaa-intensity", text: `NOAA anota una intensidad máxima de ${ROMAN[item.intensity]} en la escala Mercalli modificada.`, source });
  }
  const harm: string[] = [];
  if (isNumber(item.deaths)) harm.push(plural(item.deaths, "muerto", "muertos"));
  if (isNumber(item.injuries)) harm.push(plural(item.injuries, "herido", "heridos"));
  if (harm.length) list.push({ id: "noaa-harm", text: `NOAA anota ${harm.join(" y ")} en este evento.`, source });
  if (isNumber(item.damageMillionsDollars)) {
    list.push({ id: "noaa-damage", text: `NOAA anota daños por ${trim(item.damageMillionsDollars)} millones de dólares.`, source, note: "Es la cifra de NOAA; no se ajusta ni se compara con otras." });
  }

  if (tsunami && isNumber(tsunami.eventValidity) && VALIDITY[tsunami.eventValidity]) {
    const tsu = tsunamiSource(tsunami.id);
    const validity = VALIDITY[tsunami.eventValidity];
    const height = isNumber(tsunami.maxWaterHeight) ? ` La altura máxima del agua que anota NOAA es de ${trim(tsunami.maxWaterHeight)} m.` : "";
    list.push({
      id: "noaa-tsunami",
      text: `NOAA lo vincula con un evento de tsunami y lo clasifica como «${validity.es}».${height}`,
      source: tsu,
      original: validity.en,
      note: isNumber(tsunami.maxWaterHeight) ? "NOAA define la altura como la máxima del agua sobre el nivel del mar, en metros, y aclara que no siempre es claro qué nivel de referencia se usó." : undefined,
    });
    if (isNumber(tsunami.housesDestroyedTotal) || isNumber(tsunami.housesDamagedTotal)) {
      const parts: string[] = [];
      if (isNumber(tsunami.housesDestroyedTotal)) parts.push(`${plural(tsunami.housesDestroyedTotal, "vivienda destruida", "viviendas destruidas")}`);
      if (isNumber(tsunami.housesDamagedTotal)) parts.push(`${plural(tsunami.housesDamagedTotal, "dañada", "dañadas")}`);
      list.push({ id: "noaa-houses", text: `NOAA anota ${parts.join(" y ")} en este evento.`, source: tsu, note: "Cifra de NOAA, puede cambiar si NOAA la actualiza." });
    }
    // Frases de la descripción de NOAA: solo se muestran si siguen apareciendo tal cual en el texto actual.
    const comments = normalizeText(tsunami.comments ?? "");
    (EXCERPTS[tsunami.id] ?? []).forEach((excerpt, index) => {
      if (comments.includes(normalizeText(excerpt.original))) list.push({ id: `noaa-text-${tsunami.id}-${index}`, text: excerpt.es, source: tsu, original: excerpt.original });
    });
  }
  return list;
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15_000), next: { revalidate: REVALIDATE_SECONDS } });
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    return null;
  }
}

export type NoaaFacts = { facts: Record<string, Fact[]>; matched: number; fetchedAt: string };

// null si NOAA no respondió: la página sigue con los datos del USGS.
export async function loadNoaaFacts(quakes: HistoricQuake[]): Promise<NoaaFacts | null> {
  const list = await getJson<{ items?: NoaaEarthquake[] }>(`${API}/earthquakes?country=PANAMA&minYear=1900&maxYear=2100`);
  if (!list || !Array.isArray(list.items)) return null;
  const pairs = matchNoaa(list.items, quakes);
  const tsunamiIds = [...new Set([...pairs.values()].flatMap(item => (isNumber(item.tsunamiEventId) ? [item.tsunamiEventId] : [])))];
  const tsunamis = new Map<number, NoaaTsunami>();
  await Promise.all(tsunamiIds.map(async id => {
    const record = await getJson<NoaaTsunami>(`${API}/tsunamis/events/${id}`);
    if (record && record.id === id) tsunamis.set(id, record);
  }));
  const facts: Record<string, Fact[]> = {};
  for (const quake of quakes) {
    const item = pairs.get(quake.id);
    if (!item) continue;
    const built = noaaFacts(quake, item, isNumber(item.tsunamiEventId) ? tsunamis.get(item.tsunamiEventId) ?? null : null);
    if (built.length) facts[quake.id] = built;
  }
  return { facts, matched: pairs.size, fetchedAt: new Date().toISOString() };
}
