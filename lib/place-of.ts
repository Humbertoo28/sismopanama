import type { Earthquake } from "./earthquakes";
import { PLACES, type Place } from "./places";
import { PROVINCE_BY_ID, provinceOfEvent } from "./province-of";

// A qué ciudad o localidad queda más cerca un sismo (cabeceras de corregimiento, distrito y provincia de GeoNames), como
// hace el USGS en su etiqueta. Si el sismo cae en una provincia, se busca solo entre las localidades de esa provincia:
// así la lista de ciudades de cada provincia es coherente con el filtro de provincia.
export const PLACE_BY_ID = new Map<string, Place>(PLACES.map(place => [place.id, place]));
const MAX_KM = 150;

const nameCount = new Map<string, number>();
const byProvince = new Map<string, Place[]>();
for (const place of PLACES) {
  nameCount.set(place.name, (nameCount.get(place.name) ?? 0) + 1);
  byProvince.set(place.province, [...(byProvince.get(place.province) ?? []), place]);
}

/** Nombre para mostrar: si hay varias localidades con el mismo nombre, se aclara la provincia ("Río Grande (Coclé)"). */
export function placeName(place: Place) {
  return (nameCount.get(place.name) ?? 0) > 1 ? `${place.name} (${PROVINCE_BY_ID.get(place.province)?.name ?? "?"})` : place.name;
}

function nearestIn(list: Place[], lat: number, lng: number) {
  const kx = Math.cos((lat * Math.PI) / 180) * 111.32;
  const ky = 110.57;
  let best: Place | null = null;
  let bestKm = Infinity;
  for (const place of list) {
    const km = Math.hypot((place.lng - lng) * kx, (place.lat - lat) * ky);
    if (km < bestKm) {
      bestKm = km;
      best = place;
    }
  }
  return best ? { place: best, km: bestKm } : null;
}

export type PlaceMatch = { place: Place; km: number } | null;

// Cada consulta trae de nuevo todos los sismos: se recuerda el resultado por posición.
const cache = new Map<string, PlaceMatch>();
export function placeOfEvent(event: Earthquake): PlaceMatch {
  const [lng, lat] = event.geometry.coordinates;
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  if (!cache.has(key)) {
    const province = provinceOfEvent(event);
    const found = nearestIn((province && byProvince.get(province.id)) || PLACES, lat, lng);
    cache.set(key, found && found.km <= MAX_KM ? found : null);
  }
  return cache.get(key) ?? null;
}

/** Valor del filtro de ciudad de un sismo: el id de GeoNames de su localidad más cercana ("" si no hay ninguna). */
export function placeKey(event: Earthquake) {
  return placeOfEvent(event)?.place.id ?? "";
}

export function placeLabel(event: Earthquake, withDistance = false) {
  const match = placeOfEvent(event);
  if (!match) return "—";
  return withDistance ? `${placeName(match.place)} · a ${Math.max(1, Math.round(match.km))} km` : placeName(match.place);
}

/** Código del distrito (GeoNames) de la localidad más cercana al sismo ("" si no hay ninguna). */
export function districtKey(event: Earthquake) {
  return placeOfEvent(event)?.place.district ?? "";
}

/** El filtro de ciudad vale "all", "d:<distrito>" (todo un distrito) o el id de una localidad. */
export function cityMatches(event: Earthquake, city: string) {
  if (city === "all") return true;
  return city.startsWith("d:") ? districtKey(event) === city.slice(2) : placeKey(event) === city;
}
