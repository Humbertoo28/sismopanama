"use client";

// Imagen satelital para la superficie de la vista 3D: los mismos mosaicos de Esri World Imagery que usa el mapa 2D
// («Esri Sat»), armados en un solo lienzo y pegados al plano con triángulos. Sobre cada uno se mezcla el relieve sombreado de
// Esri (World Shaded Relief): las montañas se ven con volumen y el mar algo más azul. No pasan por Vercel: los pide el navegador.

const TILE = 256;

export type TilePlan = { z: number; x0: number; x1: number; y0: number; y1: number };
export type Mosaic = { canvas: HTMLCanvasElement; plan: TilePlan };

export const mercatorX = (lng: number, z: number) => ((lng + 180) / 360) * 2 ** z;
export const mercatorY = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z;
};

// El zoom más fino que cubre la zona con pocos mosaicos: así pesa lo mismo con todo Panamá que con una provincia.
export function planTiles(b: { west: number; east: number; south: number; north: number }, maxTiles: number): TilePlan {
  let plan: TilePlan = { z: 4, x0: 0, x1: 0, y0: 0, y1: 0 };
  for (let z = 10; z >= 4; z--) {
    plan = { z, x0: Math.floor(mercatorX(b.west, z)), x1: Math.floor(mercatorX(b.east, z)), y0: Math.floor(mercatorY(b.north, z)), y1: Math.floor(mercatorY(b.south, z)) };
    if ((plan.x1 - plan.x0 + 1) * (plan.y1 - plan.y0 + 1) <= maxTiles) break;
  }
  return plan;
}

const images = new Map<string, HTMLImageElement>();
const tileUrl = (service: string, z: number, x: number, y: number) => `https://server.arcgisonline.com/ArcGIS/rest/services/${service}/MapServer/tile/${z}/${y}/${x}`;
const BASE = "World_Imagery";
const RELIEF = "World_Shaded_Relief";
// Cuánto se nota el relieve sobre la imagen (mezcla «soft-light»: aclara las laderas al sol y oscurece las de sombra).
const RELIEF_ALPHA = 0.9;
// Los mosaicos se piden primero con CORS: un lienzo con imágenes de otro sitio sin CORS no se puede pasar a WebGL, y con CORS la
// superficie se dibuja en la tarjeta gráfica (ver surface-gl.ts). Si el servidor no lo permite (un mosaico que falla con CORS y
// carga sin él), se pide como siempre y la superficie se dibuja en 2D. null = aún no se sabe.
let cors: boolean | null = null;

// Arma el lienzo con los mosaicos y avisa cada vez que llega uno (`ok` falso si no se pudo bajar).
export function loadMosaic(plan: TilePlan, onTile: (ok: boolean) => void): { mosaic: Mosaic; cancel: () => void } {
  const canvas = document.createElement("canvas");
  canvas.width = (plan.x1 - plan.x0 + 1) * TILE;
  canvas.height = (plan.y1 - plan.y0 + 1) * TILE;
  const ctx = canvas.getContext("2d");
  let cancelled = false;
  // Pide un mosaico (con CORS si se puede) y avisa con la imagen o con null si no llegó.
  const fetchTile = (service: string, x: number, y: number, done: (img: HTMLImageElement | null) => void) => {
    const key = `${service}/${plan.z}/${x}/${y}`;
    const cached = images.get(key);
    if (cached?.complete && cached.naturalWidth) {
      queueMicrotask(() => !cancelled && done(cached));
      return;
    }
    const request = (withCors: boolean) => {
      const img = new Image();
      img.decoding = "async";
      if (withCors) img.crossOrigin = "anonymous";
      img.onload = () => {
        if (withCors) cors = true;
        else if (cors === null) cors = false;
        images.set(key, img);
        if (!cancelled) done(img);
      };
      img.onerror = () => {
        // Con CORS puede fallar porque el servidor no lo permite: se vuelve a pedir sin él antes de darlo por perdido.
        if (withCors) request(false);
        else if (!cancelled) done(null);
      };
      img.src = tileUrl(service, plan.z, x, y);
    };
    request(cors !== false);
  };
  for (let x = plan.x0; x <= plan.x1; x++) {
    for (let y = plan.y0; y <= plan.y1; y++) {
      const [dx, dy] = [(x - plan.x0) * TILE, (y - plan.y0) * TILE];
      // El relieve se mezcla cuando ya está la imagen de ese cuadro; si el relieve no llega, queda solo la imagen.
      let base: HTMLImageElement | null | undefined;
      let relief: HTMLImageElement | null | undefined;
      const compose = () => {
        if (!ctx || base === undefined || relief === undefined) return;
        if (!base) {
          onTile(false);
          return;
        }
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;
        ctx.drawImage(base, dx, dy, TILE, TILE);
        if (relief) {
          ctx.globalCompositeOperation = "soft-light";
          ctx.globalAlpha = RELIEF_ALPHA;
          ctx.drawImage(relief, dx, dy, TILE, TILE);
          ctx.globalCompositeOperation = "source-over";
          ctx.globalAlpha = 1;
        }
        onTile(true);
      };
      fetchTile(BASE, x, y, img => { base = img; compose(); });
      fetchTile(RELIEF, x, y, img => { relief = img; compose(); });
    }
  }
  return { mosaic: { canvas, plan }, cancel: () => { cancelled = true; } };
}

