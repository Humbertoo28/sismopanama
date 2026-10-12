// Matemática de la cámara de la vista 3D (app/quake-3d.tsx): proyección, encuadre y giro. Sin React ni el DOM, así se
// puede comprobar con scripts/check-camera.ts.

// px y py: desplazamiento de la escena en píxeles (mover con dos dedos o Mayús + arrastrar).
export type Camera = { yaw: number; pitch: number; zoom: number; px: number; py: number };
export type Point = { x: number; y: number; z: number };

// Márgenes del encuadre (izquierda, derecha, vertical): a la izquierda van los kilómetros de profundidad.
export const marginsFor = (w: number) => (w < 480 ? ([44, 18, 52] as const) : ([56, 60, 42] as const));
export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

// Punto de vista inicial según la forma del lienzo: en uno alto o casi cuadrado (celular, tablet vertical) se mira a lo largo
// de la caja, que es larga y angosta, así llena el alto en vez de quedar chica en el centro.
export const homeFor = (w: number, h: number): Camera => {
  const aspect = w / h;
  // Se mira desde el sur-suroeste, hacia donde buza la falla: así la ruptura se ve de frente y no de canto.
  return aspect < 1 ? { yaw: 78, pitch: 48, zoom: 1, px: 0, py: 0 } : { yaw: 12, pitch: 46, zoom: 1, px: 0, py: 0 };
};

export type SceneInfo = {
  south: number; north: number; west: number; east: number;
  lat0: number; lng0: number;
  toKm: (lng: number, lat: number) => { x: number; y: number };
  floorKm: number; halfW: number; halfH: number;
};

// Cámara → pantalla. Km (este, norte, arriba) pasan a un plano con un poco de perspectiva. `depth` crece hacia quien mira,
// para ordenar de lejos a cerca.
//
// La escala y el centro se miden UNA sola vez, con la caja entera (superficie y suelo de profundidad) vista desde el punto
// de vista inicial, y valen para cualquier ángulo: girar o cambiar de vista nunca acerca ni aleja la escena (antes la caja
// se volvía a encuadrar con cada ángulo y la escena «respiraba» al girar). El zoom (`camera.zoom`) es lo único que cambia la
// escala, y 1× es toda la caja justa en la vista inicial.
export function makeProjection(scene: SceneInfo, camera: Camera, w: number, h: number, exaggeration: number) {
  const depthSpan = scene.floorKm * exaggeration;
  const radius = Math.hypot(scene.halfW, scene.halfH, depthSpan / 2);
  const dist = radius * 3.2;
  const midZ = -depthSpan / 2;
  const at = (lng: number, lat: number, depthKm: number): Point => ({ ...scene.toKm(lng, lat), z: -depthKm * exaggeration });
  const rotation = (yawDeg: number, pitchDeg: number) => {
    const yaw = (yawDeg * Math.PI) / 180;
    const pitch = (pitchDeg * Math.PI) / 180;
    const [cy, sy, cp, sp] = [Math.cos(yaw), Math.sin(yaw), Math.cos(pitch), Math.sin(pitch)];
    const raw = (p: Point) => {
      const x1 = p.x * cy - p.y * sy;
      const y1 = p.x * sy + p.y * cy;
      const z1 = p.z - midZ;
      const toward = -y1 * cp + z1 * sp;
      const k = dist / (dist - toward);
      return { rx: x1 * k, ry: (y1 * sp + z1 * cp) * k, depth: toward, k };
    };
    return { cy, sy, cp, sp, raw };
  };
  const corners = ([scene.south, scene.north] as const).flatMap(lat => ([scene.west, scene.east] as const).flatMap(lng => [at(lng, lat, 0), at(lng, lat, scene.floorKm)]));
  const extent = (yaw: number, pitch: number) => {
    const projected = corners.map(rotation(yaw, pitch).raw);
    const [minX, maxX] = [Math.min(...projected.map(r => r.rx)), Math.max(...projected.map(r => r.rx))];
    const [minY, maxY] = [Math.min(...projected.map(r => r.ry)), Math.max(...projected.map(r => r.ry))];
    return { minX, maxX, minY, maxY };
  };
  const [marginL, marginR, marginV] = marginsFor(w);
  const [availW, availH] = [w - marginL - marginR, h - 2 * marginV];
  const home = homeFor(w, h);
  const ref = extent(home.yaw, home.pitch);
  const fit = Math.min(availW / (ref.maxX - ref.minX), availH / (ref.maxY - ref.minY));
  const [refX, refY] = [(ref.minX + ref.maxX) / 2, (ref.minY + ref.maxY) / 2];
  const scale = fit * camera.zoom;
  const originX = marginL + availW / 2;
  const view = rotation(camera.yaw, camera.pitch);
  const project = (p: Point) => {
    const r = view.raw(p);
    return { sx: originX + (r.rx - refX) * scale + camera.px, sy: h / 2 - (r.ry - refY) * scale + camera.py, depth: r.depth, k: r.k };
  };
  // Zoom y desplazamiento con los que la caja entera cabe justa y centrada mirándola desde (yaw, pitch). `cap` limita el zoom
  // (para no acercar más de lo que ya se estaba al cambiar de vista).
  const framing = (yaw: number, pitch: number, cap = Infinity) => {
    const e = extent(yaw, pitch);
    const zoom = Math.min(cap, availW / ((e.maxX - e.minX) * fit), availH / ((e.maxY - e.minY) * fit));
    return { zoom, px: -((e.minX + e.maxX) / 2 - refX) * fit * zoom, py: ((e.minY + e.maxY) / 2 - refY) * fit * zoom };
  };
  // Punto del mundo que se ve en (sx, sy), donde el rayo de la vista toca la superficie. Si se mira casi de lado (el rayo no
  // llega a la superficie) queda sobre el mismo rayo, más cerca de ella. Sirve de eje al girar: ese punto no se mueve en pantalla.
  const surfacePoint = (sx: number, sy: number): Point => {
    const rx = (sx - camera.px - originX) / scale + refX;
    const ry = (h / 2 - (sy - camera.py)) / scale + refY;
    const toward = clamp((depthSpan / 2 - ry * view.cp) / Math.max(view.sp - (ry * view.cp) / dist, 0.3), -radius * 1.5, radius * 1.5);
    const f = (dist - toward) / dist;
    const [x1, up] = [rx * f, ry * f];
    const y1 = up * view.sp - toward * view.cp;
    const z1 = up * view.cp + toward * view.sp;
    return {
      x: clamp(x1 * view.cy + y1 * view.sy, -scene.halfW, scene.halfW),
      y: clamp(-x1 * view.sy + y1 * view.cy, -scene.halfH, scene.halfH),
      z: clamp(z1 + midZ, -depthSpan, 0),
    };
  };
  return { at, project, sp: view.sp, fit, originX, framing, surfacePoint };
}

