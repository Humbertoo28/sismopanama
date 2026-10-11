import type { Mechanism, Plane } from "./usgs-detail";

// Signo de la primera llegada de la onda P en una dirección: positivo = compresión (zona oscura de la «pelota de
// playa»), negativo = dilatación (zona blanca). `azimuth` va desde el norte hacia el este; `takeoff`, desde la vertical
// hacia abajo. Es el patrón de radiación de P: Σ Mij·γi·γj, con el tensor en coordenadas arriba–sur–este del USGS.
export function pressureSign(tensor: Mechanism["tensor"], azimuth: number, takeoff: number) {
  const a = (azimuth * Math.PI) / 180;
  const i = (takeoff * Math.PI) / 180;
  const r = -Math.cos(i);
  const t = -Math.sin(i) * Math.cos(a);
  const p = Math.sin(i) * Math.sin(a);
  return tensor.rr * r * r + tensor.tt * t * t + tensor.pp * p * p + 2 * (tensor.rt * r * t + tensor.rp * r * p + tensor.tp * t * p);
}

// Dibuja el mecanismo focal (hemisferio inferior, proyección de igual área) en un canvas cuadrado de `size` px CSS.
export function drawBeachball(canvas: HTMLCanvasElement, tensor: Mechanism["tensor"], size: number, dark = "#1e293b") {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const px = Math.round(size * dpr);
  canvas.width = px;
  canvas.height = px;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  // Se pinta al doble de resolución y se reduce, para que los bordes salgan suaves.
  const hi = document.createElement("canvas");
  const big = px * 2;
  hi.width = big;
  hi.height = big;
  const hiCtx = hi.getContext("2d");
  const ctx = canvas.getContext("2d");
  if (!hiCtx || !ctx) return;
  const image = hiCtx.createImageData(big, big);
  const [dr, dg, db] = [parseInt(dark.slice(1, 3), 16), parseInt(dark.slice(3, 5), 16), parseInt(dark.slice(5, 7), 16)];
  const half = big / 2;
  for (let y = 0; y < big; y++) {
    for (let x = 0; x < big; x++) {
      const dx = (x + 0.5 - half) / half;
      const dy = (half - (y + 0.5)) / half;
      const rho = Math.hypot(dx, dy);
      if (rho > 1) continue;
      const azimuth = (Math.atan2(dx, dy) * 180) / Math.PI;
      const takeoff = (2 * Math.asin(Math.min(1, rho / Math.SQRT2)) * 180) / Math.PI;
      const compression = pressureSign(tensor, azimuth, takeoff) > 0;
      const k = (y * big + x) * 4;
      image.data[k] = compression ? dr : 255;
      image.data[k + 1] = compression ? dg : 255;
      image.data[k + 2] = compression ? db : 255;
      image.data[k + 3] = 255;
    }
  }
  hiCtx.putImageData(image, 0, 0);
  ctx.clearRect(0, 0, px, px);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  const inset = 1.5 * dpr;
  ctx.drawImage(hi, inset, inset, px - 2 * inset, px - 2 * inset);
  ctx.beginPath();
  ctx.arc(px / 2, px / 2, px / 2 - inset, 0, Math.PI * 2);
  ctx.lineWidth = 1.5 * dpr;
  ctx.strokeStyle = dark;
  ctx.stroke();
}

type Kind = "lateral" | "inverso" | "normal";

// Tipo de falla según el ángulo de deslizamiento (rake) del plano, con los umbrales habituales.
function kindOf({ rake }: Plane): Kind {
  const r = ((((rake + 180) % 360) + 360) % 360) - 180;
  if (Math.abs(r) <= 45 || Math.abs(r) >= 135) return "lateral";
  return r > 0 ? "inverso" : "normal";
}

const NAMES: Record<Kind, string> = {
  lateral: "Desplazamiento lateral (falla de rumbo)",
  inverso: "Falla inversa (de empuje)",
  normal: "Falla normal",
};

export function describeMechanism(planes: [Plane, Plane]) {
  const [a, b] = [kindOf(planes[0]), kindOf(planes[1])];
  return a === b ? NAMES[a] : "Mecanismo mixto";
}
