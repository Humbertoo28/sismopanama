import type { Earthquake } from "./earthquakes";

// El último sismo conocido, para que el panel de accesibilidad (que vive fuera de la página) pueda leerlo en voz alta.
let latest: Earthquake | null = null;
const listeners = new Set<() => void>();

export function setLatestQuake(event: Earthquake | null) {
  latest = event;
  listeners.forEach(listener => listener());
}

export const getLatestQuake = () => latest;

export function subscribeLatestQuake(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
