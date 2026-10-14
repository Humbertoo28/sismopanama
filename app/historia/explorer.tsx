"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Link2, Pause, Play, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import {
  decadeSeries, distanceKm, eraOf, filterQuakes, formatDateUTC, formatMag, m7Gaps, placeEs, rankById, sameDay, withinKm, yearOf, yearsBetween,
  type HistoricQuake,
} from "../../lib/history";
import { H, W, px, py, radiusOf } from "./frame";
import "./explorer.css";

// La parte interactiva de la historia sísmica: un mapa con zoom, una línea de tiempo con reproducción, el detalle de cada sismo, las
// décadas como filtro, la tabla completa y los de M 7 o más. Todo sale del catálogo del USGS que recibe del servidor (sismos de M 6 o
// más en Panamá desde 1900): lo que muestra son esos registros, conteos, fechas y distancias entre las posiciones que publica el
// USGS. No hay estimaciones ni predicciones.

type City = { name: string; lat: number; lng: number };
type View = { z: number; cx: number; cy: number };

const MIN_MAGS = [6, 6.5, 7] as const;
const ROWS_FIRST = 12;
const ROWS_MORE = 24;
const MAX_ZOOM = 8;
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const kind = (quake: HistoricQuake) => (quake.magType ? quake.magType.charAt(0).toUpperCase() + quake.magType.slice(1).toLowerCase() : "");
const clock = (time: number) => new Date(time).toISOString().slice(11, 16);
const coords = (quake: HistoricQuake) => `${Math.abs(quake.lat).toFixed(2)}° ${quake.lat >= 0 ? "N" : "S"}, ${Math.abs(quake.lng).toFixed(2)}° ${quake.lng >= 0 ? "E" : "O"}`;

// ---- el sismo elegido vive en la dirección (#sismo=<id>): se puede compartir y sobrevive a recargar la página ----
const subscribeHash = (notify: () => void) => {
  window.addEventListener("hashchange", notify);
  return () => window.removeEventListener("hashchange", notify);
};
const readHash = () => window.location.hash;
function writeSelection(id: string | null) {
  const base = window.location.pathname + window.location.search;
  window.history.replaceState(null, "", id ? `${base}#sismo=${id}` : base);
  window.dispatchEvent(new Event("hashchange"));
}

// ---------- mapa ----------

