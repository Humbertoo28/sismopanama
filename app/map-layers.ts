import type { Fault } from "../lib/usgs-detail";

// Geometría de las capas del USGS en el mapa plano. Todo sale de los datos publicados: aquí solo se ordena y se interpola
// para dibujarlo de forma continua (sin inventar valores fuera de lo que trae el modelo).

// ---------- Ruptura de la falla (modelo de falla finita del USGS) ----------
//
// El modelo divide el plano de falla en una rejilla de celdas (a lo largo del rumbo × a lo largo del buzamiento), cada una con
// su deslizamiento (m), el segundo en que empezó a romperse y cuánto tardó. Dibujarlas como rectángulos sueltos daba un mosaico
// raro; aquí se reconstruye la rejilla y se interpola el deslizamiento entre los centros de las celdas, como en los mapas del
// propio USGS. Fuera del plano de falla no se pinta nada.

type Grid = {
  ni: number;
  nj: number;
  slip: Float32Array; // ni × nj, en m (0 donde el modelo no tiene celda)
  start: Float32Array; // segundo en que empieza a deslizarse cada celda
  rise: Float32Array; // segundos que tarda en llegar a su deslizamiento final
  timed: boolean;
};

export type SlipRaster = {
  bounds: [[number, number], [number, number]]; // [[sur, oeste], [norte, este]]
  outline: [number, number][]; // contorno del plano proyectado en la superficie, [lat, lng]
  topEdge: [number, number][]; // borde menos profundo (el más cercano a la superficie), [lat, lng]
  topDepthKm: number;
  durationS: number | null;
  maxSlipM: number;
  render: (canvas: HTMLCanvasElement, atSecond?: number) => void;
};

const KM_PER_DEG_LAT = 110.57;

