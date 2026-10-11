// Una profundidad de exactamente 10 o 5 km casi siempre es un valor asignado cuando el catálogo no logra calcularla
// (el USGS lo marca como «operator assigned»: así están los 54 sismos suyos con 10 km que se revisaron uno por uno).
// En la vista 3D se dibuja hueca para no aparentar una precisión que no hay.
export const isRoundDepth = (depth: number | undefined | null) => depth === 10 || depth === 5;

// Color según la profundidad (km): amarillo en la superficie, naranja, rosa, violeta y azul hacia los 50 km. Es la misma
// escala en la leyenda y en los puntos de la vista 3D.
const DEPTH_STOPS: [number, [number, number, number]][] = [
  [0, [255, 230, 109]],
  [10, [255, 150, 60]],
  [20, [255, 80, 130]],
  [35, [168, 85, 247]],
  [50, [79, 124, 255]],
];

export function depthColor(km: number) {
  const v = Math.min(50, Math.max(0, km));
  const upper = DEPTH_STOPS.findIndex(([stop]) => stop >= v);
  const [hiStop, hi] = DEPTH_STOPS[Math.max(upper, 0)];
  const [loStop, lo] = DEPTH_STOPS[Math.max(upper - 1, 0)];
  const t = hiStop === loStop ? 0 : (v - loStop) / (hiStop - loStop);
  const [r, g, b] = lo.map((c, i) => Math.round(c + (hi[i] - c) * t));
  return `#${[r, g, b].map(c => c.toString(16).padStart(2, "0")).join("")}`;
}
