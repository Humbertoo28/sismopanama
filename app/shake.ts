import { shakeFor } from "../lib/earthquakes";

export const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Chrome bloquea vibrate (y lo registra como error) si el usuario aún no ha tocado la página.
export function vibrate(ms: number) {
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
  navigator.vibrate?.(ms);
}

// Hace temblar un elemento con la fuerza y duración que corresponden a la magnitud (ver shakeFor).
// La animación concreta la define el CSS de cada elemento a partir de .quake-shake.
const timers = new WeakMap<Element, number>();
export function shakeElement(element: HTMLElement | SVGElement, mag: number | null, scale = 1) {
  const { px, ms } = shakeFor(mag);
  element.style.setProperty("--shake", `${(px * scale).toFixed(1)}px`);
  element.style.setProperty("--shake-ms", `${ms}ms`);
  element.classList.remove("quake-shake");
  element.getBoundingClientRect(); // fuerza el reflujo para reiniciar la animación si ya estaba en marcha
  element.classList.add("quake-shake");
  window.clearTimeout(timers.get(element));
  timers.set(element, window.setTimeout(() => element.classList.remove("quake-shake"), ms + 60));
}
