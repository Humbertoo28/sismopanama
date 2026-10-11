import { DISTRICTS } from "./places";
import { PROVINCES } from "./provinces";

// Dónde escribir el nombre de cada provincia o comarca: el centro del anillo más grande (el continente, no las islas),
// o el centro de su caja si ese punto cae fuera del contorno (provincias en forma de media luna).
export type MapLabel = { id: string; name: string; lat: number; lng: number };

function insideRing(lng: number, lat: number, ring: [number, number][]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function areaAndCentroid(ring: [number, number][]) {
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % ring.length];
    const cross = x0 * y1 - x1 * y0;
    area += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  area /= 2;
  return area === 0 ? { area: 0, lng: ring[0][0], lat: ring[0][1] } : { area: Math.abs(area), lng: cx / (6 * area), lat: cy / (6 * area) };
}

export const PROVINCE_LABELS: MapLabel[] = PROVINCES.map(province => {
  const largest = province.rings.map(ring => ({ ring, ...areaAndCentroid(ring) })).sort((a, b) => b.area - a.area)[0];
  const [[south, west], [north, east]] = province.bounds;
  const center = { lng: (west + east) / 2, lat: (south + north) / 2 };
  const point = insideRing(largest.lng, largest.lat, largest.ring) ? largest : center;
  return { id: province.id, name: province.name, lat: point.lat, lng: point.lng };
});

// Cabeceras de distrito para rotular al acercar el 3D: primero las de las capitales de provincia (código terminado en
// «01»), luego las demás. GeoNames, CC BY 4.0 (como lib/places.ts).
export const TOWN_LABELS: MapLabel[] = Object.entries(DISTRICTS)
  .sort(([a], [b]) => Number(b.endsWith("01")) - Number(a.endsWith("01")) || a.localeCompare(b))
  .map(([code, district]) => ({ id: code, name: district.name, lat: district.lat, lng: district.lng }));
