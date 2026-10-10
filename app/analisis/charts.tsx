"use client";

import type { CSSProperties, ReactNode } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import { type Band, type Bucket, type Quake, depthHistogram, magnitudeHistogram } from "../../lib/analytics";
import { fmtClock, fmtDay, fmtFull, fmtInt, tickLabel, timeTicks } from "./format";

// Los colores son variables CSS (analisis.css): el azul y el naranja son los dos primeros tonos categóricos de una
// paleta validada contra daltonismo; el naranja solo se usa para lo que el lector debe ver primero.
const tick = { fill: "var(--an-muted)", fontSize: 12 };
const axisLine = { stroke: "var(--an-grid)" };
const axisLabel = (value: string, angle?: number) => ({ value, angle, fill: "var(--an-muted)", fontSize: 12, ...(angle ? { position: "insideLeft" as const, offset: 8, dx: -4 } : { position: "insideBottom" as const, offset: -2 }) });

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

type DotProps = { cx?: number; cy?: number; payload?: TimelinePoint };

export function TimelineChart({ points, from, to, selectedId, onSelect }: {
  points: TimelinePoint[]; from: number; to: number; selectedId: string | null; onSelect: (id: string) => void;
}) {
  if (!points.length) return <p className="an-empty">No hay sismos con estos filtros.</p>;
  const mags = points.map((point) => point.mag);
  const low = Math.max(0, Math.floor(Math.min(...mags) - 0.3));
  const high = Math.ceil(Math.max(...mags) + 0.3);
  const { ticks, step } = timeTicks(from, to);
  const edge = to + Math.max(10 * 60_000, (to - from) * 0.03); // aire a la derecha: el último sismo no queda cortado
  // Los destacados se dibujan al final para que no los tape ningún punto común.
  const ordered = [...points].sort((a, b) => Number(a.role !== "normal") - Number(b.role !== "normal") || Number(a.id === selectedId) - Number(b.id === selectedId));

  const Dot = ({ cx, cy, payload }: DotProps) => {
    if (cx === undefined || cy === undefined || !payload) return <g />;
    const radius = Math.max(3.5, Math.min(15, 2.2 + (payload.mag - 2) * 2.4));
    const selected = payload.id === selectedId;
    const fill = payload.role === "main" ? "var(--an-s2)" : "var(--an-s1)";
    return (
      <g className="an-dot" onClick={() => onSelect(payload.id)} style={{ cursor: "pointer" }}>
        <circle cx={cx} cy={cy} r={radius + 9} fill="transparent" />
        <circle cx={cx} cy={cy} r={radius} fill={fill} fillOpacity={payload.role === "normal" ? 0.6 : 0.95} stroke="var(--an-surface)" strokeWidth={1.5} />
        {payload.role === "latest" && <circle cx={cx} cy={cy} r={radius + 3.5} fill="none" stroke="var(--an-ink)" strokeWidth={2} />}
        {selected && <circle cx={cx} cy={cy} r={radius + 6} fill="none" stroke="var(--an-ink)" strokeWidth={2} strokeDasharray="2 3" />}
      </g>
    );
  };

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
          <Tooltip cursor={false} isAnimationActive={false} content={(props) => {
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
          <Scatter data={ordered} shape={(props: unknown) => <Dot {...(props as DotProps)} />} isAnimationActive={false} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------- actividad por intervalo y acumulada ----------

export function ActivityChart({ buckets, size, mode }: { buckets: Bucket[]; size: number; mode: "interval" | "cumulative" }) {
  if (!buckets.length || buckets[buckets.length - 1].cumulative === 0) return <p className="an-empty">No hay sismos con estos filtros.</p>;
  const label = (start: number) => (size >= 24 * 3_600_000 ? fmtDay.format(start) : size >= 3 * 3_600_000 ? `${fmtDay.format(start)} ${fmtClock.format(start)}` : fmtClock.format(start));
  const common = { data: buckets, margin: { top: 10, right: 18, bottom: 4, left: 4 } };
  const xAxis = <XAxis dataKey="start" tickFormatter={label} tick={tick} tickLine={false} axisLine={axisLine} minTickGap={28} />;
  const yAxis = <YAxis allowDecimals={false} tick={tick} tickLine={false} axisLine={false} width={44} />;
  const tooltip = (
    <Tooltip cursor={{ fill: "var(--an-hover)" }} isAnimationActive={false} content={(props) => {
      const tip = asTip<Bucket>(props);
      const bucket = tip.active ? tip.payload?.[0]?.payload : undefined;
      return bucket ? (
        <Tip title={`${fmtFull.format(bucket.start)} – ${fmtClock.format(bucket.start + size)}`} rows={[
          ["Sismos en el intervalo", fmtInt.format(bucket.count)],
          ["Acumulado", fmtInt.format(bucket.cumulative)],
          ["Mayor magnitud", bucket.maxMag === null ? "—" : `M ${bucket.maxMag.toFixed(1)}`],
        ]} />
      ) : null;
    }} />
  );
  return (
    <div className="an-chart" role="img" aria-label={mode === "interval" ? "Gráfico de barras: sismos por intervalo de tiempo" : "Gráfico de área: sismos acumulados"}>
      <ResponsiveContainer width="100%" height={300}>
        {mode === "interval" ? (
          <BarChart {...common} barCategoryGap="22%">
            <CartesianGrid stroke="var(--an-grid)" vertical={false} />
            {xAxis}{yAxis}{tooltip}
            <Bar dataKey="count" maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false}>
              {buckets.map((bucket) => <Cell key={bucket.start} fill={bucket.maxMag !== null && bucket.maxMag >= 5 ? "var(--an-s2)" : "var(--an-s1)"} />)}
            </Bar>
          </BarChart>
        ) : (
          <AreaChart {...common}>
            <CartesianGrid stroke="var(--an-grid)" vertical={false} />
            {xAxis}{yAxis}{tooltip}
            <Area dataKey="cumulative" type="stepAfter" stroke="var(--an-s1)" strokeWidth={2} fill="var(--an-s1)" fillOpacity={0.1} dot={false} isAnimationActive={false} activeDot={{ r: 5, stroke: "var(--an-surface)", strokeWidth: 2, fill: "var(--an-s1)" }} />
          </AreaChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

// ---------- distribuciones: barras horizontales simples (HTML, con el valor siempre visible) ----------

function HBars({ bands, unit, note }: { bands: Band[]; unit: string; note?: string }) {
  const max = Math.max(1, ...bands.map((band) => band.count));
  return (
    <div className="an-hbars">
      {bands.map((band) => (
        <div key={band.label} className="an-hbar" title={`${band.label}: ${band.count} ${unit}`}>
          <span>{band.label}</span>
          <div className="an-hbar-track"><div style={{ width: `${(band.count / max) * 100}%` }} /></div>
          <b>{fmtInt.format(band.count)}</b>
        </div>
      ))}
      {note && <p className="an-note">{note}</p>}
    </div>
  );
}

export function DepthBars({ quakes }: { quakes: Quake[] }) {
  const { bands, unknown } = depthHistogram(quakes);
  return <HBars bands={bands} unit="sismos" note={unknown > 0 ? `${unknown} sin profundidad informada.` : undefined} />;
}

export function MagnitudeBars({ quakes }: { quakes: Quake[] }) {
  return <HBars bands={magnitudeHistogram(quakes)} unit="sismos" />;
}
