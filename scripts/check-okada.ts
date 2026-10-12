// Comprueba lib/okada.ts: node --experimental-strip-types scripts/check-okada.ts
// @ts-expect-error Node necesita la extensión .ts; el compilador de la web no la admite en importaciones.
import { okadaHorizontal } from "../lib/okada.ts";

const rad = (deg: number) => (deg * Math.PI) / 180;
let failed = 0;
const near = (name: string, got: number, want: number, tol: number) => {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) failed++;
  console.log(`${ok ? "ok " : "MAL"} ${name}: ${got.toExponential(4)} (esperado ${want.toExponential(4)})`);
};

// Okada (1985), tabla 2, caso 2: x = 2, y = 3, d = 4, L = 3, W = 2, δ = 70°, λ = μ.
{
  const [sd, cd] = [Math.sin(rad(70)), Math.cos(rad(70))];
  const [sx, sy] = okadaHorizontal(2, 3, 4, 3, 2, sd, cd, 1, 0);
  near("rumbo ux", sx, -8.689e-3, 2e-6);
  near("rumbo uy", sy, -4.298e-3, 2e-6);
  const [dx, dy] = okadaHorizontal(2, 3, 4, 3, 2, sd, cd, 0, 1);
  near("buzamiento ux", dx, -4.682e-3, 2e-6);
  near("buzamiento uy", dy, -3.527e-2, 2e-5);
}

// Falla vertical muy larga con deslizamiento lateral izquierdo entre 5 y 25 km: en el centro, u(y) = −sign(y)·(U/π)·[atan(25/|y|) − atan(5/|y|)].
{
  const L = 4e5;
  for (const y of [-40, -10, -2, 2, 10, 40]) {
    // Vértice inferior en (0, 0, 25 km); la falla sube 20 km. Estación a y respecto de la traza.
    const [ux] = okadaHorizontal(L / 2, y, 25, L, 20, 1, 0, 1, 0);
    const want = -Math.sign(y) * (1 / Math.PI) * (Math.atan(25 / Math.abs(y)) - Math.atan(5 / Math.abs(y)));
    near(`falla larga y=${y}`, ux, want, 2e-4);
  }
}

// Lateral izquierdo en una falla que buza a la derecha del rumbo: el lado que buza (derecha, −y) se mueve hacia +x y el otro hacia −x.
{
  const [sd, cd] = [Math.sin(rad(50)), Math.cos(rad(50))];
  const dipSide = okadaHorizontal(25, -10, 15, 50, 10, sd, cd, 1, 0)[0];
  const farSide = okadaHorizontal(25, 30, 15, 50, 10, sd, cd, 1, 0)[0];
  console.log(`${dipSide > 0 && farSide < 0 ? "ok " : "MAL"} lados opuestos: lado que buza ux=${dipSide.toExponential(3)}, otro lado ux=${farSide.toExponential(3)}`);
  if (!(dipSide > 0 && farSide < 0)) failed++;
}

console.log(failed ? `\n${failed} comprobaciones fallaron` : "\ntodo correcto");
process.exit(failed ? 1 : 0);