function QuakeMap({ visible, selectedId, mainId, onPick, view, onView, outline, cities }: {
  visible: HistoricQuake[];
  selectedId: string | null;
  mainId: string | null;
  onPick: (id: string) => void;
  view: View;
  onView: (view: View) => void;
  outline: string;
  cities: City[];
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ id: number; x: number; y: number; cx: number; cy: number; moved: boolean } | null>(null);
  const [hover, setHover] = useState<{ quake: HistoricQuake; left: number; top: number } | null>(null);
  const [panning, setPanning] = useState(false);

  const z = view.z;
  const vw = W / z;
  const vh = H / z;
  const cx = clamp(view.cx, vw / 2, W - vw / 2);
  const cy = clamp(view.cy, vh / 2, H - vh / 2);
  const vx = cx - vw / 2;
  const vy = cy - vh / 2;
  const shrink = 1 / Math.sqrt(z); // los círculos crecen menos que el mapa al acercar
  const ordered = useMemo(() => [...visible].sort((a, b) => b.mag - a.mag), [visible]); // los grandes debajo, los chicos encima

  // El sismo más cercano a un punto de la pantalla (dentro de `maxPx` píxeles), para tocar sin tener que acertar al círculo.
  const nearest = (clientX: number, clientY: number, maxPx: number) => {
    const el = svg.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const bx = vx + ((clientX - rect.left) / rect.width) * vw;
    const by = vy + ((clientY - rect.top) / rect.height) * vh;
    const k = rect.width / vw;
    let best: HistoricQuake | null = null;
    let bestDistance = maxPx;
    for (const quake of visible) {
      const d = Math.hypot((px(quake.lng) - bx) * k, (py(quake.lat) - by) * k);
      if (d <= bestDistance) {
        best = quake;
        bestDistance = d;
      }
    }
    return best ? { quake: best, left: ((px(best.lng) - vx) / vw) * 100, top: ((py(best.lat) - vy) / vh) * 100 } : null;
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, cx, cy, moved: false };
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (current && current.id === event.pointerId) {
      const dx = event.clientX - current.x;
      const dy = event.clientY - current.y;
      if (!current.moved && Math.hypot(dx, dy) > 6) {
        current.moved = true;
        if (z > 1) {
          wrap.current?.setPointerCapture(event.pointerId);
          setPanning(true);
        }
      }
      if (current.moved && z > 1) {
        const rect = svg.current?.getBoundingClientRect();
        if (rect) onView({ z, cx: current.cx - (dx / rect.width) * vw, cy: current.cy - (dy / rect.height) * vh });
      }
      return;
    }
    if (event.pointerType === "mouse") setHover(nearest(event.clientX, event.clientY, 16));
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    drag.current = null;
    setPanning(false);
    if (current && !current.moved) {
      const hit = nearest(event.clientX, event.clientY, event.pointerType === "mouse" ? 16 : 28);
      if (hit) onPick(hit.quake.id);
    }
  };

  const lngLines = [-83, -82, -81, -80, -79, -78];
  const latLines = [7, 8, 9, 10];
  const k = 1 / z;
  return (
    <div ref={wrap} className={`hx-map-wrap${z > 1 ? " is-zoomed" : ""}${panning ? " is-panning" : ""}`}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
      onPointerCancel={() => { drag.current = null; setPanning(false); }} onPointerLeave={() => setHover(null)}>
      <svg ref={svg} className="hs-map hx-map" viewBox={`${vx} ${vy} ${vw} ${vh}`} role="img" style={{ "--k": k } as CSSProperties}
        aria-label="Mapa de los sismos de magnitud 6 o más en Panamá desde 1900. La tabla de abajo trae los mismos datos.">
        <rect className="hs-sea" x="0" y="0" width={W} height={H} rx="14" />
        <g className="hs-grid" aria-hidden="true">
          {lngLines.map(l => (
            <g key={`lng${l}`}>
              <line x1={px(l)} x2={px(l)} y1={0} y2={H} />
              <text x={px(l) + 4 * k} y={vy + vh - 8 * k}>{Math.abs(l)}° O</text>
            </g>
          ))}
          {latLines.map(l => (
            <g key={`lat${l}`}>
              <line x1={0} x2={W} y1={py(l)} y2={py(l)} />
              <text x={vx + 8 * k} y={py(l) - 5 * k}>{l}° N</text>
            </g>
          ))}
        </g>
        <path className="hs-land" d={outline} />
        <g className="hx-cities" aria-hidden="true">
          {cities.map(city => (
            <g key={city.name}>
              <rect x={px(city.lng) - 3 * k} y={py(city.lat) - 3 * k} width={6 * k} height={6 * k} />
              <text x={px(city.lng) + 7 * k} y={py(city.lat) + 4 * k}>{city.name}</text>
            </g>
          ))}
        </g>
        <g>
          {ordered.map(quake => {
            const era = eraOf(quake);
            const r = radiusOf(quake.mag) * shrink;
            const x = px(quake.lng);
            const y = py(quake.lat);
            return (
              <g key={quake.id} className="hs-pop" style={{ "--i": 0 } as CSSProperties}>
                {quake.id === mainId && <circle className="hs-halo" cx={x} cy={y} r={r + 7 * shrink} style={{ "--r": r + 7 * shrink } as CSSProperties} />}
                <circle className={`hs-dot hs-${era}`} cx={x} cy={y} r={r} style={{ "--r": r } as CSSProperties} />
              </g>
            );
          })}
        </g>
        {selectedId && (() => {
          const quake = visible.find(item => item.id === selectedId);
          return quake ? <circle className="hx-selring" cx={px(quake.lng)} cy={py(quake.lat)} r={radiusOf(quake.mag) * shrink + 6 * shrink} style={{ "--r": radiusOf(quake.mag) * shrink + 6 * shrink } as CSSProperties} /> : null;
        })()}
      </svg>
      {hover && (
        <div className="hx-tip" style={{ left: `${hover.left}%`, top: `${hover.top}%` }} aria-hidden="true">
          <strong>M {formatMag(hover.quake.mag)}</strong> · {yearOf(hover.quake.time)}
        </div>
      )}
    </div>
  );
}

// ---------- línea de tiempo: año × magnitud ----------

const SW = 760;
const SH = 190;
const ML = 48;
const MR = 12;
const MT = 10;
const MB = 26;
const MAG_LOW = 5.8;
const MAG_HIGH = 8;

