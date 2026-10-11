"use client";

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import type { Earthquake, ReplayStep } from "../lib/earthquakes";
import { reducedMotion, shakeElement } from "./shake";

type Props = {
  mainshock: Earthquake;
  aftershocks: Earthquake[];
  selectedId: string | null;
  replay: ReplayStep | null;
  onSelect: (event: Earthquake) => void;
};

type Tier = "low" | "mid" | "high" | "main";
type View = "auto" | "hours" | "each";

const HOUR = 3_600_000;
const HEIGHT = 260;
const MARGIN = { top: 24, right: 18, bottom: 32, left: 34 };
const INSET = 18; // separa el sismo principal del eje vertical
const clock = new Intl.DateTimeFormat("es-PA", { timeZone: "America/Panama", hour: "numeric", minute: "2-digit", hour12: true });

// Cada sismo es un punto: la altura es la magnitud y la posición, las horas desde el sismo principal. Con cientos de
// réplicas, solo los de M 5 o más tienen barra y peso visual; el resto son puntos pequeños y translúcidos que, juntos,
// dibujan cómo se va apagando la secuencia.
export default function SequenceChart({ mainshock, aftershocks, selectedId, replay, onSelect }: Props) {
  const box = useRef<HTMLDivElement>(null);
  // En el celular, cientos de puntos en 300 px no se leen: ahí se empieza con la vista por bloques de horas.
  const [width, setWidth] = useState(() => (typeof window === "undefined" ? 640 : Math.min(640, window.innerWidth - 56)));
  const [view, setView] = useState<View>("auto");

  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const observer = new ResizeObserver(entries => setWidth(Math.max(280, Math.round(entries[0].contentRect.width))));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Cada vez que la reproducción llega a un sismo, la línea de tiempo tiembla con su magnitud.
  useEffect(() => {
    const element = box.current;
    if (element && replay && replay.index > 0 && !reducedMotion()) shakeElement(element, replay.mag);
  }, [replay]);

  const sequence = [mainshock, ...aftershocks].sort((a, b) => a.properties.time - b.properties.time);
  const start = mainshock.properties.time;
  const last = Math.max(...sequence.map(event => event.properties.time));
  const span = Math.max(last - start, 3 * HOUR) * 1.05;
  const plotW = width - MARGIN.left - MARGIN.right;
  const plotH = HEIGHT - MARGIN.top - MARGIN.bottom;
  const baseY = MARGIN.top + plotH;
  const lowMag = 3.5;
  const highMag = Math.max(8, Math.ceil(Math.max(...sequence.map(event => event.properties.mag ?? 0)) + 0.2));
  const x = (time: number) => MARGIN.left + INSET + ((time - start) / span) * (plotW - INSET);
  const y = (mag: number) => MARGIN.top + (1 - (Math.max(mag, lowMag) - lowMag) / (highMag - lowMag)) * plotH;
  const step = [1, 2, 3, 6, 12, 24, 48].find(hours => span / (hours * HOUR) <= 7) ?? 72;
  const hours = Array.from({ length: Math.floor(span / (step * HOUR)) + 1 }, (_, i) => i * step);
  const mags = Array.from({ length: highMag - 3 }, (_, i) => i + 4);

  const items = sequence.map((event, i) => {
    const mag = event.properties.mag;
    const m = mag ?? 0;
    const tier: Tier = event.id === mainshock.id ? "main" : m >= 5 ? "high" : m >= 4 ? "mid" : "low";
    const radius = tier === "main" ? 10 : tier === "high" ? 5 + (m - 5) * 2.2 : tier === "mid" ? 3.2 + (m - 4) * 1.4 : 2.6;
    return { event, i, mag, tier, radius, cx: x(event.properties.time), cy: y(mag ?? lowMag) };
  });
  // Los más fuertes se dibujan encima (y reciben el toque cuando se solapan con puntos pequeños).
  const rank = { low: 0, mid: 1, high: 2, main: 3 };
  const drawn = [...items].sort((a, b) => rank[a.tier] - rank[b.tier] || (a.mag ?? 0) - (b.mag ?? 0));
  // Etiqueta con la magnitud al sismo principal y a las réplicas de M 6 o más, sin que se pisen entre sí.
  const labeled = new Set<string>();
  const placed: { cx: number; cy: number }[] = [];
  [...items].filter(item => item.tier === "main" || (item.mag ?? 0) >= 6).sort((a, b) => (b.mag ?? 0) - (a.mag ?? 0)).forEach(item => {
    if (placed.some(other => Math.abs(other.cx - item.cx) < 54 && Math.abs(other.cy - item.cy) < 14)) return;
    placed.push(item);
    labeled.add(item.event.id);
  });

  const mode = view === "auto" ? (width < 560 ? "hours" : "each") : view;
  // Vista por horas: bloques lo bastante grandes para que no pasen de ~10 filas. Durante la reproducción solo cuentan
  // las réplicas que ya "ocurrieron", así las barras crecen con la secuencia.
  const binHours = [3, 6, 12, 24, 48].find(h => Math.ceil(Math.max(last - start, HOUR) / (h * HOUR)) <= 10) ?? 168;
  const shown = replay === null ? aftershocks : replay.index === 0 ? [] : aftershocks.filter(event => event.properties.time <= replay.time);
  const rows = Array.from({ length: Math.floor((last - start) / (binHours * HOUR)) + 1 }, (_, n) => ({ n, events: [] as Earthquake[] }));
  shown.forEach(event => rows[Math.floor((event.properties.time - start) / (binHours * HOUR))]?.events.push(event));
  const peak = Math.max(1, ...rows.map(row => row.events.length));

  const onKey = (event: KeyboardEvent, quake: Earthquake) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onSelect(quake);
  };

  return (
    <div className="sequence-chart" ref={box}>
      <div className="segmented seq-toggle" role="group" aria-label="Vista de la secuencia">
        <button type="button" className={mode === "hours" ? "selected" : ""} aria-pressed={mode === "hours"} onClick={() => setView("hours")}>Por horas</button>
        <button type="button" className={mode === "each" ? "selected" : ""} aria-pressed={mode === "each"} onClick={() => setView("each")}>Cada sismo</button>
      </div>
      {mode === "hours" ? (
        <div className="seq-hours" aria-label="Réplicas por bloque de horas desde el sismo principal">
          <button type="button" className="seq-hour-main" onClick={() => onSelect(mainshock)} aria-label={`Sismo principal, magnitud ${mainshock.properties.mag?.toFixed(1) ?? "desconocida"}, ${clock.format(new Date(start))}. Ver en el mapa`}>
            <b>M {mainshock.properties.mag?.toFixed(1) ?? "—"}</b><span>Sismo principal · {clock.format(new Date(start))}</span>
          </button>
          <div className="seq-hours-head" aria-hidden="true"><span>Horas</span><span>Réplicas</span><span /><span>Más fuerte</span></div>
          {rows.map(row => {
            const top = row.events.reduce<Earthquake | null>((best, event) => (best === null || (event.properties.mag ?? -1) > (best.properties.mag ?? -1) ? event : best), null);
            const topMag = top?.properties.mag ?? null;
            const tier = topMag === null ? "none" : topMag >= 5 ? "high" : topMag >= 4 ? "mid" : "low";
            const from = row.n * binHours;
            const active = selectedId !== null && row.events.some(event => event.id === selectedId);
            return (
              <button key={row.n} type="button" className={`seq-hour${active ? " selected" : ""}`} disabled={top === null} onClick={() => top && onSelect(top)}
                aria-label={`De ${from} a ${from + binHours} horas después del sismo principal: ${row.events.length} ${row.events.length === 1 ? "réplica" : "réplicas"}${topMag === null ? "" : `, la más fuerte de magnitud ${topMag.toFixed(1)}. Ver en el mapa`}`}>
                <span className="seq-hour-range">{from}–{from + binHours} h</span>
                <span className="seq-hour-track"><i className={tier} style={{ width: `${(row.events.length / peak) * 100}%` }} /></span>
                <span className="seq-hour-count">{row.events.length}</span>
                <span className={`seq-hour-max ${tier}`}>{topMag === null ? "—" : `M ${topMag.toFixed(1)}`}</span>
              </button>
            );
          })}
        </div>
      ) : (
      <svg width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`} role="group" aria-label={`Línea de tiempo: el sismo principal y ${aftershocks.length} ${aftershocks.length === 1 ? "réplica" : "réplicas"}`}>
        {mags.map(mag => (
          <g key={mag} className="seq-grid">
            <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y(mag)} y2={y(mag)} />
            <text x={MARGIN.left - 8} y={y(mag) + 4} textAnchor="end">{mag}</text>
          </g>
        ))}
        <line className="seq-base" x1={MARGIN.left} x2={width - MARGIN.right} y1={baseY} y2={baseY} />
        {hours.map(hour => (
          <text key={hour} className="seq-tick" x={x(start + hour * HOUR)} y={HEIGHT - 10} textAnchor="middle">{hour === 0 ? "0 h" : `+${hour} h`}</text>
        ))}
        {drawn.map(({ event, i, mag, tier, radius, cx, cy }) => {
          const isMain = tier === "main";
          const pending = replay !== null && (replay.index === 0 || event.properties.time > replay.time);
          const now = replay !== null && replay.index > 0 && event.properties.time === replay.time;
          const label = `Sismo de magnitud ${mag === null ? "desconocida" : mag.toFixed(1)}, ${clock.format(new Date(event.properties.time))}, ${event.properties.place ?? "lugar no especificado"}`;
          return (
            <g key={event.id} className={`seq-item ${tier}${pending ? " pending" : ""}${now ? " now" : ""}${selectedId === event.id ? " selected" : ""}`}
              style={{ "--i": i } as CSSProperties} role="button" tabIndex={0} aria-label={`${label}. Ver en el mapa`}
              onClick={() => onSelect(event)} onKeyDown={key => onKey(key, event)}>
              <title>{label}</title>
              <line className="seq-stem" x1={cx} x2={cx} y1={baseY} y2={cy} pathLength={1} />
              <circle className="seq-ring" cx={cx} cy={cy} r={radius + 6} />
              <circle className="seq-dot" cx={cx} cy={cy} r={radius} />
              <circle className="seq-hit" cx={cx} cy={cy} r={tier === "low" ? 6 : tier === "mid" ? radius + 4 : radius + 6} />
              {labeled.has(event.id) && <text className="seq-label" x={cx + radius + (isMain ? 7 : 5)} y={cy + 4}>M {mag?.toFixed(1)}</text>}
            </g>
          );
        })}
      </svg>
      )}
      <p className="sequence-note">
        {mode === "hours"
          ? `Cada fila agrupa las réplicas por bloques de ${binHours} horas desde el sismo principal: la barra es cuántas hubo y la etiqueta, la más fuerte del bloque. Toca una fila para verla en el mapa.`
          : "Cada punto es un sismo: la altura es la magnitud y la posición, las horas desde el sismo principal. Los puntos grandes son los de M 5 o más. Pulsa uno para verlo en el mapa."}
        {" "}Las réplicas suelen espaciarse con el paso de las horas.
      </p>
    </div>
  );
}
