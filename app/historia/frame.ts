import { PANAMA_RINGS } from "../../lib/panama";

// El marco del mapa de la historia sísmica: el recuadro 6° a 10.7° N y 83.8° a 77° O (el mismo con el que se pide el catálogo al USGS),
// dibujado en 760 unidades de ancho. Lo usan el servidor (contorno del país) y el mapa interactivo del navegador.
export const MIN_LNG = -83.8;
export const MAX_LNG = -77;
export const MIN_LAT = 6;
export const MAX_LAT = 10.7;
export const W = 760;
export const H = Math.round((W * (MAX_LAT - MIN_LAT)) / (MAX_LNG - MIN_LNG));

export const px = (lng: number) => ((lng - MIN_LNG) / (MAX_LNG - MIN_LNG)) * W;
export const py = (lat: number) => ((MAX_LAT - lat) / (MAX_LAT - MIN_LAT)) * H;
export const radiusOf = (mag: number) => 3 + (mag - 5.9) * 5;

export function outlinePath() {
  return PANAMA_RINGS.map(ring => `M${ring.map(([lng, lat]) => `${px(lng).toFixed(1)},${py(lat).toFixed(1)}`).join("L")}Z`).join("");
}
