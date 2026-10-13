"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, Pause, Play, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { MINUTE, type Quake } from "../../lib/analytics";
import { TimelineChart, type TimelinePoint } from "./charts";
import { fmtFull, fmtInt } from "./format";
import { easeOutCubic, useReducedMotion } from "./motion";

// La línea de tiempo con sus controles: acercar, alejar y desplazar la ventana de tiempo (botones, arrastre y Ctrl + rueda) y
// reproducir la secuencia sismo a sismo. Todo trabaja con los sismos ya cargados; no se calcula ni se estima nada.

const MIN_SPAN = 5 * MINUTE;
const PLOT_INSET = 66; // margen izquierdo + eje vertical + margen derecho de la gráfica: lo que no es área de puntos
const PLOT_LEFT = 48;

export type Zoom = [number, number];

// La ventana que se pide, dentro del periodo completo y nunca más corta que MIN_SPAN. Si ya no cabe (cambió el periodo), se ve todo.
function clampZoom(zoom: Zoom | null, from: number, to: number): Zoom {
  if (!zoom) return [from, to];
  const full = to - from;
  const span = Math.min(Math.max(zoom[1] - zoom[0], Math.min(MIN_SPAN, full)), full);
  const start = Math.min(Math.max(zoom[0], from), to - span);
  return [start, start + span];
}

// En qué milisegundo de la reproducción aparece cada sismo: se parece al ritmo real (los huecos largos se notan) pero comprimido
// para que dure entre 5 y 18 segundos. Con cientos de sismos, uno cada pocas décimas de segundo.
function replaySchedule(list: TimelinePoint[]) {
  const gaps = list.map((point, i) => (i + 1 < list.length ? list[i + 1].time - point.time : 0));
  const largest = Math.max(1, ...gaps);
  const raw = gaps.map((gap) => 30 + 380 * Math.sqrt(gap / largest));
  const total = raw.reduce((sum, delay) => sum + delay, 0);
  const goal = Math.min(18_000, Math.max(5_000, list.length * 40));
  const scale = total > goal ? goal / total : 1;
  const at: number[] = [];
  let clock = 0;
  raw.forEach((delay, index) => {
    at[index] = clock;
    clock += Math.max(12, delay * scale);
  });
  return at;
}

type Replay = { list: TimelinePoint[]; shown: number };

