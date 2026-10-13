"use client";

import type { CSSProperties } from "react";
import { type Band, type Quake, depthHistogram, magnitudeHistogram } from "../../lib/analytics";
import CountUp from "../count-up";
import { useInView, useReducedMotion } from "./motion";

// Leyenda y barras horizontales: no usan Recharts, así que viven aparte de charts.tsx. Esa librería pesa ~115 KB comprimidos y el
// panel la carga en un archivo propio, en paralelo con los datos; con esto lo demás (filtros, indicadores, estas barras) no la espera.

export function Legend({ items }: { items: { label: string; kind: "dot" | "line" | "bar" | "ring"; color: string }[] }) {
  return (
    <ul className="an-legend" aria-label="Leyenda">
      {items.map((item) => (
        <li key={item.label}><i className={`an-key an-key-${item.kind}`} style={{ "--key": item.color } as CSSProperties} aria-hidden="true" />{item.label}</li>
      ))}
    </ul>
  );
}

// ---------- distribuciones: barras horizontales simples (HTML, con el valor siempre visible) ----------

// Las barras crecen desde cero y los números cuentan hacia su valor cuando la gráfica llega a la pantalla. Cada fila es un botón:
// al elegirla se resaltan en la línea de tiempo y en la tabla los sismos de esa banda.
function HBars({ bands, unit, note, selected, onPick }: { bands: Band[]; unit: string; note?: string; selected?: string | null; onPick?: (band: Band) => void }) {
  const max = Math.max(1, ...bands.map((band) => band.count));
  const reduced = useReducedMotion();
  const [ref, seen] = useInView<HTMLDivElement>();
  const show = seen || reduced;
  return (
    <div className="an-hbars" ref={ref}>
      {bands.map((band, index) => {
        const inner = (
          <>
            <span>{band.label}</span>
            <span className="an-hbar-track"><span style={{ width: show ? `${(band.count / max) * 100}%` : 0, transitionDelay: reduced ? "0ms" : `${index * 80}ms` }} /></span>
            <b><CountUp value={show ? band.count : 0} from={0} duration={reduced ? 0 : 900} /></b>
          </>
        );
        const title = `${band.label}: ${band.count} ${unit}`;
        return onPick ? (
          <button key={band.label} type="button" className={`an-hbar an-hbar-btn${selected === band.label ? " is-on" : ""}`} aria-pressed={selected === band.label}
            disabled={band.count === 0} title={title} onClick={() => onPick(band)}>{inner}</button>
        ) : (
          <div key={band.label} className="an-hbar" title={title}>{inner}</div>
        );
      })}
      {note && <p className="an-note">{note}</p>}
    </div>
  );
}

export function DepthBars({ quakes, selected, onPick }: { quakes: Quake[]; selected?: string | null; onPick?: (band: Band) => void }) {
  const { bands, unknown } = depthHistogram(quakes);
  return <HBars bands={bands} unit="sismos" selected={selected} onPick={onPick} note={unknown > 0 ? `${unknown} sin profundidad informada.` : undefined} />;
}

export function MagnitudeBars({ quakes, selected, onPick }: { quakes: Quake[]; selected?: string | null; onPick?: (band: Band) => void }) {
  return <HBars bands={magnitudeHistogram(quakes)} unit="sismos" selected={selected} onPick={onPick} />;
}
