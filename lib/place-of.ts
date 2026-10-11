import type { Earthquake } from "./earthquakes";
import { MAX_REFERENCE_KM, nearestIn, resolveReference } from "./place-reference";
import { PLACES, type Place } from "./places";
import { PROVINCE_BY_ID, provinceLabel, provinceOfEvent } from "./province-of";

// A qué ciudad o localidad pertenece un sismo (cabeceras de corregimiento, distrito y provincia de GeoNames): la que cita
// su propia etiqueta y, si no cita ninguna, la más cercana dentro de su provincia (ver placeOfEvent).
export const PLACE_BY_ID = new Map<string, Place>(PLACES.map(place => [place.id, place]));

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

export type PlaceMatch = { place: Place; km: number } | null;

// La ciudad del sismo es el lugar que cita su propio título, para que el filtro coincida con lo que se lee en la lista (el
// IGC usa pocas ciudades grandes: Tonosí, Soná, Coiba, Santiago…, por eso "Tonosí" reúne tantos sismos). Si el título no cita
// ninguno (EMSC solo da coordenadas), se usa la localidad más cercana dentro de la provincia del sismo.
const cache = new Map<string, PlaceMatch>();
export function placeOfEvent(event: Earthquake): PlaceMatch {
  const [lng, lat] = event.geometry.coordinates;
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}|${event.properties.place ?? ""}`;
  if (!cache.has(key)) {
    let found: PlaceMatch = resolveReference(event);
    if (!found) {
      const province = provinceOfEvent(event);
      found = nearestIn((province && byProvince.get(province.id)) || PLACES, lat, lng);
    }
    cache.set(key, found && found.km <= MAX_REFERENCE_KM ? found : null);
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

/** Provincia y ciudad, para mostrar tal cual: "Los Santos · Tonosí". */
export function whereText(event: Earthquake) {
  const match = placeOfEvent(event);
  return match ? `${provinceLabel(event)} · ${placeName(match.place)}` : provinceLabel(event);
}

/** Para textos que ya citan la ciudad (el título del sismo): la provincia y, solo si el título no cita ninguna, "cerca de X". */
export function locationText(event: Earthquake) {
  const match = placeOfEvent(event);
  return !match || resolveReference(event) ? provinceLabel(event) : `${provinceLabel(event)} · cerca de ${placeName(match.place)}`;
}

/** Lo mismo pensado para leerse en voz alta: "provincia de Los Santos", "en el mar frente a Veraguas, cerca de Tonosí". */
export function spokenWhere(event: Earthquake) {
  const province = provinceOfEvent(event);
  const near = placeOfEvent(event);
  const city = !near || resolveReference(event) ? "" : `, cerca de ${near.place.name}`;
  if (!province) return `en el mar, lejos de la costa${city}`;
  if (province.offshore) return `en el mar frente a ${province.name}${city}`;
  return `${PROVINCE_BY_ID.get(province.id)?.kind === "comarca" ? "comarca" : "provincia de"} ${province.name}${city}`;
}