function Strip({ shown, faint, selectedId, onPick, first, last, cursor, win }: {
  shown: HistoricQuake[];
  faint: HistoricQuake[];
  selectedId: string | null;
  onPick: (id: string) => void;
  first: number;
  last: number;
  cursor: number;
  win: [number, number];
}) {
  const svg = useRef<SVGSVGElement>(null);
  const t0 = Date.UTC(first, 0, 1);
  const t1 = Date.UTC(last + 1, 0, 1);
  const x = (time: number) => ML + ((time - t0) / (t1 - t0)) * (SW - ML - MR);
  const y = (mag: number) => SH - MB - ((mag - MAG_LOW) / (MAG_HIGH - MAG_LOW)) * (SH - MT - MB);
  const years: number[] = [];
  for (let year = Math.ceil(first / 20) * 20; year <= last; year += 20) years.push(year);

  const onClick = (event: ReactMouseEvent<SVGSVGElement>) => {
    const el = svg.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const k = rect.width / SW;
    const bx = ((event.clientX - rect.left) / rect.width) * SW;
    const by = ((event.clientY - rect.top) / rect.height) * SH;
    let best: HistoricQuake | null = null;
    let bestDistance = event.nativeEvent instanceof PointerEvent && event.nativeEvent.pointerType === "mouse" ? 14 : 24;
    for (const quake of shown) {
      const d = Math.hypot((x(quake.time) - bx) * k, (y(quake.mag) - by) * k);
      if (d <= bestDistance) {
        best = quake;
        bestDistance = d;
      }
    }
    if (best) onPick(best.id);
  };

  return (
    <svg ref={svg} className="hx-strip" viewBox={`0 0 ${SW} ${SH}`} role="img" onClick={onClick}
      aria-label="Línea de tiempo: cada punto es un sismo, su año en el eje horizontal y su magnitud en el vertical.">
      <rect className="hs-sea" x="0" y="0" width={SW} height={SH} rx="12" />
      <g className="hs-grid" aria-hidden="true">
        {[6, 7, 8].map(mag => (
          <g key={mag}>
            <line x1={ML} x2={SW - MR} y1={y(mag)} y2={y(mag)} />
            <text x={ML - 6} y={y(mag) + 4} textAnchor="end">M {mag}</text>
          </g>
        ))}
        {years.map(year => (
          <g key={year}>
            <line x1={x(Date.UTC(year, 0, 1))} x2={x(Date.UTC(year, 0, 1))} y1={MT} y2={SH - MB} />
            <text x={x(Date.UTC(year, 0, 1))} y={SH - 8} textAnchor="middle">{year}</text>
          </g>
        ))}
      </g>
      {(win[0] > first || win[1] < last) && (
        <rect className="hx-window" x={x(Date.UTC(win[0], 0, 1))} y={MT} width={x(Date.UTC(win[1] + 1, 0, 1)) - x(Date.UTC(win[0], 0, 1))} height={SH - MT - MB} />
      )}
      <line className="hx-cursor" x1={x(Date.UTC(cursor + 1, 0, 1))} x2={x(Date.UTC(cursor + 1, 0, 1))} y1={MT} y2={SH - MB} />
      <g className="hx-faint">
        {faint.map(quake => <circle key={quake.id} className={`hs-dot hs-${eraOf(quake)}`} cx={x(quake.time)} cy={y(quake.mag)} r={3} style={{ "--r": 3 } as CSSProperties} />)}
      </g>
      <g>
        {shown.map(quake => <circle key={quake.id} className={`hs-dot hs-${eraOf(quake)}`} cx={x(quake.time)} cy={y(quake.mag)} r={quake.id === selectedId ? 6 : 3.6} style={{ "--r": quake.id === selectedId ? 6 : 3.6 } as CSSProperties} />)}
        {selectedId && (() => {
          const quake = shown.find(item => item.id === selectedId);
          return quake ? <circle className="hx-selring" cx={x(quake.time)} cy={y(quake.mag)} r={10} style={{ "--r": 10 } as CSSProperties} /> : null;
        })()}
      </g>
    </svg>
  );
}

// ---------- la página interactiva ----------

