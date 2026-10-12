// Desplazamiento horizontal del terreno en la superficie por una dislocación rectangular en un semiespacio elástico
// (Okada, 1985, «Surface deformation due to shear and tensile faults in a half-space», BSSA 75, 1135-1154).
// Sólida de Poisson (λ = μ): μ/(λ+μ) = 0.5. Sólo las componentes horizontales y sólo deslizamiento de corte (rumbo y
// buzamiento): es lo que hace falta para mover el mapa. Comprobado contra el caso 2 de la tabla 2 del artículo y contra la
// solución analítica de una falla vertical larga (ver scripts/check-okada.ts).

const ALP = 0.5;
const PI2 = 2 * Math.PI;

// Integral indefinida de Okada (SRECTG) evaluada en (ξ, η, q); devuelve las dos componentes horizontales (a lo largo del
// rumbo y perpendicular) por unidad de deslizamiento de rumbo (u1) y de buzamiento (u2).
function indefinite(xi: number, et: number, q: number, sd: number, cd: number, slipStrike: number, slipDip: number): [number, number] {
  const r = Math.hypot(xi, et, q);
  const d = et * sd - q * cd;
  const y = et * cd + q * sd;
  let ret = r + et;
  if (ret < 0) ret = 0;
  const rd = r + d;
  // Okada fija en cero el arco tangente cuando su denominador se anula.
  const tt = q * r === 0 ? 0 : Math.atan((xi * et) / (q * r));
  const re = ret === 0 ? 0 : 1 / ret;
  const dle = ret === 0 ? -Math.log(r - et) : Math.log(ret);
  const rrx = r + xi < 1e-12 * r ? 0 : 1 / (r * (r + xi));
  const rre = re / r;
  const x = Math.hypot(xi, q);
  let a1: number;
  let a3: number;
  if (cd === 0) {
    // Falla vertical.
    const rd2 = rd * rd;
    a1 = ((-ALP / 2) * xi * q) / rd2;
    a3 = (ALP / 2) * (et / rd + (y * q) / rd2 - dle);
  } else {
    const td = sd / cd;
    const den = xi * (r + x) * cd;
    const num = et * (x + q * cd) + x * (r + x) * sd;
    const a5 = den === 0 ? 0 : ((ALP * 2) / cd) * Math.atan(num / den);
    const a4 = (ALP / cd) * (Math.log(rd) - sd * dle);
    a3 = ALP * (y / rd / cd - dle) + td * a4;
    a1 = ((-ALP / cd) * xi) / rd - td * a5;
  }
  const a2 = -ALP * dle - a3;
  const req = rre * q;
  const sdcd = sd * cd;
  const un1 = slipStrike / PI2;
  const un2 = slipDip / PI2;
  const u1 = -un1 * (req * xi + tt + a1 * sd) - un2 * (q / r - a3 * sdcd);
  const u2 = -un1 * (req * y + q * cd * re + a2 * sd) - un2 * (y * q * rrx + cd * tt - a1 * sdcd);
  return [u1, u2];
}

/**
 * Desplazamiento horizontal (ux a lo largo del rumbo, uy perpendicular hacia la izquierda del rumbo) en la superficie, en
 * unidades del deslizamiento.
 *
 * Sistema de Okada: x a lo largo del rumbo, y perpendicular a la izquierda del rumbo, la falla buza hacia la derecha (−y).
 * (x, y) = posición de la estación respecto del vértice inferior inicial de la falla; `depth` = profundidad de ese vértice
 * (el borde más hondo); el rectángulo se extiende `length` a lo largo del rumbo y `width` hacia arriba por el buzamiento.
 * Deslizamiento de rumbo positivo = lateral izquierdo; de buzamiento positivo = inverso.
 */
export function okadaHorizontal(x: number, y: number, depth: number, length: number, width: number, sinDip: number, cosDip: number, slipStrike: number, slipDip: number): [number, number] {
  const p = y * cosDip + depth * sinDip;
  const q = y * sinDip - depth * cosDip;
  let ux = 0;
  let uy = 0;
  for (const k of [1, 2]) {
    const et = k === 1 ? p : p - width;
    for (const j of [1, 2]) {
      const xi = j === 1 ? x : x - length;
      const sign = j + k !== 3 ? 1 : -1;
      const [du1, du2] = indefinite(xi, et, q, sinDip, cosDip, slipStrike, slipDip);
      ux += sign * du1;
      uy += sign * du2;
    }
  }
  return [ux, uy];
}