// Cuánto se está explorando (acercado o movido) respecto a la vista general: 0 = vista general, 1 = explorando. Con la vista
// general, cambiar de ángulo vuelve a encuadrar la caja entera; explorando, el punto que se mira se queda donde está.
export const smoothstep = (value: number, from: number, to: number) => {
  const t = clamp((value - from) / (to - from), 0, 1);
  return t * t * (3 - 2 * t);
};
export const exploring = (camera: Camera, w: number, h: number) =>
  Math.max(smoothstep(camera.zoom, 1.03, 1.25), smoothstep(Math.hypot(camera.px, camera.py) / Math.min(w, h), 0.03, 0.15));

// El eje de cada giro, por cámara: mientras la cámara que llega sea la que dejó el giro anterior (nada más la tocó: ni zoom ni
// desplazamiento), se sigue girando sobre el mismo eje. Recalcularlo en cada paso lo iría corriendo a lo largo del rayo de
// la vista cuando se mira casi de canto, y la escena se iría de lado mientras se arrastra.
const pivots = new WeakMap<Camera, { pivot: Point; scene: SceneInfo; exaggeration: number; w: number; h: number }>();

// Gira la cámara a (yaw, pitch) sin soltar el punto de la superficie que está en el centro de la vista: es el eje de giro, así lo
// que se mira no se va ni se «pierde» al rotar. En la vista general gira alrededor de la caja, como siempre.
export function orbit(scene: SceneInfo, from: Camera, yaw: number, pitch: number, w: number, h: number, exaggeration: number): Camera {
  const next = { ...from, yaw, pitch };
  const weight = exploring(from, w, h);
  if (weight === 0) return next;
  const now = makeProjection(scene, from, w, h, exaggeration);
  const known = pivots.get(from);
  const pivot = known && known.scene === scene && known.exaggeration === exaggeration && known.w === w && known.h === h ? known.pivot : now.surfacePoint(now.originX, h / 2);
  const [a, b] = [now.project(pivot), makeProjection(scene, next, w, h, exaggeration).project(pivot)];
  const turned = { ...next, px: from.px + (a.sx - b.sx) * weight, py: from.py + (a.sy - b.sy) * weight };
  pivots.set(turned, { pivot, scene, exaggeration, w, h });
  return turned;
}
