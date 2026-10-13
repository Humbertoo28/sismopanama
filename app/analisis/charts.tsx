"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import { type Bucket, type Quake } from "../../lib/analytics";
import { fmtClock, fmtDay, fmtFull, fmtInt, tickLabel, timeTicks } from "./format";
import { useReducedMotion } from "./motion";

// Este archivo es el único que importa Recharts (~115 KB comprimidos): el panel lo carga aparte y en paralelo con los datos
// (dashboard.tsx), para que el resto de la página no tenga que esperarlo. La leyenda y las barras horizontales viven en bars.tsx.

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

// ---------- línea de tiempo: cada sismo es un punto (tiempo × magnitud) ----------

type DotProps = {
  cx: number;
  cy: number;
  id: string;
  mag: number;
  role: TimelinePoint["role"];
  selected: boolean;
  // Atenuado por lo que se eligió en otra gráfica (un intervalo, una magnitud, una profundidad).
  dim: boolean;
  // Sismo que acaba de entrar (aro que se expande) y el que se acaba de «ocurrir» en la reproducción (una sola onda).
  fresh: boolean;
  ripple: boolean;
  delay: number;
  onPick: (id: string) => void;
};

// Está fuera del componente que dibuja la gráfica a propósito (si se creara dentro, cada cambio lo volvería un componente «nuevo» para
// React y los 500 puntos se dibujarían de cero y repetirían su animación de entrada) y recibe solo valores simples, para que
// `memo` lo salte cuando nada de él cambió: al reproducir, elegir o atenuar, solo se vuelven a dibujar los puntos que cambian.
// Un punto son 3 elementos del SVG: el grupo (que anima y recibe el toque), el área de toque y el círculo.
const TimelineDot = memo(function TimelineDot({ cx, cy, id, mag, role, selected, dim, fresh, ripple, delay, onPick }: DotProps) {
  const radius = Math.max(3.5, Math.min(15, 2.2 + (mag - 2) * 2.4));
  return (
    <g className={`an-dot${dim ? " an-dim" : ""}${selected ? " an-sel" : ""}`} style={{ "--d": `${delay}ms` } as CSSProperties} onClick={() => onPick(id)}>
      <circle cx={cx} cy={cy} r={radius + 9} fill="transparent" />
      {fresh && <circle className="an-ring an-ring-fresh" cx={cx} cy={cy} r={radius} />}
      {ripple && <circle className="an-ring an-ring-ripple" cx={cx} cy={cy} r={radius} />}
      <circle cx={cx} cy={cy} r={radius} fill={role === "main" ? "var(--an-s2)" : "var(--an-s1)"} fillOpacity={role === "normal" ? 0.6 : 0.95} stroke="var(--an-surface)" strokeWidth={1.5} />
      {role === "latest" && <circle cx={cx} cy={cy} r={radius + 3.5} fill="none" stroke="var(--an-ink)" strokeWidth={2} />}
      {selected && <circle className="an-sel-ring" cx={cx} cy={cy} r={radius + 6} fill="none" stroke="var(--an-ink)" strokeWidth={2} strokeDasharray="2 3" />}
    </g>
  );
});

export function TimelineChart({ points, domain, magRange, selectedId, onSelect, dimmed, freshIds, rippleId, fill }: {
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
  // En pantalla completa la gráfica llena el alto que le deja el panel en vez de medir 320 px.
  fill?: boolean;
}) {
  const [from, to] = domain;
  const [staggering, setStaggering] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => setStaggering(false), DOTS_MS + 700);
    return () => window.clearTimeout(timer);
  }, []);
  // El toque sobre un punto llama siempre a la versión más reciente de onSelect, sin cambiar la función que reciben los puntos.
  const latestSelect = useRef(onSelect);
  useEffect(() => {
    latestSelect.current = onSelect;
  });
  const pick = useCallback((id: string) => latestSelect.current(id), []);

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

  const shape = (props: unknown) => {
    const { cx, cy, payload } = props as { cx?: number; cy?: number; payload?: TimelinePoint };
    if (cx === undefined || cy === undefined || !payload) return <g />;
    // Al cargar, los puntos entran en orden cronológico (el más antiguo primero) a lo largo de ~0.9 s.
    const delay = staggering ? Math.round(((rank.get(payload.id) ?? 0) / Math.max(1, points.length)) * DOTS_MS) : 0;
    return (
      <TimelineDot cx={cx} cy={cy} id={payload.id} mag={payload.mag} role={payload.role} selected={payload.id === selectedId}
        dim={dimmed?.(payload) ?? false} fresh={freshIds?.has(payload.id) ?? false} ripple={rippleId === payload.id} delay={delay} onPick={pick} />
    );
  };

  if (!points.length) return <p className="an-empty">No hay sismos con estos filtros.</p>;
  return (
    <div className={`an-chart${fill ? " is-fill" : ""}`} role="img" aria-label={`Gráfico de ${points.length} sismos por hora y magnitud. Los mismos datos están en la tabla de eventos.`}>
      <ResponsiveContainer width="100%" height={fill ? "100%" : 320}>
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
          <Scatter data={ordered} shape={shape} isAnimationActive={false} />
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
