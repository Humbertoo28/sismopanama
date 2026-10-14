import { mercatorX, mercatorY } from "../satellite-tiles";

// Imagen satelital de un mapa plano de la historia sísmica. Mosaicos de Esri World Imagery (los mismos del mapa en vivo y de la vista 3D).
// Cada mosaico es un rectángulo entre dos longitudes y dos latitudes, y el mapa plano es lineal en las dos: se coloca tal cual (a esta
// escala la deformación de Mercator dentro de un mosaico es de una fracción de píxel). Siempre hay una capa de fondo con pocos mosaicos
// y, si el mapa se ve de cerca, otra con más detalle. La usan el mapa del explorador y el de los 12 más grandes (y su acercamiento).
export const IMAGERY = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile";
export const SAT_CREDIT = "Imagen © Esri, Maxar, Earthstar Geographics";
const SAT_BASE_Z = 7;
const SAT_MAX_Z = 11;
const SAT_MAX_TILES = 30;
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const tileLng = (x: number, z: number) => (x / 2 ** z) * 360 - 180;
const tileLat = (y: number, z: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) * 180) / Math.PI;

export type FrameBounds = { minLng: number; maxLng: number; minLat: number; maxLat: number };

type Tile = { z: number; x: number; y: number };
function tilesFor(z: number, west: number, east: number, south: number, north: number): Tile[] {
  const max = 2 ** z - 1;
  const x0 = clamp(Math.floor(mercatorX(west, z)), 0, max);
  const x1 = clamp(Math.floor(mercatorX(east, z)), 0, max);
  const y0 = clamp(Math.floor(mercatorY(north, z)), 0, max);
  const y1 = clamp(Math.floor(mercatorY(south, z)), 0, max);
  const list: Tile[] = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) list.push({ z, x, y });
  return list;
}

// `bounds` son las longitudes y latitudes que cubre el marco de `width` × `height` unidades; (vx, vy, vw, vh) es la parte del marco que
// se ve (todo el marco si no hay zoom) y `pxWidth` el ancho en pantalla de esa parte, que decide cuánto detalle se pide.
export function SatTiles({ bounds, width, height, vx, vy, vw, vh, pxWidth }: { bounds: FrameBounds; width: number; height: number; vx: number; vy: number; vw: number; vh: number; pxWidth: number }) {
  const lngSpan = bounds.maxLng - bounds.minLng;
  const latSpan = bounds.maxLat - bounds.minLat;
  const west = bounds.minLng + (vx / width) * lngSpan;
  const east = bounds.minLng + ((vx + vw) / width) * lngSpan;
  const north = bounds.maxLat - (vy / height) * latSpan;
  const south = bounds.maxLat - ((vy + vh) / height) * latSpan;
  const dpr = typeof window === "undefined" ? 1 : Math.min(2, window.devicePixelRatio || 1);
  // El zoom de mosaicos cuyo píxel casi iguala al de la pantalla (menos detalle si harían falta demasiados mosaicos).
  let z = clamp(Math.ceil(Math.log2(((pxWidth * dpr) / Math.max(east - west, 0.01)) * (360 / 256))), SAT_BASE_Z, SAT_MAX_Z);
  let detail = z > SAT_BASE_Z ? tilesFor(z, west, east, south, north) : [];
  while (detail.length > SAT_MAX_TILES && z > SAT_BASE_Z) {
    z -= 1;
    detail = z > SAT_BASE_Z ? tilesFor(z, west, east, south, north) : [];
  }
  const base = tilesFor(SAT_BASE_Z, bounds.minLng, bounds.maxLng, bounds.minLat, bounds.maxLat);
  // Los mosaicos se solapan medio píxel para que no queden rayas entre ellos.
  const overlap = 0.5 * (vw / width);
  const x = (lng: number) => ((lng - bounds.minLng) / lngSpan) * width;
  const y = (lat: number) => ((bounds.maxLat - lat) / latSpan) * height;
  const image = (tile: Tile) => {
    const left = x(tileLng(tile.x, tile.z));
    const right = x(tileLng(tile.x + 1, tile.z));
    const top = y(tileLat(tile.y, tile.z));
    const bottom = y(tileLat(tile.y + 1, tile.z));
    return (
      <image key={`${tile.z}/${tile.x}/${tile.y}`} href={`${IMAGERY}/${tile.z}/${tile.y}/${tile.x}`} x={left} y={top} width={right - left + overlap} height={bottom - top + overlap} preserveAspectRatio="none" />
    );
  };
  return (
    <g className="hx-tiles" aria-hidden="true">
      {base.map(image)}
      {detail.map(image)}
    </g>
  );
}
