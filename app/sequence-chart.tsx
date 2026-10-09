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

const HOUR = 3_600_000;
const HEIGHT = 210;
const MARGIN = { top: 24, right: 18, bottom: 32, left: 34 };
const INSET = 18; // separa el sismo principal del eje vertical
const clock = new Intl.DateTimeFormat("es-PA", { timeZone: "America/Panama", hour: "numeric", minute: "2-digit", hour12: true });

// Cada sismo es una barra: la altura es la magnitud y la posición, las horas desde el sismo principal.
export default function SequenceChart({ mainshock, aftershocks, selectedId, replay, onSelect }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);

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

  const onKey = (event: KeyboardEvent, quake: Earthquake) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onSelect(quake);
  };

  return (
    <div className="sequence-chart" ref={box}>
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
        {sequence.map((event, i) => {
          const mag = event.properties.mag;
          const isMain = event.id === mainshock.id;
          const cx = x(event.properties.time);
          const cy = y(mag ?? lowMag);
          const radius = Math.min(13, Math.max(5, 4.5 + ((mag ?? 3.5) - 3) * 1.4));
          const pending = replay !== null && (replay.index === 0 || event.properties.time > replay.time);
          const now = replay !== null && replay.index > 0 && event.properties.time === replay.time;
          const label = `Sismo de magnitud ${mag === null ? "desconocida" : mag.toFixed(1)}, ${clock.format(new Date(event.properties.time))}, ${event.properties.place ?? "lugar no especificado"}`;
          return (
            <g key={event.id} className={`seq-item${isMain ? " main" : ""}${pending ? " pending" : ""}${now ? " now" : ""}${selectedId === event.id ? " selected" : ""}`}
              style={{ "--i": i } as CSSProperties} role="button" tabIndex={0} aria-label={`${label}. Ver en el mapa`}
              onClick={() => onSelect(event)} onKeyDown={key => onKey(key, event)}>
              <title>{label}</title>
              <line className="seq-stem" x1={cx} x2={cx} y1={baseY} y2={cy} pathLength={1} />
              <circle className="seq-ring" cx={cx} cy={cy} r={radius + 6} />
              <circle className="seq-dot" cx={cx} cy={cy} r={radius} />
              <circle className="seq-hit" cx={cx} cy={cy} r={Math.max(radius + 6, 15)} />
              {isMain && <text className="seq-label" x={cx + radius + 7} y={cy + 4}>M {mag?.toFixed(1)}</text>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