export default function TimelinePanel({ points, from, to, zoom, onZoom, selectedId, onSelect, dimmed, freshIds }: {
  points: TimelinePoint[];
  from: number;
  to: number;
  zoom: Zoom | null;
  onZoom: (zoom: Zoom | null) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  dimmed?: (quake: Quake) => boolean;
  freshIds?: ReadonlySet<string>;
}) {
  const reduced = useReducedMotion();
  const target = clampZoom(zoom, from, to);
  const [target0, target1] = target;
  const fullSpan = Math.max(to - from, 1);
  const zoomed = target1 - target0 < fullSpan * 0.995;

  // ---- la ventana que se dibuja sigue a la que se pidió con una transición suave (o salta, con «Reducir animaciones») ----
  const [view, setView] = useState<Zoom>(target);
  const viewRef = useRef<Zoom>(view);
  const dragging = useRef(false);
  useEffect(() => {
    const start = viewRef.current;
    const total = reduced || dragging.current ? 0 : 380;
    const t0 = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = total === 0 ? 1 : Math.min(1, (now - t0) / total);
      const eased = easeOutCubic(progress);
      const next: Zoom = progress === 1 ? [target0, target1] : [start[0] + (target0 - start[0]) * eased, start[1] + (target1 - start[1]) * eased];
      viewRef.current = next;
      setView(next);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target0, target1, reduced]);

  // ---- acercar, alejar y desplazar ----
  const request = (a: number, b: number) => {
    const next = clampZoom([a, b], from, to);
    onZoom(next[1] - next[0] >= fullSpan * 0.995 ? null : next);
  };
  const zoomBy = (factor: number, anchor = 0.5) => {
    const span = target1 - target0;
    const nextSpan = Math.min(Math.max(span * factor, Math.min(MIN_SPAN, fullSpan)), fullSpan);
    const at = target0 + span * anchor;
    request(at - nextSpan * anchor, at + nextSpan * (1 - anchor));
  };
  const panBy = (fraction: number) => {
    const shift = (target1 - target0) * fraction;
    request(target0 + shift, target1 + shift);
  };

  const wrap = useRef<HTMLDivElement>(null);
  // Ctrl (o ⌘) + rueda, o el gesto de pellizco del panel táctil de una computadora: acerca hacia donde apunta el cursor.
  useEffect(() => {
    const element = wrap.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const plot = Math.max(1, rect.width - PLOT_INSET);
      const anchor = Math.min(1, Math.max(0, (event.clientX - rect.left - PLOT_LEFT) / plot));
      zoomBy(event.deltaY < 0 ? 0.8 : 1.25, anchor);
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  });

  // Arrastrar la gráfica la desplaza (solo cuando está acercada). Un arrastre no cuenta como un toque sobre un punto.
  const drag = useRef<{ x: number; a: number; b: number; moved: boolean } | null>(null);
  const suppress = useRef(false);
  const [panning, setPanning] = useState(false);
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!zoomed || (event.pointerType === "mouse" && event.button !== 0)) return;
    drag.current = { x: event.clientX, a: target0, b: target1, moved: false };
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current) return;
    const dx = event.clientX - current.x;
    if (!current.moved) {
      if (Math.abs(dx) < 5) return;
      current.moved = true;
      dragging.current = true;
      setPanning(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    const plot = Math.max(1, (wrap.current?.clientWidth ?? 600) - PLOT_INSET);
    const shift = (-dx / plot) * (current.b - current.a);
    request(current.a + shift, current.b + shift);
  };
  const endDrag = () => {
    if (drag.current?.moved) {
      suppress.current = true;
      window.setTimeout(() => { suppress.current = false; }, 0);
    }
    drag.current = null;
    dragging.current = false;
    setPanning(false);
  };

  // ---- reproducción: los sismos van apareciendo uno a uno, en el orden en que ocurrieron ----
  const [replay, setReplay] = useState<Replay | null>(null);
  const [playing, setPlaying] = useState(false);
  const [announce, setAnnounce] = useState("");
  const plan = useRef<{ list: TimelinePoint[]; at: number[] } | null>(null);
  // Cada sismo aparece en el instante que le toca según un reloj real, no «un temporizador por sismo»: si el navegador va lento
  // se muestran varios juntos y la reproducción dura lo mismo, en vez de alargarse.
  const raf = useRef(0);
  const hold = useRef(0); // espera de un momento al terminar, antes de volver a mostrar los datos en vivo
  const origin = useRef(0);
  const count = useRef(0);
  useEffect(() => {
    const frames = raf;
    const holding = hold;
    return () => {
      cancelAnimationFrame(frames.current);
      window.clearTimeout(holding.current);
    };
  }, []);

  const tick = (now: number) => {
    const current = plan.current;
    if (!current) return;
    const elapsed = now - origin.current;
    let shown = count.current;
    while (shown < current.list.length && current.at[shown] <= elapsed) shown += 1;
    if (shown !== count.current) {
      count.current = shown;
      setReplay({ list: current.list, shown });
    }
    if (shown >= current.list.length) {
      setPlaying(false);
      setAnnounce(`Reproducción terminada: ${current.list.length} sismos.`);
      hold.current = window.setTimeout(() => { setReplay(null); plan.current = null; }, 1600);
      return;
    }
    raf.current = requestAnimationFrame(tick);
  };
  // Desde el sismo `from` (0 = el principio): al seguir tras una pausa, el reloj se ajusta para continuar donde iba.
  const run = (from: number) => {
    cancelAnimationFrame(raf.current);
    const current = plan.current;
    if (!current) return;
    count.current = from;
    origin.current = performance.now() - (from > 0 ? current.at[from - 1] : 0);
    raf.current = requestAnimationFrame(tick);
  };
  const startReplay = () => {
    window.clearTimeout(hold.current);
    const list = points.filter((point) => point.time >= target0 && point.time <= target1).sort((a, b) => a.time - b.time);
    if (list.length < 2) return;
    plan.current = { list, at: replaySchedule(list) };
    setAnnounce(`Reproducción iniciada: ${list.length} sismos.`);
    setPlaying(true);
    setReplay({ list, shown: 0 });
    run(0);
  };
  const pauseReplay = () => {
    cancelAnimationFrame(raf.current);
    setPlaying(false);
  };
  const resumeReplay = () => {
    if (!replay) return;
    setPlaying(true);
    run(replay.shown);
  };
  const stopReplay = () => {
    cancelAnimationFrame(raf.current);
    window.clearTimeout(hold.current);
    plan.current = null;
    setPlaying(false);
    setReplay(null);
    setAnnounce("Reproducción detenida.");
  };

  // ---- pantalla completa: la del navegador si la permite y, si no (iPhone y navegadores integrados), la línea de tiempo se
  // amplía sobre toda la página. Es la misma idea que la del mapa (quake-map.tsx). Todo lo demás (zoom, reproducción, selección)
  // sigue funcionando igual porque es el mismo componente, solo con más espacio. ----
  const root = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState<"off" | "native" | "overlay">("off");
  const full = fullscreen !== "off";
  useEffect(() => {
    const update = () => {
      const active = document.fullscreenElement !== null && document.fullscreenElement === root.current;
      setFullscreen((mode) => (active ? "native" : mode === "native" ? "off" : mode));
    };
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);
  const toggleFullscreen = async () => {
    const frame = root.current;
    if (!frame) return;
    try {
      if (document.fullscreenElement === frame) {
        await document.exitFullscreen();
      } else if (fullscreen === "overlay") {
        setFullscreen("off");
      } else {
        if (!frame.requestFullscreen) throw new Error("Fullscreen unavailable");
        // Algunos navegadores integrados dejan la promesa sin resolver: se espera un instante y, si no se logró, se usa el respaldo.
        await Promise.race([frame.requestFullscreen(), new Promise((_, reject) => window.setTimeout(() => reject(new Error("timeout")), 900))]);
        if (document.fullscreenElement !== frame) throw new Error("Fullscreen not granted");
      }
    } catch {
      setFullscreen((mode) => (mode === "off" ? "overlay" : "off"));
    }
  };
  // Mientras está abierta: la página de abajo no se desplaza, Escape cierra el respaldo (la del navegador la cierra el propio
  // navegador) y Tab no sale de la línea de tiempo hacia lo que queda tapado.
  useEffect(() => {
    if (!full) return;
    const frame = root.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setFullscreen((mode) => (mode === "overlay" ? "off" : mode));
        return;
      }
      if (event.key !== "Tab" || !frame) return;
      const items = [...frame.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])')].filter(
        (item) => !(item as HTMLButtonElement).disabled && item.getClientRects().length > 0,
      );
      const first = items[0];
      const end = items[items.length - 1];
      if (!first || !end) return;
      const inside = document.activeElement instanceof Node && frame.contains(document.activeElement);
      if (!inside || (event.shiftKey && document.activeElement === first)) {
        event.preventDefault();
        (inside ? end : first).focus();
      } else if (!event.shiftKey && document.activeElement === end) {
        event.preventDefault();
        first.focus();
      }
    };
    const previous = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.documentElement.style.overflow = previous;
      document.removeEventListener("keydown", onKeyDown);
      if ((document.activeElement === document.body || document.activeElement === null) && opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [full]);

  const drawn = replay ? replay.list.slice(0, replay.shown) : points;
  const last = replay && replay.shown > 0 ? replay.list[replay.shown - 1] : null;
  const magRange = useMemo<[number, number]>(() => {
    const mags = points.map((point) => point.mag);
    return mags.length ? [Math.min(...mags), Math.max(...mags)] : [0, 1];
  }, [points]);
  const inWindow = useMemo(() => points.filter((point) => point.time >= target0 && point.time <= target1).length, [points, target0, target1]);

  const picked = full && selectedId ? points.find((point) => point.id === selectedId) : undefined;

  return (
    <div ref={root} className={`an-timeline${full ? " is-full" : ""}`}
      {...(fullscreen === "overlay" ? { role: "dialog", "aria-modal": true, "aria-label": "Línea de tiempo en pantalla completa" } : {})}>
      <div className="an-toolbar" role="toolbar" aria-label="Controles de la línea de tiempo">
        {full && <strong className="an-full-title">Línea de tiempo</strong>}
        <div className="an-tools" role="group" aria-label="Acercar y desplazar">
          <button type="button" className="an-tool" onClick={() => zoomBy(0.5)} disabled={target1 - target0 <= MIN_SPAN} aria-label="Acercar"><ZoomIn aria-hidden="true" size={18} /><span>Acercar</span></button>
          <button type="button" className="an-tool" onClick={() => zoomBy(2)} disabled={!zoomed} aria-label="Alejar"><ZoomOut aria-hidden="true" size={18} /><span>Alejar</span></button>
          <button type="button" className="an-tool" onClick={() => panBy(-0.35)} disabled={!zoomed || target0 <= from} aria-label="Ir hacia atrás en el tiempo"><ChevronLeft aria-hidden="true" size={18} /></button>
          <button type="button" className="an-tool" onClick={() => panBy(0.35)} disabled={!zoomed || target1 >= to} aria-label="Ir hacia adelante en el tiempo"><ChevronRight aria-hidden="true" size={18} /></button>
          <button type="button" className="an-tool" onClick={() => onZoom(null)} disabled={!zoomed}>Ver todo</button>
        </div>
        <div className="an-tools" role="group" aria-label="Reproducción">
          {!replay ? (
            <button type="button" className="an-tool an-tool-main" onClick={startReplay} disabled={inWindow < 2}><Play aria-hidden="true" size={18} /><span>Reproducir secuencia</span></button>
          ) : (
            <>
              {playing
                ? <button type="button" className="an-tool an-tool-main" onClick={pauseReplay}><Pause aria-hidden="true" size={18} /><span>Pausar</span></button>
                : <button type="button" className="an-tool an-tool-main" onClick={replay.shown >= replay.list.length ? startReplay : resumeReplay}><Play aria-hidden="true" size={18} /><span>{replay.shown >= replay.list.length ? "Volver a ver" : "Seguir"}</span></button>}
              <button type="button" className="an-tool" onClick={startReplay} aria-label="Reiniciar la reproducción"><RotateCcw aria-hidden="true" size={18} /></button>
              <button type="button" className="an-tool" onClick={stopReplay}>Detener</button>
            </>
          )}
        </div>
        <div className="an-tools" role="group" aria-label="Vista">
          <button type="button" className="an-tool" onClick={toggleFullscreen} aria-label={full ? "Salir de la pantalla completa" : "Ver la línea de tiempo en pantalla completa"}>
            {full ? <Minimize2 aria-hidden="true" size={18} /> : <Maximize2 aria-hidden="true" size={18} />}<span>{full ? "Salir de pantalla completa" : "Pantalla completa"}</span>
          </button>
        </div>
        {/* Durante la reproducción cambia a cada sismo: no se anuncia (solo el inicio y el final, en la región de abajo). */}
        <p className="an-window" role={replay ? undefined : "status"}>
          {replay
            ? `Reproduciendo: ${fmtInt.format(replay.shown)} de ${fmtInt.format(replay.list.length)} sismos`
            : zoomed
              ? `${fmtFull.format(target0)} – ${fmtFull.format(target1)} · ${fmtInt.format(inWindow)} ${inWindow === 1 ? "sismo" : "sismos"} en esta ventana`
              : "Ctrl + rueda, o los botones, para acercar un tramo"}
        </p>
      </div>

      <div ref={wrap} className={`an-tl-wrap${zoomed ? " is-zoomed" : ""}${panning ? " is-panning" : ""}`}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag}
        onClickCapture={(event) => { if (suppress.current) { event.stopPropagation(); event.preventDefault(); } }}>
        <TimelineChart points={drawn} domain={view} magRange={magRange} selectedId={selectedId} onSelect={onSelect} dimmed={dimmed} freshIds={freshIds} rippleId={last?.id ?? null} fill={full} />
        {last && (
          <div className="an-replay-read" aria-hidden="true">
            <b>M {last.mag.toFixed(1)}</b>
            <span>{last.place}</span>
            <small>{fmtFull.format(last.time)}</small>
          </div>
        )}
      </div>
      {picked && (
        <div className="an-full-detail" role="region" aria-label="Sismo seleccionado">
          <b>M {picked.mag.toFixed(1)}</b>
          <span>{picked.place}</span>
          <small>{fmtFull.format(picked.time)} · prof. {picked.depth === null ? "—" : `${Math.round(picked.depth)} km`} · {picked.source.toUpperCase()}</small>
        </div>
      )}
      <p className="an-sr" aria-live="polite">{announce}</p>
      <p className="an-sr" role="status">{full ? "Línea de tiempo en pantalla completa. Pulsa Escape para salir." : ""}</p>
    </div>
  );
}
