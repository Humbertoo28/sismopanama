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
  };
  geometry: { coordinates: [number, number, number?] };
};

export type EarthquakeResponse = {
  features: Earthquake[];
  fetchedAt: string;
};

export type MainshockResponse = {
  mainshock: Earthquake;
  aftershocks: { count: number; strongest: Earthquake | null };
  fetchedAt: string;
};

export type SourceRow = {
  id: "usgs" | "emsc" | "gfz";
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

export type SourcesResponse = {
  sources: SourceRow[];
  fetchedAt: string;
};

// El USGS nombra cada sismo por el lugar poblado más cercano y su país ("12 km WSW of Pitaloza Arriba,
// Panama"). Se usa esa etiqueta, y no un contorno geográfico: varias réplicas caen mar adentro, frente
// a la costa panameña, y un margen geográfico dejaría pasar sismos colombianos pegados a la frontera.
export function isPanamaPlace(place: string | null | undefined) {
  return !!place && /\bPanam[aá]\b/i.test(place) && !/Colombia|Costa Rica/i.test(place);
}

export const MAINSHOCK_ID = "us6000u18k";
export const AFTERSHOCK_RADIUS_KM = 150;

function distanceKm(a: Earthquake, b: Earthquake) {
  const [lng1, lat1] = a.geometry.coordinates;
  const [lng2, lat2] = b.geometry.coordinates;
  const rad = Math.PI / 180;
  const h =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lng2 - lng1) * rad) / 2) ** 2;
  return 12_742 * Math.asin(Math.sqrt(h));
}

// Réplica: posterior al sismo principal y a menos de AFTERSHOCK_RADIUS_KM de su epicentro.
export function isAftershock(event: Earthquake, mainshock: Earthquake) {
  return (
    event.id !== mainshock.id &&
    event.properties.time > mainshock.properties.time &&
    distanceKm(event, mainshock) <= AFTERSHOCK_RADIUS_KM
  );
}

export const REGION = {
  minlatitude: "6",
  maxlatitude: "10.7",
  minlongitude: "-83.8",
  maxlongitude: "-77.0",
};
