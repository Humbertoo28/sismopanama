// Escala de colores de intensidad (Mercalli Modificada) de los mapas del USGS. De 3.5 a 8.5 son los colores que el
// propio ShakeMap de este sismo trae en sus curvas de nivel; los demás extremos se leyeron de la leyenda que publica.
const INTENSITY_STOPS: [number, [number, number, number]][] = [
  [1, [255, 255, 255]],
  [2, [208, 218, 255]],
  [3, [166, 232, 255]],
  [3.5, [144, 242, 255]],
  [4, [128, 255, 255]],
  [4.5, [124, 255, 199]],
  [5, [124, 255, 144]],
  [5.5, [187, 255, 74]],
  [6, [255, 255, 0]],
  [6.5, [255, 226, 0]],
  [7, [255, 198, 0]],
  [7.5, [255, 170, 0]],
  [8, [255, 145, 0]],
  [8.5, [255, 71, 0]],
  [9, [255, 0, 0]],
  [10, [200, 0, 0]],
];

export function intensityColor(value: number, alpha = 1) {
  const v = Math.min(10, Math.max(1, value));
  const upper = INTENSITY_STOPS.findIndex(([stop]) => stop >= v);
  const [hiStop, hi] = INTENSITY_STOPS[Math.max(upper, 0)];
  const [loStop, lo] = INTENSITY_STOPS[Math.max(upper - 1, 0)];
  const t = hiStop === loStop ? 0 : (v - loStop) / (hiStop - loStop);
  const [r, g, b] = lo.map((c, i) => Math.round(c + (hi[i] - c) * t));
  return `rgba(${r},${g},${b},${alpha})`;
}


// Deslizamiento de la falla: de azul oscuro (casi nada) a blanco (el máximo del modelo).
export function slipColor(slip: number, max: number, alpha = 1) {
  const t = max > 0 ? Math.min(1, Math.max(0, slip / max)) : 0;
  const stops: [number, number, number][] = [[24, 52, 120], [40, 150, 230], [140, 235, 255], [255, 255, 255]];
  const x = t * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const [r, g, b] = stops[i].map((c, k) => Math.round(c + (stops[i + 1][k] - c) * (x - i)));
  return `rgba(${r},${g},${b},${alpha})`;
}
