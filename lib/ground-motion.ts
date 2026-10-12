import { okadaHorizontal } from "./okada";
import type { Fault } from "./usgs-detail";

// Cuánto se mueve el terreno (en horizontal) en un punto de la superficie por el deslizamiento de las celdas del modelo de
// falla finita del USGS, con las ecuaciones de Okada (1985). Es un cálculo con el modelo, no una medición, y está en metros
// reales: sin exagerar.

const KM_PER_DEG = 111.32;
const KM_PER_LAT = 110.57;

type Patch = { e0: number; n0: number; depth: number; length: number; width: number; sinD: number; cosD: number };

export type GroundModel = {
  lng0: number;
  lat0: number;
  kx: number;
  // Vectores unitarios (este, norte) a lo largo del rumbo y a la izquierda del rumbo.
  strike: [number, number];
  left: [number, number];
  slipStrike: number;
  slipDip: number;
  patches: Patch[];
};

/**
 * Prepara la geometría de las celdas. Las celdas del USGS vienen como cuatro esquinas [lng, lat, profundidad]: arriba-inicio,
 * arriba-fin, abajo-fin, abajo-inicio. Okada pide el vértice inferior inicial, el largo a lo largo del rumbo y el ancho por el
 * buzamiento. `rakeDeg` es el ángulo de deslizamiento del mecanismo (el mismo para todas las celdas). Devuelve null si la
 * geometría no sirve (la falla debe buzar hacia la derecha del rumbo, como publica el USGS).
 */
export function buildGroundModel(fault: Fault, strikeDeg: number, rakeDeg: number): GroundModel | null {
  const lngs = fault.subfaults.flatMap(sub => sub.ring.map(c => c[0]));
  const lats = fault.subfaults.flatMap(sub => sub.ring.map(c => c[1]));
  if (!lngs.length) return null;
  const lng0 = (Math.min(...lngs) + Math.max(...lngs)) / 2;
  const lat0 = (Math.min(...lats) + Math.max(...lats)) / 2;
  const kx = Math.cos((lat0 * Math.PI) / 180) * KM_PER_DEG;
  const a = (strikeDeg * Math.PI) / 180;
  const strike: [number, number] = [Math.sin(a), Math.cos(a)];
  const left: [number, number] = [-Math.cos(a), Math.sin(a)];
  const patches: Patch[] = [];
  for (const sub of fault.subfaults) {
    const pts = sub.ring.map(([lng, lat, depth]) => {
      const e = (lng - lng0) * kx;
      const n = (lat - lat0) * KM_PER_LAT;
      return { e, n, depth, along: e * strike[0] + n * strike[1], left: e * left[0] + n * left[1] };
    });
    const [minDepth, maxDepth] = [Math.min(...pts.map(p => p.depth)), Math.max(...pts.map(p => p.depth))];
    const bottom = pts.filter(p => p.depth >= maxDepth - 1e-6);
    const top = pts.filter(p => p.depth <= minDepth + 1e-6);
    if (!bottom.length || !top.length || maxDepth - minDepth < 1e-3) return null;
    const mean = (list: typeof pts) => list.reduce((sum, p) => sum + p.left, 0) / list.length;
    const horizontal = mean(top) - mean(bottom);
    if (horizontal <= 0) return null;
    const width = Math.hypot(horizontal, maxDepth - minDepth);
    const origin = bottom.reduce((best, p) => (p.along < best.along ? p : best));
    const alongs = pts.map(p => p.along);
    patches.push({
      e0: origin.e,
      n0: origin.n,
      depth: maxDepth,
      length: Math.max(...alongs) - Math.min(...alongs),
      width,
      sinD: (maxDepth - minDepth) / width,
      cosD: horizontal / width,
    });
  }
  const rake = (rakeDeg * Math.PI) / 180;
  return { lng0, lat0, kx, strike, left, slipStrike: Math.cos(rake), slipDip: Math.sin(rake), patches };
}

/** Desplazamiento horizontal (este, norte, en metros) en (lng, lat) cuando cada celda lleva deslizados `slips[i]` metros. */
export function groundMotion(model: GroundModel, slips: ArrayLike<number>, lng: number, lat: number): { east: number; north: number } {
  const e = (lng - model.lng0) * model.kx;
  const n = (lat - model.lat0) * KM_PER_LAT;
  let east = 0;
  let north = 0;
  for (let i = 0; i < model.patches.length; i++) {
    const slip = slips[i];
    if (!slip) continue;
    const p = model.patches[i];
    const [de, dn] = [e - p.e0, n - p.n0];
    const [ux, uy] = okadaHorizontal(
      de * model.strike[0] + dn * model.strike[1],
      de * model.left[0] + dn * model.left[1],
      p.depth, p.length, p.width, p.sinD, p.cosD, model.slipStrike * slip, model.slipDip * slip,
    );
    if (!Number.isFinite(ux) || !Number.isFinite(uy)) continue;
    east += ux * model.strike[0] + uy * model.left[0];
    north += ux * model.strike[1] + uy * model.left[1];
  }
  return { east, north };
}