export function buildSlipRaster(fault: Fault): SlipRaster | null {
  const cells = fault.subfaults;
  if (cells.length < 4) return null;
  // Plano local en km alrededor del centro del modelo.
  const corners = cells.flatMap(cell => cell.ring);
  const lat0 = corners.reduce((sum, c) => sum + c[1], 0) / corners.length;
  const lng0 = corners.reduce((sum, c) => sum + c[0], 0) / corners.length;
  const kx = Math.cos((lat0 * Math.PI) / 180) * 111.32;
  const toKm = (lng: number, lat: number) => [(lng - lng0) * kx, (lat - lat0) * KM_PER_DEG_LAT] as const;
  const toLngLat = (x: number, y: number) => [lng0 + x / kx, lat0 + y / KM_PER_DEG_LAT] as const;

  // Ejes del plano: a lo largo del rumbo y hacia donde buza (rumbo + 90°, regla de la mano derecha), en este y norte.
  const strike = ((fault.strike ?? 0) * Math.PI) / 180;
  const along = [Math.sin(strike), Math.cos(strike)] as const;
  const down = [Math.sin(strike + Math.PI / 2), Math.cos(strike + Math.PI / 2)] as const;
  const uv = (x: number, y: number) => [x * along[0] + y * along[1], x * down[0] + y * down[1]] as const;

  // Tamaño de celda: lo que mide cada una en u y v (mediana, por si alguna viene deformada).
  const spans = cells.map(cell => {
    const pts = cell.ring.map(([lng, lat]) => uv(...toKm(lng, lat)));
    const us = pts.map(p => p[0]);
    const vs = pts.map(p => p[1]);
    return { du: Math.max(...us) - Math.min(...us), dv: Math.max(...vs) - Math.min(...vs), u: us.reduce((a, b) => a + b) / 4, v: vs.reduce((a, b) => a + b) / 4 };
  });
  const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const du = median(spans.map(s => s.du));
  const dv = median(spans.map(s => s.dv));
  if (!(du > 0.1 && dv > 0.1)) return null;
  const u0 = Math.min(...spans.map(s => s.u)) - du / 2;
  const v0 = Math.min(...spans.map(s => s.v)) - dv / 2;
  const ni = Math.round((Math.max(...spans.map(s => s.u)) + du / 2 - u0) / du);
  const nj = Math.round((Math.max(...spans.map(s => s.v)) + dv / 2 - v0) / dv);
  if (ni < 2 || nj < 2 || ni * nj > 4000) return null;

  const grid: Grid = { ni, nj, slip: new Float32Array(ni * nj), start: new Float32Array(ni * nj).fill(Infinity), rise: new Float32Array(ni * nj).fill(1), timed: cells.every(c => c.t !== null && c.rise !== null) };
  const used = new Set<number>();
  cells.forEach((cell, k) => {
    const i = Math.min(ni - 1, Math.max(0, Math.floor((spans[k].u - u0) / du)));
    const j = Math.min(nj - 1, Math.max(0, Math.floor((spans[k].v - v0) / dv)));
    const index = j * ni + i;
    used.add(index);
    grid.slip[index] = Math.max(grid.slip[index], cell.slip);
    if (cell.t !== null) grid.start[index] = cell.t;
    if (cell.rise !== null) grid.rise[index] = Math.max(0.5, cell.rise);
  });
  // Si la rejilla no se pudo reconstruir (celdas que caen en el mismo lugar), mejor no dibujar que dibujar mal.
  if (used.size < cells.length * 0.9) return null;

  // Profundidad media de cada fila a lo largo del buzamiento: el borde superior es la fila menos profunda.
  const rowDepth = (j: number) => {
    const inRow = cells.filter((_, k) => Math.floor((spans[k].v - v0) / dv) === j);
    return inRow.length ? inRow.reduce((sum, c) => sum + c.ring.reduce((s, r) => s + r[2], 0) / 4, 0) / inRow.length : NaN;
  };
  const topIsV0 = !(rowDepth(nj - 1) < rowDepth(0));
  const topDepthKm = Math.max(0, Math.min(...cells.flatMap(c => c.ring.map(r => r[2]))));

  const corner = (u: number, v: number) => {
    const x = u * along[0] + v * down[0];
    const y = u * along[1] + v * down[1];
    const [lng, lat] = toLngLat(x, y);
    return [lat, lng] as [number, number];
  };
  const [u1, v1] = [u0 + ni * du, v0 + nj * dv];
  const outline = [corner(u0, v0), corner(u1, v0), corner(u1, v1), corner(u0, v1)];
  const topEdge = topIsV0 ? [corner(u0, v0), corner(u1, v0)] : [corner(u0, v1), corner(u1, v1)];
  const lats = outline.map(c => c[0]);
  const lngs = outline.map(c => c[1]);
  const bounds: SlipRaster["bounds"] = [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]];
  const maxSlip = Math.max(...grid.slip);

  // Deslizamiento (interpolado) en un punto del plano, en coordenadas de rejilla; `at` limita al que llevaba en ese segundo.
  const sample = (fi: number, fj: number, at: number | undefined) => {
    const i0 = Math.min(ni - 1, Math.max(0, Math.floor(fi)));
    const j0 = Math.min(nj - 1, Math.max(0, Math.floor(fj)));
    const i1 = Math.min(ni - 1, i0 + 1);
    const j1 = Math.min(nj - 1, j0 + 1);
    const tx = Math.min(1, Math.max(0, fi - i0));
    const ty = Math.min(1, Math.max(0, fj - j0));
    const value = (i: number, j: number) => {
      const k = j * ni + i;
      if (at === undefined || !grid.timed) return grid.slip[k];
      return grid.slip[k] * Math.min(1, Math.max(0, (at - grid.start[k]) / grid.rise[k]));
    };
    const top = value(i0, j0) * (1 - tx) + value(i1, j0) * tx;
    const bottom = value(i0, j1) * (1 - tx) + value(i1, j1) * tx;
    return top * (1 - ty) + bottom * ty;
  };

  const render = (canvas: HTMLCanvasElement, at?: number) => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { width, height } = canvas;
    const image = ctx.createImageData(width, height);
    const [[south, west], [north, east]] = bounds;
    // Valor en cada píxel; se guarda para trazar después las curvas de igual deslizamiento.
    const values = new Float32Array(width * height).fill(-1);
    for (let py = 0; py < height; py++) {
      const lat = north - ((py + 0.5) / height) * (north - south);
      for (let px = 0; px < width; px++) {
        const lng = west + ((px + 0.5) / width) * (east - west);
        const [u, v] = uv(...toKm(lng, lat));
        const fi = (u - u0) / du - 0.5;
        const fj = (v - v0) / dv - 0.5;
        if (fi < -0.5 || fj < -0.5 || fi > ni - 0.5 || fj > nj - 0.5) continue;
        const slip = sample(fi, fj, at);
        values[py * width + px] = slip;
        const t = Math.min(1, slip / maxSlip);
        const [r, g, b] = slipRgb(t);
        const o = (py * width + px) * 4;
        image.data[o] = r;
        image.data[o + 1] = g;
        image.data[o + 2] = b;
        // Lo que casi no se deslizó queda transparente: se ve la mancha de la ruptura, no un rectángulo.
        image.data[o + 3] = Math.round(235 * smooth(Math.min(1, t * 1.6)));
      }
    }
    // Curvas cada 2 m: un píxel oscuro donde el valor cruza el nivel respecto del vecino.
    const step = 2;
    for (let py = 1; py < height; py++) {
      for (let px = 1; px < width; px++) {
        const here = values[py * width + px];
        if (here < 0) continue;
        const left = values[py * width + px - 1];
        const up = values[(py - 1) * width + px];
        const level = Math.floor(here / step);
        if ((left >= 0 && Math.floor(left / step) !== level) || (up >= 0 && Math.floor(up / step) !== level)) {
          const o = (py * width + px) * 4;
          image.data[o] = 60;
          image.data[o + 1] = 10;
          image.data[o + 2] = 10;
          image.data[o + 3] = 200;
        }
      }
    }
    ctx.putImageData(image, 0, 0);
  };

  return { bounds, outline, topEdge, topDepthKm, durationS: fault.durationS, maxSlipM: maxSlip, render };
}

