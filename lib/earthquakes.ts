export type Earthquake = {
  id: string;
  properties: {
    mag: number | null;
    place: string | null;
    time: number;
    url: string | null;
    alert?: string | null;
    felt?: number | null;
    mmi?: number | null;
    tsunami?: number | null;
    magType?: string | null;
    status?: string | null;
    // Catálogo del que viene el registro (por omisión, el USGS) y los id de la misma ocurrencia en otros.
    source?: "usgs" | "igc" | "emsc";
    aliases?: string[];
    // Qué catálogos publicaron este sismo y qué magnitud puso cada uno (solo si hay más de uno; si no, vale `source`).
    agencies?: { source: "usgs" | "igc" | "emsc"; mag: number | null; magType?: string | null }[];
    // Sismo de los alrededores (fuera de Panamá): solo llega con «Incluir alrededores» y no cuenta como réplica.
    nearby?: boolean;
  };
  geometry: { coordinates: [number, number, number?] };
};

export type EarthquakeResponse = {
  features: Earthquake[];
  fetchedAt: string;
  catalogs?: { usgs: boolean; igc: boolean; emsc: boolean };
};

export type MainshockResponse = {
  mainshock: Earthquake;
  aftershocks: { count: number; strongest: Earthquake | null; tsunami: Earthquake | null };
  fetchedAt: string;
};

export type SourceRow = {
  id: "usgs" | "igc" | "emsc" | "gfz";
  agency: string;
  magnitude: number | null;
  magType: string | null;
  depthKm: number | null;
  time: number;
  reviewed: boolean | null;
  url: string;
};

export type ReplayStep = {
  index: number;
  total: number;
  time: number;
  mag: number | null;
};

export type FocusRequest = { id: string; quiet?: boolean };

// `quiet`: el sismo es nuevo para este dispositivo pero ya tiene un rato; se avisa en pantalla sin sirena.
export type LiveAlert = { key: number; event: Earthquake; count: number; quiet?: boolean };

export type SourcesResponse = {
  sources: SourceRow[];
  fetchedAt: string;
};

// El USGS nombra cada sismo por el lugar poblado más cercano y su país ("12 km WSW of Pitaloza Arriba,
// Panama"). Se usa esa etiqueta, y no un contorno geográfico: varias réplicas caen mar adentro, frente
// a la costa panameña, y un margen geográfico dejaría pasar sismos colombianos pegados a la frontera.
export function isPanamaPlace(place: string | null | undefined) {
  return !!place && /(?<![\p{L}])Panam[aá](?![\p{L}])/iu.test(place) && !/Colombia|Costa Rica/iu.test(place);
}

// Fuerza y duración del temblor del mapa según la magnitud: M 3.9 apenas se nota (~1.6 px) y
// M 7.7 llega al máximo (9.5 px). Sin magnitud conocida se trata como un sismo pequeño.
export function shakeFor(mag: number | null) {
  const m = mag ?? 3.5;
  return {
    px: Math.min(9.5, Math.max(1.6, (m - 3.2) * 2.2)),
    ms: Math.min(1100, Math.max(450, 380 + m * 70)),
  };
}

// La página muestra solo los sismos desde el inicio del 9 de octubre de 2026 en Panamá (UTC−5) en
// adelante. La fecha es fija a propósito: si fuera "hoy" relativo, mañana la lista quedaría vacía y
// se perdería la secuencia de este sismo.
export const SINCE = Date.UTC(2026, 9, 9, 5, 0, 0);

export const MAINSHOCK_ID = "us6000u18k";
export const AFTERSHOCK_RADIUS_KM = 150;

export function distanceKm(a: Earthquake, b: Earthquake) {
  const [lng1, lat1] = a.geometry.coordinates;
  const [lng2, lat2] = b.geometry.coordinates;
  return kmBetween(lat1, lng1, lat2, lng2);
}

export function kmBetween(lat1: number, lng1: number, lat2: number, lng2: number) {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lng2 - lng1) * rad) / 2) ** 2;
  return 12_742 * Math.asin(Math.sqrt(h));
}

// Dos registros de catálogos distintos describen el mismo sismo si ocurrieron con menos de un minuto de
// diferencia y a menos de 120 km (las agencias suelen diferir en segundos y en unos pocos km).
export function sameEvent(a: Earthquake, b: Earthquake) {
  return Math.abs(a.properties.time - b.properties.time) <= 60_000 && distanceKm(a, b) <= 120;
}

// Un sismo «sin confirmar» es el que solo publica el EMSC: el IGC (la red local, que registra casi todo lo que se siente en
// Panamá) y el USGS no lo tienen. El EMSC reúne soluciones de muchas agencias, entre ellas detecciones automáticas que a veces
// toman las ondas de un sismo lejano por uno local (el 13 de octubre de 2026, un «M 4.0» cerca de Juan Díaz, 87 s después de
// un sismo en Colombia, que el IGC desmintió y que llegó a 29 198 teléfonos). Al fusionar los catálogos, `source` solo vale
// «emsc» si ningún otro catálogo lo trae. Se sigue mostrando, con su rótulo, pero no se avisa hasta que otro lo confirme.
export function isUnconfirmed(event: Earthquake) {
  return event.properties.source === "emsc" && !event.properties.nearby;
}

// Desde esta magnitud un sismo se avisa aunque solo lo traiga el EMSC: uno así de grande no se puede dejar esperando.
export const UNCONFIRMED_ALERT_MAG = 5;

// ¿Se retiene la alerta (push, sirena y notificación) hasta que el IGC o el USGS lo confirmen? Solo si el IGC está respondiendo:
// si está caído no se puede saber si lo confirmaría, y se avisa como antes para no perder alertas reales.
export function awaitsConfirmation(event: Earthquake, igcUp = true) {
  return igcUp && isUnconfirmed(event) && (event.properties.mag ?? 0) < UNCONFIRMED_ALERT_MAG;
}

// El sismo principal fue de M 7.7. Una réplica es un sismo posterior a él: los anteriores (hubo uno de M 2.6, doce horas
// antes y a 5 km del epicentro) no son réplicas aunque la lista arranque el 9 de octubre.
export function isAftershock(event: Earthquake, mainshock: Earthquake) {
  return (
    event.id !== mainshock.id &&
    !sameEvent(event, mainshock) &&
    event.properties.time > mainshock.properties.time
  );
}

// Los sismos de la lista que ocurrieron antes que el principal (ni son el principal ni son réplicas).
export function isBeforeMainshock(event: Earthquake, mainshock: Earthquake) {
  return event.id !== mainshock.id && !sameEvent(event, mainshock) && event.properties.time < mainshock.properties.time;
}

export const REGION = {
  minlatitude: "6",
  maxlatitude: "10.7",
  minlongitude: "-83.8",
  maxlongitude: "-77.0",
};