export default function HistoryExplorer({ quakes, outline, cities, topMap }: { quakes: HistoricQuake[]; outline: string; cities: City[]; topMap: ReactNode }) {
  const all = useMemo(() => [...quakes].sort((a, b) => a.time - b.time), [quakes]);
  const first = all.length ? yearOf(all[0].time) : 1900;
  const last = all.length ? yearOf(all[all.length - 1].time) : first;
  const ranks = useMemo(() => rankById(all), [all]);
  const main = useMemo(() => all.filter(quake => quake.current).sort((a, b) => b.mag - a.mag)[0] ?? null, [all]);
  const previousLargest = useMemo(() => all.filter(quake => !quake.current).sort((a, b) => b.mag - a.mag || b.time - a.time)[0] ?? null, [all]);

  const [minMag, setMinMag] = useState<number>(6);
  const [win, setWin] = useState<[number, number]>([first, last]);
  const [cursor, setCursor] = useState(last);
  const [playing, setPlaying] = useState(false);
  const [view, setView] = useState<View>({ z: 1, cx: W / 2, cy: H / 2 });
  const [sort, setSort] = useState<"mag" | "new" | "old">("mag");
  const [rows, setRows] = useState(ROWS_FIRST);
  const [announce, setAnnounce] = useState("");
  const [copied, setCopied] = useState(false);
  const raf = useRef(0);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const hash = useSyncExternalStore(subscribeHash, readHash, () => "");
  const hashId = /^#sismo=([A-Za-z0-9]+)$/.exec(hash)?.[1] ?? null;
  const selected = hashId ? all.find(quake => quake.id === hashId) ?? null : null;

  // Con un enlace a un sismo concreto (#sismo=…), la página baja hasta el explorador al abrirse.
  useEffect(() => {
    const id = /^#sismo=([A-Za-z0-9]+)$/.exec(window.location.hash)?.[1];
    if (id && all.some(quake => quake.id === id)) document.getElementById("hx-explorer")?.scrollIntoView({ block: "start" });
  }, [all]);

  const windowed = useMemo(() => filterQuakes(all, { minMag, from: win[0], to: win[1] }), [all, minMag, win]);
  const shown = useMemo(() => windowed.filter(quake => yearOf(quake.time) <= cursor), [windowed, cursor]);
  const faint = useMemo(() => windowed.filter(quake => yearOf(quake.time) > cursor), [windowed, cursor]);
  const decades = useMemo(() => decadeSeries(all.filter(quake => quake.mag >= minMag)), [all, minMag]);
  const maxDecade = Math.max(1, ...decades.map(d => d.count));
  const narrowed = win[0] > first || win[1] < last;

  const stop = () => {
    cancelAnimationFrame(raf.current);
    setPlaying(false);
  };
  const choose = (id: string | null) => {
    writeSelection(id);
    setCopied(false);
    const quake = id ? all.find(item => item.id === id) : null;
    if (quake && view.z > 1) setView({ z: view.z, cx: px(quake.lng), cy: py(quake.lat) });
  };
  const step = (delta: number) => {
    const list = windowed.length ? windowed : all;
    const index = selected ? list.findIndex(quake => quake.id === selected.id) : -1;
    const next = index === -1 ? (delta > 0 ? list[0] : list[list.length - 1]) : list[index + delta];
    if (next) choose(next.id);
  };
  const zoomBy = (factor: number) =>
    setView(current => {
      const z = clamp(current.z * factor, 1, MAX_ZOOM);
      return z === 1 ? { z, cx: W / 2, cy: H / 2 } : { z, cx: current.cx, cy: current.cy };
    });
  const resetView = () => setView({ z: 1, cx: W / 2, cy: H / 2 });
  const zoomToSelected = () => selected && setView({ z: Math.max(view.z, 4), cx: px(selected.lng), cy: py(selected.lat) });

  const changeMin = (value: number) => {
    setMinMag(value);
    setRows(ROWS_FIRST);
  };
  const setWindow = (from: number, to: number) => {
    stop();
    setWin([from, to]);
    setCursor(to);
    setRows(ROWS_FIRST);
  };
  const pickDecade = (decade: number) => {
    const to = Math.min(decade + 9, last);
    if (win[0] === decade && win[1] === to) setWindow(first, last);
    else setWindow(decade, to);
  };
  const play = () => {
    const [a, b] = win;
    if (a === b) return;
    cancelAnimationFrame(raf.current);
    setCursor(a);
    setPlaying(true);
    setAnnounce(`Reproducción iniciada: de ${a} a ${b}.`);
    const duration = clamp((b - a) * 90, 4000, 14000);
    const started = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / duration);
      setCursor(a + Math.floor(progress * (b - a)));
      if (progress < 1) {
        raf.current = requestAnimationFrame(tick);
      } else {
        setCursor(b);
        setPlaying(false);
        setAnnounce(`Reproducción terminada: ${plural(windowed.length, "sismo", "sismos")} de ${a} a ${b}.`);
      }
    };
    raf.current = requestAnimationFrame(tick);
  };

  const onMapKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const handled: Record<string, () => void> = {
      ArrowRight: () => step(1),
      ArrowLeft: () => step(-1),
      "+": () => zoomBy(2),
      "=": () => zoomBy(2),
      "-": () => zoomBy(0.5),
      "0": resetView,
      Escape: () => choose(null),
    };
    const action = handled[event.key];
    if (!action) return;
    event.preventDefault();
    action();
  };

  const sortedRows = useMemo(() => {
    const list = [...windowed];
    if (sort === "mag") list.sort((a, b) => b.mag - a.mag || b.time - a.time);
    else if (sort === "new") list.sort((a, b) => b.time - a.time);
    else list.sort((a, b) => a.time - b.time);
    return list;
  }, [windowed, sort]);
  const gaps = useMemo(() => m7Gaps(all), [all]);
  const gapYears = gaps.flatMap(gap => (gap.years === null ? [] : [gap.years]));

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
    } catch {
      // Algunas vistas integradas no dejan copiar: la dirección ya está en la barra del navegador.
    }
  };

  // ---- el detalle del sismo elegido: lo publicado y lo que se calcula con ello ----
  const detail = (quake: HistoricQuake) => {
    const rank = ranks.get(quake.id);
    const sameDate = sameDay(quake, all);
    const near = withinKm(quake, all, 100);
    const isMain = main?.id === quake.id;
    const lines: ReactNode[] = [];
    if (main && !isMain) {
      if (quake.time < main.time) {
        const years = yearsBetween(quake.time, main.time);
        lines.push(<>Ocurrió {years < 1 ? "menos de un año" : plural(years, "año", "años")} antes del sismo de {yearOf(main.time)}.</>);
      } else {
        const hours = (quake.time - main.time) / 3_600_000;
        lines.push(<>Pertenece a la secuencia de {yearOf(main.time)}: ocurrió {hours < 48 ? `${Math.max(1, Math.round(hours))} h` : `${Math.round(hours / 24)} días`} después del sismo principal.</>);
      }
      const diff = main.mag - quake.mag;
      lines.push(<>Su magnitud ({formatMag(quake.mag)}) es {Math.abs(diff) < 0.05 ? "igual a" : `${Math.abs(diff).toFixed(1)} ${diff > 0 ? "menos" : "más"} que`} la del sismo de {yearOf(main.time)} (M {formatMag(main.mag)}).</>);
      lines.push(<>Su epicentro publicado queda a {Math.round(distanceKm(quake, main))} km del epicentro de {yearOf(main.time)}.</>);
    }
    lines.push(<>En un radio de 100 km de su posición publicada, la lista trae {plural(near, "sismo", "sismos")} de M 6 o más (contando este).</>);
    return { rank, sameDate, lines, isMain };
  };
  const info = selected ? detail(selected) : null;
  const navIndex = selected ? windowed.findIndex(quake => quake.id === selected.id) : -1;

  return (
    <>
      <section className="hs-card" id="hx-explorer" aria-labelledby="hx-h">
        <h2 id="hx-h">Explora los {all.length} sismos</h2>
        <p className="hs-sub">Toca un círculo del mapa o de la línea de tiempo para ver ese sismo. Cambia la magnitud mínima, elige una década o reproduce la historia año por año.</p>

        <div className="hx-controls">
          <div className="hx-group" role="group" aria-label="Magnitud mínima">
            <span className="hx-label">Magnitud</span>
            {MIN_MAGS.map(value => (
              <button key={value} type="button" className="hx-chip" aria-pressed={minMag === value} onClick={() => changeMin(value)}>{value.toFixed(1)}+</button>
            ))}
          </div>
          <div className="hx-group" role="group" aria-label="Reproducción">
            {playing
              ? <button type="button" className="hx-btn hx-main" onClick={stop}><Pause aria-hidden="true" size={18} /><span>Pausar</span></button>
              : <button type="button" className="hx-btn hx-main" onClick={play} disabled={win[0] === win[1]}><Play aria-hidden="true" size={18} /><span>Reproducir la historia</span></button>}
            {narrowed && <button type="button" className="hx-btn" onClick={() => setWindow(first, last)}><RotateCcw aria-hidden="true" size={16} /><span>Todos los años</span></button>}
          </div>
          <div className="hx-group" role="group" aria-label="Acercar el mapa">
            <button type="button" className="hx-btn hx-icon" onClick={() => zoomBy(2)} disabled={view.z >= MAX_ZOOM} aria-label="Acercar el mapa"><ZoomIn aria-hidden="true" size={18} /></button>
            <button type="button" className="hx-btn hx-icon" onClick={() => zoomBy(0.5)} disabled={view.z <= 1} aria-label="Alejar el mapa"><ZoomOut aria-hidden="true" size={18} /></button>
            <button type="button" className="hx-btn" onClick={resetView} disabled={view.z === 1}>Ver todo</button>
          </div>
        </div>

        <label className="hx-scrub">
          <span>Hasta el año <strong>{cursor}</strong>{narrowed ? <small> (desde {win[0]})</small> : null}</span>
          <input type="range" min={win[0]} max={win[1]} step={1} value={cursor} disabled={win[0] === win[1]}
            onChange={event => { stop(); setCursor(Number(event.target.value)); }} aria-valuetext={`Sismos hasta el año ${cursor}`} />
        </label>
        <p className="hx-count" role="status">
          {plural(shown.length, "sismo", "sismos")} de {windowed.length} en {win[0] === win[1] ? win[0] : `${win[0]}–${win[1]}`}
          {windowed.length ? <> · el mayor, M {formatMag(Math.max(...windowed.map(q => q.mag)))}</> : null}
        </p>

        <div className="hx-stage">
          <div className="hx-visual">
            <div tabIndex={0} role="group" aria-label="Mapa interactivo. Con el teclado: flechas izquierda y derecha para pasar de un sismo al siguiente, más y menos para acercar, cero para ver todo, Escape para quitar la selección."
              onKeyDown={onMapKey} className="hx-focus">
              <QuakeMap visible={shown} selectedId={selected?.id ?? null} mainId={main?.id ?? null} onPick={choose} view={view} onView={setView} outline={outline} cities={cities} />
            </div>
            {selected && (
              <div className="hx-pick">
                <span><strong>M {formatMag(selected.mag)}</strong> · {formatDateUTC(selected.time)} · {placeEs(selected.place)}</span>
                <button type="button" className="hx-linkbtn" onClick={() => document.getElementById("hx-detail")?.scrollIntoView({ block: "start", behavior: "smooth" })}>Ver el detalle ↓</button>
              </div>
            )}
            <p className="hx-hint">Toca un círculo para ver ese sismo. {view.z > 1 ? "Arrastra el mapa para moverlo." : "Acerca el mapa con los botones o con + y −."} Con el teclado, las flechas recorren los sismos.</p>
            <Strip shown={shown} faint={faint} selectedId={selected?.id ?? null} onPick={choose} first={first} last={last} cursor={cursor} win={win} />
            <ul className="hs-legend" aria-label="Leyenda">
              <li><i className="hs-sw hs-e1" /> 1900–1949</li>
              <li><i className="hs-sw hs-e2" /> 1950–1999</li>
              <li><i className="hs-sw hs-e3" /> 2000–2025</li>
              <li><i className="hs-sw hs-now" /> Secuencia de 2026</li>
            </ul>
          </div>

          <div className="hx-detail" id="hx-detail" role="region" aria-label="Detalle del sismo elegido" aria-live="polite">
            {selected && info ? (
              <>
                <div className="hx-detail-head">
                  <span className={`hs-rank hs-${eraOf(selected)}`} title="Puesto por magnitud entre todos">{info.rank}</span>
                  <div>
                    <strong className="hx-mag">M {formatMag(selected.mag)}{kind(selected) && <small> {kind(selected)}</small>}</strong>
                    <span className="hx-when">{formatDateUTC(selected.time)} · {clock(selected.time)} UTC</span>
                  </div>
                </div>
                {selected.current && <span className="hs-badge">Secuencia actual</span>}
                <p className="hx-place">{placeEs(selected.place)}</p>
                <dl className="hx-facts">
                  <div><dt>Puesto por magnitud</dt><dd>{info.rank} de {all.length}</dd></div>
                  <div><dt>Profundidad</dt><dd>{selected.depth === null ? "—" : `${Math.round(selected.depth)} km`}</dd></div>
                  <div><dt>Posición publicada</dt><dd>{coords(selected)}</dd></div>
                </dl>
                <ul className="hx-lines">
                  {info.lines.map((line, index) => <li key={index}>{line}</li>)}
                </ul>
                {info.sameDate.length > 0 && (
                  <p className="hx-same">
                    Ese mismo día ({formatDateUTC(selected.time)}) la lista registra {plural(info.sameDate.length, "sismo más", "sismos más")}:{" "}
                    {info.sameDate.map((quake, index) => (
                      <span key={quake.id}>{index > 0 && ", "}<button type="button" className="hx-linkbtn" onClick={() => choose(quake.id)}>M {formatMag(quake.mag)}</button></span>
                    ))}.
                  </p>
                )}
                <div className="hx-actions">
                  <button type="button" className="hx-btn" onClick={() => step(-1)} disabled={navIndex <= 0 && navIndex !== -1} aria-label="Sismo anterior en el tiempo"><ChevronLeft aria-hidden="true" size={16} />Anterior</button>
                  <button type="button" className="hx-btn" onClick={() => step(1)} disabled={navIndex === windowed.length - 1} aria-label="Sismo siguiente en el tiempo">Siguiente<ChevronRight aria-hidden="true" size={16} /></button>
                  <button type="button" className="hx-btn" onClick={zoomToSelected}>Acercar en el mapa</button>
                  <button type="button" className="hx-btn" onClick={copyLink}><Link2 aria-hidden="true" size={16} />{copied ? "Enlace copiado" : "Copiar enlace"}</button>
                  {selected.url && <a className="hx-btn" href={selected.url} target="_blank" rel="noopener noreferrer">Ver en el USGS ↗</a>}
                  <button type="button" className="hx-btn" onClick={() => choose(null)}>Quitar</button>
                </div>
                <p className="hx-note">Distancias y años: calculados con las fechas y posiciones que publica el USGS. Las posiciones y magnitudes de los sismos antiguos son reconstrucciones del USGS y tienen más incertidumbre.</p>
              </>
            ) : (
              <>
                <p className="hx-empty">Elige un sismo en el mapa, en la línea de tiempo o en la tabla para ver su detalle y compararlo con el de {main ? yearOf(main.time) : "2026"}.</p>
                <div className="hx-actions">
                  {main && <button type="button" className="hx-btn hx-main" onClick={() => choose(main.id)}>El de {yearOf(main.time)} (M {formatMag(main.mag)})</button>}
                  {previousLargest && <button type="button" className="hx-btn" onClick={() => choose(previousLargest.id)}>El mayor antes de 2026 ({yearOf(previousLargest.time)}, M {formatMag(previousLargest.mag)})</button>}
                </div>
              </>
            )}
          </div>
        </div>
        <p className="sr-only" role="status">{announce}</p>
      </section>

      <section className="hs-card" aria-labelledby="hx-dec-h">
        <h2 id="hx-dec-h">Década por década</h2>
        <p className="hs-sub">Toca una década para ver solo esos años en el mapa, la línea de tiempo y la tabla. Toca otra vez para quitarla.</p>
        <ol className="hs-decades hx-decades">
          {decades.map(d => {
            const to = Math.min(d.decade + 9, last);
            const on = win[0] === d.decade && win[1] === to;
            return (
              <li key={d.decade}>
                <button type="button" className={`hx-dec${on ? " is-on" : ""}`} aria-pressed={on} onClick={() => pickDecade(d.decade)} disabled={d.count === 0 && !on}>
                  <span className="hs-dec-name">{d.decade}s</span>
                  <span className="hs-dec-bar" aria-hidden="true"><i className={d.decade === 2020 ? "hs-bar-now" : undefined} style={{ width: `${(d.count / maxDecade) * 100}%` }} /></span>
                  <span className="hs-dec-n">{d.count}<span className="sr-only"> {d.count === 1 ? "sismo" : "sismos"}</span></span>
                  <span className="hs-dec-max">{d.max ? `mayor M ${formatMag(d.max)}` : ""}</span>
                </button>
              </li>
            );
          })}
        </ol>
        <p className="hs-note">La década de 2020 llega solo hasta hoy. Las décadas antiguas dependen de qué tan completo es el registro histórico: el conteo no mide si hoy hay más o menos sismos.</p>
      </section>

      {topMap}

      <section className="hs-card" aria-labelledby="hx-table-h">
        <h2 id="hx-table-h">Todos los sismos de la lista</h2>
        <p className="hs-sub">{plural(windowed.length, "sismo", "sismos")} con la magnitud y los años elegidos. «Puesto» es el lugar por magnitud entre los {all.length}.</p>
        <div className="hx-group hx-sorts" role="group" aria-label="Ordenar la tabla">
          {([["mag", "Mayor magnitud"], ["new", "Más recientes"], ["old", "Más antiguos"]] as const).map(([value, label]) => (
            <button key={value} type="button" className="hx-chip" aria-pressed={sort === value} onClick={() => { setSort(value); setRows(ROWS_FIRST); }}>{label}</button>
          ))}
        </div>
        <div className="hs-scroll" role="region" aria-label="Tabla de sismos" tabIndex={0}>
          <table className="hs-table">
            <caption className="sr-only">Sismos de Panamá del catálogo del USGS, con el orden y los filtros elegidos</caption>
            <thead>
              <tr><th scope="col">Puesto</th><th scope="col">Magnitud</th><th scope="col">Fecha</th><th scope="col">Lugar</th><th scope="col">Profundidad</th></tr>
            </thead>
            <tbody>
              {sortedRows.slice(0, rows).map(quake => (
                <tr key={quake.id} className={`${quake.current ? "hs-row-now " : ""}${selected?.id === quake.id ? "is-selected" : ""}`}>
                  <td><span className={`hs-rank hs-${eraOf(quake)}`}>{ranks.get(quake.id)}</span></td>
                  <th scope="row">
                    <button type="button" className="hx-rowbtn" aria-pressed={selected?.id === quake.id} onClick={() => choose(quake.id)} aria-label={`Ver el sismo M ${formatMag(quake.mag)} del ${formatDateUTC(quake.time)}`}>
                      <strong>M {formatMag(quake.mag)}</strong>{kind(quake) && <small> {kind(quake)}</small>}
                    </button>
                  </th>
                  <td>{formatDateUTC(quake.time)}{quake.current && <span className="hs-badge">Secuencia actual</span>}</td>
                  <td>{placeEs(quake.place)}</td>
                  <td>{quake.depth === null ? "—" : `${Math.round(quake.depth)} km`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {sortedRows.length > rows && (
          <button type="button" className="hx-btn hx-more" onClick={() => setRows(count => count + ROWS_MORE)}>Mostrar más sismos · quedan {sortedRows.length - rows}</button>
        )}
        {sortedRows.length === 0 && <p className="hx-empty">Ningún sismo cumple esos filtros.</p>}
      </section>

      <section className="hs-card" aria-labelledby="hx-gaps-h">
        <h2 id="hx-gaps-h">Los sismos de M 7 o más, uno tras otro</h2>
        <p className="hs-sub">Los años son los cumplidos entre las fechas de dos sismos seguidos de la lista. Tocar uno lo abre arriba.</p>
        <ol className="hx-gaps">
          {gaps.map(({ quake, years }) => (
            <li key={quake.id}>
              {years !== null && <span className="hx-gap">{years < 1 ? "menos de 1 año" : plural(years, "año", "años")} después</span>}
              <button type="button" className={`hx-gapbtn hs-${eraOf(quake)}`} onClick={() => { choose(quake.id); document.getElementById("hx-explorer")?.scrollIntoView({ block: "start", behavior: "smooth" }); }}>
                <strong>{yearOf(quake.time)}</strong>
                <span>M {formatMag(quake.mag)}</span>
              </button>
            </li>
          ))}
        </ol>
        {gapYears.length > 0 && (
          <p className="hs-note">Los intervalos son muy irregulares (de {Math.min(...gapYears)} a {Math.max(...gapYears)} años en esta lista) y no sirven para predecir cuándo ocurrirá el próximo: los terremotos no se pueden pronosticar.</p>
        )}
      </section>
    </>
  );
}
