"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import { type Band, type Bucket, type Quake, depthHistogram, magnitudeHistogram } from "../../lib/analytics";
import CountUp from "../count-up";
import { fmtClock, fmtDay, fmtFull, fmtInt, tickLabel, timeTicks } from "./format";
import { useInView, useReducedMotion } from "./motion";

// Los colores son variables CSS (analisis.css): el azul y el naranja son los dos primeros tonos categóricos de una
// paleta validada contra daltonismo; el naranja solo se usa para lo que el lector debe ver primero.
const tick = { fill: "var(--an-muted)", fontSize: 12 };
const axisLine = { stroke: "var(--an-grid)" };
const axisLabel = (value: string, angle?: number) => ({ value, angle, fill: "var(--an-muted)", fontSize: 12, ...(angle ? { position: "insideLeft" as const, offset: 8, dx: -4 } : { position: "insideBottom" as const, offset: -2 }) });

// Cuánto dura la entrada de las barras y las áreas, y en cuánto tiempo aparecen todos los puntos de la línea de tiempo.
const ENTER_MS = 800;
const DOTS_MS = 900;

export type TimelinePoint = Quake & { role: "normal" | "main" | "latest" };

type TipProps<T> = { active?: boolean; payload?: { payload: T }[] };
const asTip = <T,>(props: unknown) => props as TipProps<T>;

function Tip({ title, rows }: { title: string; rows: [string, ReactNode][] }) {
  return (
    <div className="an-tip">
      <strong>{title}</strong>
      {rows.map(([label, value]) => (
        <div key={label}><span>{label}</span><b>{value}</b></div>
      ))}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; kind: "dot" | "line" | "bar" | "ring"; color: string }[] }) {
  return (
    <ul className="an-legend" aria-label="Leyenda">
      {items.map((item) => (
        <li key={item.label}><i className={`an-key an-key-${item.kind}`} style={{ "--key": item.color } as CSSProperties} aria-hidden="true" />{item.label}</li>
      ))}
    </ul>
  );
}

// ---------- línea de tiempo: cada sismo es un punto (tiempo × magnitud) ----------

type DotExtra = {
  selectedId: string | null;
  onSelect: (id: string) => void;
  // Atenuados por lo que se eligió en otra gráfica (un intervalo, una magnitud, una profundidad).
  dimmed?: (quake: Quake) => boolean;
  // Sismos que acaban de entrar (aro que se expande) y el que se acaba de «ocurrir» en la reproducción (una sola onda).
  freshIds?: ReadonlySet<string>;
  rippleId?: string | null;
  rank: ReadonlyMap<string, number>;
  total: number;
  stagger: boolean;
};
type DotProps = { cx?: number; cy?: number; payload?: TimelinePoint; extra: DotExtra };

// Está fuera del componente que dibuja la gráfica a propósito: si se creara dentro, cada cambio de selección lo volvería un
// componente «nuevo» para React y los 500 puntos se dibujarían de cero (y repetirían su animación de entrada).
function TimelineDot({ cx, cy, payload, extra }: DotProps) {
  if (cx === undefined || cy === undefined || !payload) return <g />;
  const radius = Math.max(3.5, Math.min(15, 2.2 + (payload.mag - 2) * 2.4));
  const selected = payload.id === extra.selectedId;
  const dim = extra.dimmed?.(payload) ?? false;
  const fill = payload.role === "main" ? "var(--an-s2)" : "var(--an-s1)";
  // Al cargar, los puntos entran en orden cronológico (el más antiguo primero) a lo largo de ~0.9 s.
  const delay = extra.stagger ? Math.round(((extra.rank.get(payload.id) ?? 0) / Math.max(1, extra.total)) * DOTS_MS) : 0;
  return (
    <g className={`an-dot${dim ? " an-dim" : ""}${selected ? " an-sel" : ""}`} onClick={() => extra.onSelect(payload.id)}>
      <circle cx={cx} cy={cy} r={radius + 9} fill="transparent" />
      <g className="an-dot-body" style={{ "--d": `${delay}ms` } as CSSProperties}>
        {extra.freshIds?.has(payload.id) && <circle className="an-ring an-ring-fresh" cx={cx} cy={cy} r={radius} />}
        {extra.rippleId === payload.id && <circle className="an-ring an-ring-ripple" cx={cx} cy={cy} r={radius} />}
        <circle cx={cx} cy={cy} r={radius} fill={fill} fillOpacity={payload.role === "normal" ? 0.6 : 0.95} stroke="var(--an-surface)" strokeWidth={1.5} />
        {payload.role === "latest" && <circle cx={cx} cy={cy} r={radius + 3.5} fill="none" stroke="var(--an-ink)" strokeWidth={2} />}
        {selected && <circle className="an-sel-ring" cx={cx} cy={cy} r={radius + 6} fill="none" stroke="var(--an-ink)" strokeWidth={2} strokeDasharray="2 3" />}
      </g>
    </g>
  );
}

