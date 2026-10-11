import type { Earthquake } from "./earthquakes";
import { PLACES, type Place } from "./places";

// Las agencias nombran cada sismo por el lugar de referencia más cercano ("a 19km al este de Tonosí" el IGC, "12 km WSW of
// Pitaloza Arriba" el USGS). Aquí se lee ese lugar del título y se busca en la lista de localidades. Lo usan la ciudad y,
// para los sismos en el mar, también la provincia: así "Tonosí" siempre queda dentro de Los Santos.
const REFERENCE = /\d+(?:[.,]\d+)?\s*km\s+(?:al?\s+[\w-]+\s+de|[NSEW]{1,3}\s+of)\s+([^,(]+)/i;
const ALIASES: Record<string, string> = { santiago: "santiago de veraguas" };

function normalize(text: string) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/^(el|la|los|las)\s+/, "");
}

const byName = new Map<string, Place[]>();
for (const place of PLACES) {
  const key = normalize(place.name);
  byName.set(key, [...(byName.get(key) ?? []), place]);
}

export function nearestIn(list: Place[], lat: number, lng: number) {
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

export const MAX_REFERENCE_KM = 150;

const cache = new Map<string, { place: Place; km: number } | null>();
/** La localidad que cita el título del sismo, o null si no cita ninguna (EMSC) o no está en la lista. */
export function resolveReference(event: Earthquake) {
  const [lng, lat] = event.geometry.coordinates;
  const label = event.properties.place;
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}|${label ?? ""}`;
  if (!cache.has(key)) {
    const found = label ? REFERENCE.exec(label) : null;
    let match: { place: Place; km: number } | null = null;
    if (found) {
      const name = normalize(found[1]);
      // Si varias localidades se llaman igual (hay tres Río Grande), la más cercana al sismo.
      const candidates = byName.get(normalize(ALIASES[name] ?? name));
      match = candidates ? nearestIn(candidates, lat, lng) : null;
    }
    cache.set(key, match && match.km <= MAX_REFERENCE_KM ? match : null);
  }
  return cache.get(key) ?? null;
}
