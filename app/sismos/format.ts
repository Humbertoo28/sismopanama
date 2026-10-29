import type { Earthquake } from "../../lib/earthquakes";

// Formatos comunes de las páginas por provincia (hora de Panamá, como el resto del sitio).
export const longDate = new Intl.DateTimeFormat("es-PA", {
  timeZone: "America/Panama", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", hour12: true,
});
export const shortDate = new Intl.DateTimeFormat("es-PA", {
  timeZone: "America/Panama", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true,
});

export const magText = (event: Earthquake) => (event.properties.mag === null ? "—" : event.properties.mag.toFixed(1));

export function depthText(event: Earthquake) {
  const depth = event.geometry.coordinates[2];
  return Number.isFinite(depth) ? `${Math.round(depth!)} km` : "sin dato";
}

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// Mismo criterio de color que la lista de la portada: el naranja fuerte se reserva para M 5 o más.
export const magLevel = (mag: number | null) => ((mag ?? 0) >= 5 ? "high" : (mag ?? 0) < 3 ? "low" : "mid");

export const isoTime = (time: number) => new Date(time).toISOString();
