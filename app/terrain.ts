"use client";

import { mercatorX, mercatorY, planTiles } from "./satellite-tiles";

// Relieve de la vista 3D: la elevación del terreno sale de los mosaicos «Terrarium» del conjunto abierto Terrain Tiles de AWS
// (Mapzen, datos de SRTM y otras fuentes públicas). Cada píxel guarda la altura en metros: rojo × 256 + verde + azul / 256 − 32 768.
// Se usa una resolución baja (unos 600 m por píxel): basta para levantar montañas y valles a la escala de todo el país.
// No pasa por Vercel: los pide el navegador, con CORS para poder leer los píxeles.

const TILE = 256;
const url = (z: number, x: number, y: number) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;

export type Terrain = {
  // Altura del terreno en km en ese punto (0 en el mar o donde aún no llegó el mosaico).
  elevKm: (lng: number, lat: number) => number;
  // Luz que recibe el terreno en ese punto con el sol al noroeste y a 40° de altura (1 = plano, más en las laderas al sol,
  // menos en las de sombra). `exaggeration`: cuánto se exagera la pendiente, igual que la altura en la escena.
  shade: (lng: number, lat: number, exaggeration: number) => number;
};

const SUN = (() => {
  const [azimuth, altitude] = [(315 * Math.PI) / 180, (40 * Math.PI) / 180];
  return { x: Math.sin(azimuth) * Math.cos(altitude), y: Math.cos(azimuth) * Math.cos(altitude), z: Math.sin(altitude) };
})();

export function loadTerrain(bounds: { west: number; east: number; south: number; north: number }, maxTiles: number, onTile: () => void) {
  const plan = planTiles(bounds, maxTiles);
  const [cols, rows] = [plan.x1 - plan.x0 + 1, plan.y1 - plan.y0 + 1];
  const [width, height] = [cols * TILE, rows * TILE];
  const heights = new Float32Array(width * height);
  const scratch = document.createElement("canvas");
  scratch.width = TILE;
  scratch.height = TILE;
  const ctx = scratch.getContext("2d", { willReadFrequently: true });
  let cancelled = false;

  for (let x = plan.x0; x <= plan.x1; x++) {
    for (let y = plan.y0; y <= plan.y1; y++) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.decoding = "async";
      img.onload = () => {
        if (cancelled || !ctx) return;
        ctx.clearRect(0, 0, TILE, TILE);
        ctx.drawImage(img, 0, 0);
        let data: Uint8ClampedArray;
        try {
          data = ctx.getImageData(0, 0, TILE, TILE).data;
        } catch {
          return; // Sin CORS no se puede leer: ese cuadro queda plano.
        }
        const [ox, oy] = [(x - plan.x0) * TILE, (y - plan.y0) * TILE];
        for (let py = 0; py < TILE; py++) {
          for (let px = 0; px < TILE; px++) {
            const o = (py * TILE + px) * 4;
            const meters = data[o] * 256 + data[o + 1] + data[o + 2] / 256 - 32768;
            heights[(oy + py) * width + ox + px] = meters > 0 ? meters / 1000 : 0;
          }
        }
        onTile();
      };
      img.src = url(plan.z, x, y);
    }
  }

  // Interpolación bilineal entre los cuatro píxeles vecinos.
  const elevKm = (lng: number, lat: number) => {
    const fx = (mercatorX(lng, plan.z) - plan.x0) * TILE - 0.5;
    const fy = (mercatorY(lat, plan.z) - plan.y0) * TILE - 0.5;
    if (fx < 0 || fy < 0 || fx >= width - 1 || fy >= height - 1) return 0;
    const [x0, y0] = [Math.floor(fx), Math.floor(fy)];
    const [tx, ty] = [fx - x0, fy - y0];
    const i = y0 * width + x0;
    const top = heights[i] * (1 - tx) + heights[i + 1] * tx;
    const bottom = heights[i + width] * (1 - tx) + heights[i + width + 1] * tx;
    return top * (1 - ty) + bottom * ty;
  };

  // Pendiente con diferencias a ±2 km y normal de la superficie; luz de Lambert respecto al terreno plano.
  const shade = (lng: number, lat: number, exaggeration: number) => {
    const d = 0.018; // grados (~2 km)
    const kmX = 2 * d * 111.32 * Math.cos((lat * Math.PI) / 180);
    const kmY = 2 * d * 110.57;
    const dzdx = ((elevKm(lng + d, lat) - elevKm(lng - d, lat)) / kmX) * exaggeration;
    const dzdy = ((elevKm(lng, lat + d) - elevKm(lng, lat - d)) / kmY) * exaggeration;
    const norm = Math.hypot(dzdx, dzdy, 1);
    const light = (-dzdx * SUN.x - dzdy * SUN.y + SUN.z) / norm;
    return Math.min(1.45, Math.max(0.35, light / SUN.z));
  };

  return { terrain: { elevKm, shade } as Terrain, cancel: () => { cancelled = true; } };
}
