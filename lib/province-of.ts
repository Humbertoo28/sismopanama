import type { Earthquake } from "./earthquakes";
import { PROVINCES, type Province } from "./provinces";

// A qué provincia o comarca pertenece un sismo, según sus coordenadas. Muchas réplicas caen en el mar frente a la
// costa: esas se asignan a la división más cercana (si está a menos de NEAR_KM) y se marcan como "mar". Más lejos
// que eso quedan en "Mar adentro".
export const PROVINCE_BY_ID = new Map<string, Province>(PROVINCES.map(province => [province.id, province]));
export const FAR_OFFSHORE = "mar";
const NEAR_KM = 90;

export type ProvinceMatch = { id: string; name: string; offshore: boolean } | null;

function insideRing(lng: number, lat: number, ring: [number, number][]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Distancia (km) de un punto al borde de un anillo, con la aproximación plana de siempre (sobra para <100 km).
function distanceToRing(lng: number, lat: number, ring: [number, number][]) {
  const kx = Math.cos((lat * Math.PI) / 180) * 111.32;
  const ky = 110.57;
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const [ax, ay] = ring[i];
    const [bx, by] = ring[(i + 1) % ring.length];
    const dx = (bx - ax) * kx;
    const dy = (by - ay) * ky;
    const px = (lng - ax) * kx;
    const py = (lat - ay) * ky;
    const t = dx === 0 && dy === 0 ? 0 : Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy)));
    best = Math.min(best, Math.hypot(px - t * dx, py - t * dy));
  }
  return best;
}

export function provinceOf(lat: number, lng: number): ProvinceMatch {
  for (const province of PROVINCES) {
    if (province.rings.some(ring => insideRing(lng, lat, ring))) return { id: province.id, name: province.name, offshore: false };
  }
  let nearest: Province | null = null;
  let nearestKm = Infinity;
  for (const province of PROVINCES) {
    for (const ring of province.rings) {
      const km = distanceToRing(lng, lat, ring);
      if (km < nearestKm) {
        nearestKm = km;
        nearest = province;
      }
    }
  }
  return nearest && nearestKm <= NEAR_KM ? { id: nearest.id, name: nearest.name, offshore: true } : null;
}

// Cada consulta trae de nuevo todos los sismos: se recuerda el resultado por posición.
const cache = new Map<string, ProvinceMatch>();
export function provinceOfEvent(event: Earthquake): ProvinceMatch {
  const [lng, lat] = event.geometry.coordinates;
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  if (!cache.has(key)) cache.set(key, provinceOf(lat, lng));
  return cache.get(key) ?? null;
}

/** Valor del filtro de un sismo: el id de su provincia o comarca, o "mar" si cae lejos de toda costa. */
export function provinceKey(event: Earthquake) {
  return provinceOfEvent(event)?.id ?? FAR_OFFSHORE;
}

export function provinceLabel(event: Earthquake) {
  const match = provinceOfEvent(event);
  if (!match) return "Mar adentro";
  return match.offshore ? `Mar frente a ${match.name}` : match.name;
}
