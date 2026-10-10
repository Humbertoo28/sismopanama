import { DAY, HOUR, MINUTE } from "../../lib/analytics";

const timeZone = "America/Panama";
export const fmtDay = new Intl.DateTimeFormat("es-PA", { timeZone, day: "numeric", month: "short" });
export const fmtClock = new Intl.DateTimeFormat("es-PA", { timeZone, hour: "numeric", minute: "2-digit", hour12: true });
export const fmtHour = new Intl.DateTimeFormat("es-PA", { timeZone, hour: "numeric", hour12: true });
export const fmtFull = new Intl.DateTimeFormat("es-PA", { timeZone, day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });
export const fmtInt = new Intl.NumberFormat("es-PA");

const PANAMA_OFFSET = 5 * HOUR;
const STEPS = [10 * MINUTE, 30 * MINUTE, HOUR, 3 * HOUR, 6 * HOUR, 12 * HOUR, DAY, 2 * DAY, 7 * DAY];

// Marcas del eje de tiempo en horas redondas de Panamá (los ejes numéricos de recharts pondrían valores arbitrarios).
export function timeTicks(from: number, to: number) {
  const span = to - from;
  const step = STEPS.find((candidate) => span / candidate <= 7) ?? STEPS[STEPS.length - 1];
  const first = Math.ceil((from - PANAMA_OFFSET) / step) * step + PANAMA_OFFSET;
  const ticks: number[] = [];
  for (let t = first; t <= to; t += step) ticks.push(t);
  return { ticks, step };
}

export function tickLabel(time: number, step: number, span: number) {
  if (step >= DAY) return fmtDay.format(time);
  // La medianoche lleva la fecha: así se ve dónde cambia el día aunque el eje solo muestre horas.
  if (span > 30 * HOUR || (time - PANAMA_OFFSET) % DAY === 0) return `${fmtDay.format(time)} ${fmtHour.format(time)}`;
  return fmtClock.format(time);
}