const smooth = (t: number) => t * t * (3 - 2 * t);

// De amarillo pálido (poco) a rojo oscuro (el máximo), la escala habitual de los mapas de deslizamiento.
const SLIP_STOPS: [number, number, number][] = [[255, 245, 180], [255, 204, 77], [247, 126, 39], [214, 47, 39], [128, 0, 38]];
export function slipRgb(t: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, t)) * (SLIP_STOPS.length - 1);
  const i = Math.min(SLIP_STOPS.length - 2, Math.floor(x));
  return SLIP_STOPS[i].map((c, k) => Math.round(c + (SLIP_STOPS[i + 1][k] - c) * (x - i))) as [number, number, number];
}
export const SLIP_GRADIENT = `linear-gradient(90deg, ${[0, 0.25, 0.5, 0.75, 1].map(t => `rgb(${slipRgb(t).join(",")})`).join(", ")})`;

// ---------- Reportes de «¿Lo sentiste?» ----------
// Radio (m) del círculo de una zona de 10 km según cuántas personas respondieron: más reportes, círculo más grande, hasta
// llenar la zona. Una zona con un solo reporte se ve pequeña: es un dato menos firme.
export function feltRadiusM(responses: number) {
  return Math.min(5000, 1500 + 1100 * Math.sqrt(Math.max(1, responses) - 1));
}

// ---------- Límites de placas: triángulos de subducción ----------
// Puntos (en píxeles de la capa del mapa) de los triángulos a lo largo de una línea, del lado `side` (+1 izquierda, −1 derecha
// según el sentido de la línea). `spacing` y `size` en píxeles: se recalculan al cambiar el zoom.
export function teethAlong(points: { x: number; y: number }[], side: 1 | -1, spacing = 26, size = 7) {
  const teeth: { x: number; y: number }[][] = [];
  let walked = 0;
  let next = spacing / 2;
  for (let k = 0; k < points.length - 1; k++) {
    const a = points[k];
    const b = points[k + 1];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length === 0) continue;
    const [tx, ty] = [(b.x - a.x) / length, (b.y - a.y) / length];
    // Normal hacia la izquierda del sentido de la línea (en pantalla, y crece hacia abajo).
    const [nx, ny] = [ty * side, -tx * side];
    for (; next <= walked + length; next += spacing) {
      const d = next - walked;
      const cx = a.x + tx * d;
      const cy = a.y + ty * d;
      teeth.push([
        { x: cx - tx * size * 0.75, y: cy - ty * size * 0.75 },
        { x: cx + tx * size * 0.75, y: cy + ty * size * 0.75 },
        { x: cx + nx * size, y: cy + ny * size },
      ]);
    }
    walked += length;
  }
  return teeth;
}

// De qué lado de la línea queda un punto (+1 izquierda, −1 derecha), en píxeles de pantalla.
export function sideOf(points: { x: number; y: number }[], target: { x: number; y: number }): 1 | -1 {
  const mid = Math.max(0, Math.floor(points.length / 2) - 1);
  const a = points[mid];
  const b = points[Math.min(points.length - 1, mid + 1)];
  const cross = (b.x - a.x) * (target.y - a.y) - (b.y - a.y) * (target.x - a.x);
  return cross < 0 ? 1 : -1;
}