export function TimelineChart({ points, domain, magRange, selectedId, onSelect, dimmed, freshIds, rippleId }: {
  points: TimelinePoint[];
  // Ventana de tiempo que se ve (el panel la acerca, la aleja y la desplaza) y rango de magnitudes de TODOS los sismos:
  // el eje vertical no se mueve al acercar ni mientras se reproduce.
  domain: [number, number];
  magRange: [number, number];
  selectedId: string | null;
  onSelect: (id: string) => void;
  dimmed?: (quake: Quake) => boolean;
  freshIds?: ReadonlySet<string>;
  rippleId?: string | null;
}) {
  const [from, to] = domain;
  const [staggering, setStaggering] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => setStaggering(false), DOTS_MS + 700);
    return () => window.clearTimeout(timer);
  }, []);

  const rank = useMemo(() => new Map([...points].sort((a, b) => a.time - b.time).map((point, index) => [point.id, index] as const)), [points]);
  const low = Math.max(0, Math.floor(magRange[0] - 0.3));
  const high = Math.ceil(magRange[1] + 0.3);
  const { ticks, step } = timeTicks(from, to);
  const span = Math.max(to - from, 1);
  const edge = to + Math.max(span * 0.03, span > 6 * 3_600_000 ? 10 * 60_000 : 0); // aire a la derecha: el último sismo no queda cortado
  // Solo se dibujan los que caen en la ventana (con un margen): al acercar hay muchos menos puntos que pintar.
  const margin = span * 0.15;
  const visible = useMemo(() => points.filter((point) => point.time >= from - margin && point.time <= edge + margin), [points, from, edge, margin]);
  // Los destacados se dibujan al final para que no los tape ningún punto común.
  const ordered = useMemo(
    () => [...visible].sort((a, b) => Number(a.role !== "normal") - Number(b.role !== "normal") || Number(a.id === selectedId) - Number(b.id === selectedId)),
    [visible, selectedId],
  );
  const extra: DotExtra = { selectedId, onSelect, dimmed, freshIds, rippleId, rank, total: points.length, stagger: staggering };

  if (!points.length) return <p className="an-empty">No hay sismos con estos filtros.</p>;
  return (
    <div className="an-chart" role="img" aria-label={`Gráfico de ${points.length} sismos por hora y magnitud. Los mismos datos están en la tabla de eventos.`}>
      <ResponsiveContainer width="100%" height={320}>
        <ScatterChart margin={{ top: 10, right: 18, bottom: 22, left: 4 }}>
          <CartesianGrid stroke="var(--an-grid)" vertical={false} />
          <XAxis type="number" dataKey="time" domain={[from, edge]} ticks={ticks} allowDataOverflow tick={tick} tickLine={false} axisLine={axisLine}
            tickFormatter={(value: number) => tickLabel(value, step, to - from)} />
          <YAxis type="number" dataKey="mag" domain={[low, high]} ticks={Array.from({ length: high - low + 1 }, (_, i) => low + i)} tick={tick} tickLine={false} axisLine={false} width={44}
            label={axisLabel("Magnitud", -90)} />
          {high >= 5 && low < 5 && <ReferenceLine y={5} stroke="var(--an-grid)" />}
          <Tooltip cursor={{ stroke: "var(--an-muted)", strokeDasharray: "3 3" }} isAnimationActive={false} content={(props) => {
            const tip = asTip<TimelinePoint>(props);
            const quake = tip.active ? tip.payload?.[0]?.payload : undefined;
            return quake ? (
              <Tip title={`M ${quake.mag.toFixed(1)}`} rows={[
                ["Hora", fmtFull.format(quake.time)],
                ["Lugar", quake.place],
                ["Profundidad", quake.depth === null ? "—" : `${Math.round(quake.depth)} km`],
                ["Fuente", quake.source.toUpperCase()],
              ]} />
            ) : null;
          }} />
          <Scatter data={ordered} shape={(props: unknown) => <TimelineDot {...(props as Omit<DotProps, "extra">)} extra={extra} />} isAnimationActive={false} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------- actividad por intervalo y acumulada ----------

// Recharts pone aquí el intervalo que está señalado (con el cursor o con las flechas del teclado). Se guarda para que Enter o
// espacio puedan elegirlo: las barras en sí no se enfocan con el teclado.
function BucketTip({ active, payload, size, report }: TipProps<Bucket> & { size: number; report: (bucket: Bucket | null) => void }) {
  const bucket = active ? payload?.[0]?.payload ?? null : null;
  useEffect(() => {
    report(bucket);
  }, [bucket, report]);
  if (!bucket) return null;
  return (
    <Tip title={`${fmtFull.format(bucket.start)} – ${fmtClock.format(bucket.start + size)}`} rows={[
      ["Sismos en el intervalo", fmtInt.format(bucket.count)],
      ["Acumulado", fmtInt.format(bucket.cumulative)],
      ["Mayor magnitud", bucket.maxMag === null ? "—" : `M ${bucket.maxMag.toFixed(1)}`],
    ]} />
  );
}

export function ActivityChart({ buckets, size, mode, selectedStart, onPick }: {
  buckets: Bucket[]; size: number; mode: "interval" | "cumulative";
  // Intervalo elegido (su inicio) y qué hacer al elegir uno: resalta esos sismos en la línea de tiempo y la tabla.
  selectedStart?: number | null; onPick?: (bucket: Bucket) => void;
}) {
  const reduced = useReducedMotion();
  const active = useRef<Bucket | null>(null);
  const report = useCallback((bucket: Bucket | null) => { active.current = bucket; }, []);
  if (!buckets.length || buckets[buckets.length - 1].cumulative === 0) return <p className="an-empty">No hay sismos con estos filtros.</p>;
  const label = (start: number) => (size >= 24 * 3_600_000 ? fmtDay.format(start) : size >= 3 * 3_600_000 ? `${fmtDay.format(start)} ${fmtClock.format(start)}` : fmtClock.format(start));
  const common = { data: buckets, margin: { top: 10, right: 18, bottom: 4, left: 4 } };
  const xAxis = <XAxis dataKey="start" tickFormatter={label} tick={tick} tickLine={false} axisLine={axisLine} minTickGap={28} />;
  const yAxis = <YAxis allowDecimals={false} tick={tick} tickLine={false} axisLine={false} width={44} />;
  const tooltip = <Tooltip cursor={{ fill: "var(--an-hover)" }} isAnimationActive={false} content={<BucketTip size={size} report={report} />} />;
  const pick = (bucket: Bucket | null | undefined) => { if (bucket && bucket.count > 0 && onPick) onPick(bucket); };
  const onKey = (event: KeyboardEvent) => {
    if (mode !== "interval" || (event.key !== "Enter" && event.key !== " ")) return;
    if (!active.current) return;
    event.preventDefault();
    pick(active.current);
  };
  const hasPick = Boolean(onPick) && mode === "interval";
  return (
    <div className={`an-chart${hasPick ? " an-pick" : ""}`} onKeyDown={onKey}
      role="img" aria-label={mode === "interval" ? `Gráfico de barras: sismos por intervalo de tiempo.${hasPick ? " Con las flechas se recorren los intervalos y con Enter se elige uno para resaltarlo en la línea de tiempo y la tabla." : ""}` : "Gráfico de área: sismos acumulados"}>
      <ResponsiveContainer width="100%" height={300}>
        {mode === "interval" ? (
          <BarChart {...common} barCategoryGap="22%" onClick={(state) => pick(buckets[Number((state as { activeTooltipIndex?: number | string } | undefined)?.activeTooltipIndex)])}>
            <CartesianGrid stroke="var(--an-grid)" vertical={false} />
            {xAxis}{yAxis}{tooltip}
            <Bar dataKey="count" maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={!reduced} animationDuration={ENTER_MS} animationEasing="ease-out">
              {buckets.map((bucket) => {
                const chosen = selectedStart !== undefined && selectedStart !== null;
                const isChosen = bucket.start === selectedStart;
                return (
                  <Cell key={bucket.start} fill={bucket.maxMag !== null && bucket.maxMag >= 5 ? "var(--an-s2)" : "var(--an-s1)"}
                    fillOpacity={chosen && !isChosen ? 0.3 : 1} stroke={isChosen ? "var(--an-ink)" : "none"} strokeWidth={isChosen ? 2 : 0} />
                );
              })}
            </Bar>
          </BarChart>
        ) : (
          <AreaChart {...common}>
            <CartesianGrid stroke="var(--an-grid)" vertical={false} />
            {xAxis}{yAxis}{tooltip}
            <Area dataKey="cumulative" type="stepAfter" stroke="var(--an-s1)" strokeWidth={2} fill="var(--an-s1)" fillOpacity={0.1} dot={false} isAnimationActive={!reduced} animationDuration={ENTER_MS + 200} animationEasing="ease-out" activeDot={{ r: 5, stroke: "var(--an-surface)", strokeWidth: 2, fill: "var(--an-s1)" }} />
          </AreaChart>
        )}
      </ResponsiveContainer>
    </div>
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
