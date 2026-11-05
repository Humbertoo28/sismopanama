import { ACTIVE_FAULTS, type ActiveFault } from "./active-faults";

// Geometría de la falla de Pedro Miguel para su página (/falla-pedro-miguel): la caja de la escena, la proyección de los mosaicos del
// satélite y las distancias a la traza. Todo se calcula con el trazado publicado (CCAF-DB / GEM); no hay cifras estimadas.

export const PEDRO_MIGUEL_ID = "pedro-miguel";

export function pedroMiguel(): ActiveFault {
  const fault = ACTIVE_FAULTS.find(item => item.id === PEDRO_MIGUEL_ID);
  if (!fault) throw new Error("Falta la falla de Pedro Miguel en lib/active-faults.ts");
  return fault;
}

// Zona que muestra la escena: de La Chorrera al borde oriental de la ciudad de Panamá y de Taboga a Chilibre y más al norte.
export const SCENE_BOX = { west: -79.78, east: -79.48, south: 8.86, north: 9.22 } as const;
// Nivel de zoom de los mosaicos del satélite (a esta latitud, unos 38 m por píxel): 4 × 5 mosaicos cubren la zona.
export const TILE_ZOOM = 12;

const KM_PER_DEG_LNG = 111.32;
const KM_PER_DEG_LAT = 110.57;

/** Píxel del mundo (Mercator web, mosaicos de 256 px) de una longitud y una latitud. */
export function worldPixel(lng: number, lat: number, zoom: number) {
  const world = 256 * 2 ** zoom;
  const s = Math.sin((lat * Math.PI) / 180);
  return { x: ((lng + 180) / 360) * world, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * world };
}

/** Kilómetros por píxel de los mosaicos a una latitud. */
export function kmPerPixel(lat: number, zoom: number) {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom / 1000;
}

/** Distancia (km) de un punto al trazado, con la aproximación plana de siempre (sobra a esta escala), y de qué lado queda. */
export function nearestOnTrace(lat: number, lng: number, lines: [number, number][][]) {
  const kx = Math.cos((lat * Math.PI) / 180) * KM_PER_DEG_LNG;
  let best = { km: Infinity, side: "oeste" as "oeste" | "este" };
  for (const line of lines) {
    for (let i = 0; i < line.length - 1; i++) {
      const [ax, ay] = line[i];
      const [bx, by] = line[i + 1];
      const [dx, dy] = [(bx - ax) * kx, (by - ay) * KM_PER_DEG_LAT];
      const [px, py] = [(lng - ax) * kx, (lat - ay) * KM_PER_DEG_LAT];
      const t = dx === 0 && dy === 0 ? 0 : Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy)));
      const km = Math.hypot(px - t * dx, py - t * dy);
      if (km < best.km) best = { km, side: px - t * dx < 0 ? "oeste" : "este" };
    }
  }
  return best;
}

/** Largo (km) de un tramo del trazado. */
export function traceLengthKm(points: [number, number][]) {
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, ay] = points[i];
    const [bx, by] = points[i + 1];
    total += Math.hypot((bx - ax) * Math.cos((((ay + by) / 2) * Math.PI) / 180) * KM_PER_DEG_LNG, (by - ay) * KM_PER_DEG_LAT);
  }
  return total;
}

/** Un sismo de los que dibuja la escena. */
export type SceneQuake = {
  id: string;
  time: number;
  mag: number | null;
  depthKm: number | null;
  lat: number;
  lng: number;
  place: string;
  source: "usgs" | "igc" | "emsc";
  /** El del 4 de noviembre de 2026, el que relacionó el IGC con la falla. */
  highlight?: boolean;
  /** Distancia horizontal al trazado de la falla y de qué lado queda (cálculo propio con las posiciones publicadas). */
  traceKm?: number;
  traceSide?: "oeste" | "este";
};

/** Los catálogos suelen fijar 5 o 10 km cuando los datos no alcanzan para calcular la profundidad (USGS): no es una medición. */
export function depthIsAssigned(depthKm: number | null) {
  return depthKm === 5 || depthKm === 10;
}

export function inSceneBox(lat: number, lng: number) {
  return lat >= SCENE_BOX.south && lat <= SCENE_BOX.north && lng >= SCENE_BOX.west && lng <= SCENE_BOX.east;
}