type Screen = { sx: number; sy: number };

// Pinta una imagen sobre el rectángulo de la superficie ya proyectado: se divide en una cuadrícula y cada celda en dos
// triángulos, y cada triángulo recibe la transformación que lleva su trozo de imagen a la pantalla. `uv` dice en qué
// punto de la imagen cae cada longitud y latitud. El contexto debe traer ya la escala del dispositivo.
export function paintTexture(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  uv: (lng: number, lat: number) => [number, number],
  bounds: { west: number; east: number; south: number; north: number },
  project: (lng: number, lat: number) => Screen,
  cols: number,
  rows: number,
  // Con imágenes semitransparentes, cada triángulo borra antes lo que hay en su zona para que las uniones no se vean más oscuras.
  replace = false,
) {
  const grid: { u: number; v: number; sx: number; sy: number }[][] = [];
  for (let j = 0; j <= rows; j++) {
    const lat = bounds.north - ((bounds.north - bounds.south) * j) / rows;
    const line = [];
    for (let i = 0; i <= cols; i++) {
      const lng = bounds.west + ((bounds.east - bounds.west) * i) / cols;
      const { sx, sy } = project(lng, lat);
      const [u, v] = uv(lng, lat);
      line.push({ u, v, sx, sy });
    }
    grid.push(line);
  }
  type Vertex = (typeof grid)[number][number];
  const triangle = (a: Vertex, b: Vertex, c: Vertex) => {
    const det = (b.u - a.u) * (c.v - a.v) - (c.u - a.u) * (b.v - a.v);
    if (Math.abs(det) < 1e-9) return;
    const m = {
      a: ((b.sx - a.sx) * (c.v - a.v) - (c.sx - a.sx) * (b.v - a.v)) / det,
      c: ((c.sx - a.sx) * (b.u - a.u) - (b.sx - a.sx) * (c.u - a.u)) / det,
      b: ((b.sy - a.sy) * (c.v - a.v) - (c.sy - a.sy) * (b.v - a.v)) / det,
      d: ((c.sy - a.sy) * (b.u - a.u) - (b.sy - a.sy) * (c.u - a.u)) / det,
    };
    // Se agranda un poco el triángulo para que no queden rendijas entre vecinos.
    const cx = (a.sx + b.sx + c.sx) / 3;
    const cy = (a.sy + b.sy + c.sy) / 3;
    const grow = (p: Vertex) => {
      const dx = p.sx - cx;
      const dy = p.sy - cy;
      const len = Math.hypot(dx, dy) || 1;
      return [p.sx + (dx / len) * 0.8, p.sy + (dy / len) * 0.8] as const;
    };
    ctx.save();
    ctx.beginPath();
    [a, b, c].map(grow).forEach(([x, y], i) => {
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    });
    ctx.closePath();
    ctx.clip();
    if (replace) ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.transform(m.a, m.b, m.c, m.d, a.sx - m.a * a.u - m.c * a.v, a.sy - m.b * a.u - m.d * a.v);
    ctx.drawImage(canvas, 0, 0);
    ctx.restore();
  };
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      triangle(grid[j][i], grid[j][i + 1], grid[j + 1][i]);
      triangle(grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]);
    }
  }
}

// El mosaico satelital: la imagen está en proyección Web Mercator.
export function paintMosaic(
  ctx: CanvasRenderingContext2D,
  { canvas, plan }: Mosaic,
  bounds: { west: number; east: number; south: number; north: number },
  project: (lng: number, lat: number) => Screen,
  cols: number,
  rows: number,
) {
  paintTexture(ctx, canvas, (lng, lat) => [(mercatorX(lng, plan.z) - plan.x0) * TILE, (mercatorY(lat, plan.z) - plan.y0) * TILE], bounds, project, cols, rows);
}
