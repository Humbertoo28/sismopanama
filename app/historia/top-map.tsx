"use client";

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PANAMA_RINGS } from "../../lib/panama";
import { eraOf, formatDateUTC, formatMag, placeEs, type HistoricQuake } from "../../lib/history";
import { revealNearest, showExplorer, writeSelection } from "./selection";
import { SAT_CREDIT, SatTiles } from "./sat-tiles";
import "./top-map.css";

// Mapa aparte solo con los 12 sismos más grandes, cada uno con su número de la tabla. Varios caen casi en el mismo punto, al
// suroeste (zona de Burica): sus números se taparían, así que ese grupo se muestra además en un acercamiento. Es interactivo: tocar
// (o con el teclado, Enter) un número abre la ficha de ese sismo debajo del mapa, con los mismos datos del catálogo del USGS que el
// resto de la página; las flechas pasan de un puesto al siguiente y «Ver ficha completa» lo elige en el explorador de arriba.
type Bounds = { minLng: number; maxLng: number; minLat: number; maxLat: number };

const MAIN: Bounds = { minLng: -83.8, maxLng: -77, minLat: 6, maxLat: 10.7 };
const MAIN_W = 760;
const INSET_W = 460;
// Radio de un número medido como en celular (donde el SVG se reduce y el CSS agranda los números): dos números a menos de
// 2·radio más un margen se taparían.
const PIN_R = 26;
const CLUSTER_GAP = PIN_R * 2 + 8;

function frame(bounds: Bounds, width: number) {
  const H = Math.round((width * (bounds.maxLat - bounds.minLat)) / (bounds.maxLng - bounds.minLng));
  return {
    W: width,
    H,
    x: (lng: number) => ((lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * width,
    y: (lat: number) => ((bounds.maxLat - lat) / (bounds.maxLat - bounds.minLat)) * H,
  };
}
type Frame = ReturnType<typeof frame>;

const rankTitle = (rank: number, quake: HistoricQuake) =>
  `Puesto ${rank} · M ${formatMag(quake.mag)} · ${formatDateUTC(quake.time)} · ${placeEs(quake.place)}`;

// Los mayores que se taparían en el mapa general: componentes de cercanía entre números; se toma el grupo más grande si tiene
// al menos 3.
function crowdedGroup(top: HistoricQuake[], f: Frame): number[] {
  const parent = top.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < top.length; i++) {
    for (let j = i + 1; j < top.length; j++) {
      const d = Math.hypot(f.x(top[i].lng) - f.x(top[j].lng), f.y(top[i].lat) - f.y(top[j].lat));
      if (d < CLUSTER_GAP) parent[find(i)] = find(j);
    }
  }
  const groups = new Map<number, number[]>();
  top.forEach((_, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), i]));
  const biggest = [...groups.values()].sort((a, b) => b.length - a.length)[0] ?? [];
  return biggest.length >= 3 ? biggest : [];
}

// Separa los números que, aun con el acercamiento, quedarían tocándose; el punto verdadero se conserva con una línea.
function spread(points: { x: number; y: number }[], minDistance: number) {
  const out = points.map(p => ({ ...p }));
  for (let pass = 0; pass < 24; pass++) {
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const dx = out[j].x - out[i].x;
        const dy = out[j].y - out[i].y;
        const d = Math.hypot(dx, dy) || 0.01;
        if (d < minDistance) {
          const push = (minDistance - d) / 2;
          out[i].x -= (dx / d) * push;
          out[i].y -= (dy / d) * push;
          out[j].x += (dx / d) * push;
          out[j].y += (dy / d) * push;
        }
      }
    }
  }
  return out;
}

const landPath = (f: Frame) =>
  PANAMA_RINGS.map(ring => `M${ring.map(([lng, lat]) => `${f.x(lng).toFixed(1)},${f.y(lat).toFixed(1)}`).join("L")}Z`).join("");

function Grid({ f, lngs, lats }: { f: Frame; lngs: number[]; lats: number[] }) {
  return (
    <g className="hs-grid" aria-hidden="true">
      {lngs.map(l => (
        <g key={`lng${l}`}>
          <line x1={f.x(l)} x2={f.x(l)} y1="0" y2={f.H} />
          <text x={f.x(l) + 4} y={f.H - 8}>{`${Math.abs(l)}° O`}</text>
        </g>
      ))}
      {lats.map(l => (
        <g key={`lat${l}`}>
          <line x1="0" x2={f.W} y1={f.y(l)} y2={f.y(l)} />
          <text x="8" y={f.y(l) - 5}>{`${l}° N`}</text>
        </g>
      ))}
    </g>
  );
}

function Pin({ x, y, rank, quake, size, picked, onPick }: { x: number; y: number; rank: number; quake: HistoricQuake; size: "main" | "inset"; picked: boolean; onPick: (id: string, reveal: boolean) => void }) {
  const title = rankTitle(rank, quake);
  return (
    <g
      className={`hs-pin hs-pin-${size} hs-${eraOf(quake)}${picked ? " is-picked" : ""}`}
      style={{ "--i": rank } as CSSProperties}
      role="button"
      tabIndex={0}
      aria-pressed={picked}
      aria-label={title}
      data-rank={rank}
      onClick={() => onPick(quake.id, true)}
      onKeyDown={event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onPick(quake.id, false);
        }
      }}
    >
      <title>{title}</title>
      <circle className="hs-hit" cx={x} cy={y} r="22" />
      <circle cx={x} cy={y} r={size === "main" ? 14 : 16} />
      <text x={x} y={y} textAnchor="middle" dominantBaseline="central">{rank}</text>
    </g>
  );
}

// Marcas de cada medio grado que caen dentro del recuadro del acercamiento.
const halfDegrees = (min: number, max: number) => {
  const ticks: number[] = [];
  for (let value = Math.ceil(min * 2) / 2; value < max; value += 0.5) if (value > min) ticks.push(value);
  return ticks;
};

const kind = (quake: HistoricQuake) => (quake.magType ? quake.magType.charAt(0).toUpperCase() + quake.magType.slice(1).toLowerCase() : "");
const clock = (time: number) => new Date(time).toISOString().slice(11, 16);

export default function TopMap({ top, total, provinceTexts }: { top: HistoricQuake[]; total: number; provinceTexts: Record<string, string> }) {
  const root = useRef<HTMLDivElement>(null);
  const [satellite, setSatellite] = useState(false);
  // El ancho en pantalla de cada mapa decide cuánto detalle de imagen satelital se pide (el acercamiento pide más que el general).
  const mainSvg = useRef<SVGSVGElement>(null);
  const insetSvg = useRef<SVGSVGElement>(null);
  const [mainPx, setMainPx] = useState(700);
  const [insetPx, setInsetPx] = useState(460);
  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        if (entry.target === mainSvg.current) setMainPx(entry.contentRect.width || 700);
        else if (entry.target === insetSvg.current) setInsetPx(entry.contentRect.width || 460);
      }
    });
    if (mainSvg.current) observer.observe(mainSvg.current);
    if (insetSvg.current) observer.observe(insetSvg.current);
    return () => observer.disconnect();
  }, [satellite]);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const pickedIndex = top.findIndex(quake => quake.id === pickedId);
  const picked = pickedIndex >= 0 ? top[pickedIndex] : null;
  const card = useRef<HTMLDivElement>(null);
  // Tocar el mismo número otra vez cierra la ficha. Al tocar con el dedo o el ratón, la ficha (que queda debajo de los mapas) se
  // muestra si no se veía; con el teclado no se mueve la página, el foco ya está en el número.
  const pick = (id: string, reveal: boolean) => {
    setPickedId(current => (current === id ? null : id));
    if (reveal) window.setTimeout(() => revealNearest(card.current), 30);
  };
  // Pasa al puesto indicado (1 a 12); con el teclado, además, pasa el foco a ese número.
  const goTo = (rank: number, focus: boolean) => {
    const next = top[Math.min(top.length, Math.max(1, rank)) - 1];
    if (!next) return;
    setPickedId(next.id);
    if (focus) root.current?.querySelector<SVGElement>(`[data-rank="${Math.min(top.length, Math.max(1, rank))}"]`)?.focus();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = Number((event.target as Element).closest?.("[data-rank]")?.getAttribute("data-rank"));
    if (!current) return;
    const next = event.key === "ArrowRight" || event.key === "ArrowDown" ? current + 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? current - 1 : event.key === "Home" ? 1 : event.key === "End" ? top.length : null;
    if (next === null) return;
    event.preventDefault();
    goTo(next, true);
  };
  const openInExplorer = (id: string) => {
    writeSelection(id);
    showExplorer();
  };

  const main = frame(MAIN, MAIN_W);
  const crowded = crowdedGroup(top, main);
  const inGroup = new Set(crowded);
  const groupRanks = crowded.map(i => i + 1).sort((a, b) => a - b);

  let bounds: Bounds | null = null;
  if (crowded.length) {
    const members = crowded.map(i => top[i]);
    const pad = 0.3;
    bounds = {
      minLng: Math.min(...members.map(q => q.lng)) - pad,
      maxLng: Math.max(...members.map(q => q.lng)) + pad,
      minLat: Math.min(...members.map(q => q.lat)) - pad,
      maxLat: Math.max(...members.map(q => q.lat)) + pad,
    };
  }
  const inset = bounds ? frame(bounds, INSET_W) : null;
  const members = crowded.map(i => ({ rank: i + 1, quake: top[i] }));
  const positions = inset ? spread(members.map(m => ({ x: inset.x(m.quake.lng), y: inset.y(m.quake.lat) })), 44) : [];
  const box = bounds && { x: main.x(bounds.minLng), y: main.y(bounds.maxLat), w: main.x(bounds.maxLng) - main.x(bounds.minLng), h: main.y(bounds.minLat) - main.y(bounds.maxLat) };
  const description = top.map((q, i) => `${i + 1}.º, M ${formatMag(q.mag)}, ${formatDateUTC(q.time)}, ${placeEs(q.place)}`).join("; ");

  return (
    <div ref={root} onKeyDown={onKeyDown}>
    <div className="hx-group tm-view" role="group" aria-label="Vista del mapa de los 12 más grandes">
      <span className="hx-label">Vista</span>
      <button type="button" className="hx-chip" aria-pressed={!satellite} onClick={() => setSatellite(false)}>Plano</button>
      <button type="button" className="hx-chip" aria-pressed={satellite} aria-label="Imagen satelital" onClick={() => setSatellite(true)}>Satélite</button>
    </div>
    <div className={`hs-figure${inset ? " hs-has-inset" : ""}${satellite ? " tm-sat" : ""}`}>
      <figure className="hs-fig-main">
        <svg ref={mainSvg} className="hs-map" viewBox={`0 0 ${main.W} ${main.H}`} role="group" aria-labelledby="hs-top-title hs-top-desc">
          <title id="hs-top-title">Mapa de los 12 sismos más grandes de Panamá desde 1900</title>
          <desc id="hs-top-desc">{`Cada número es el puesto del sismo en la tabla. ${description}.`}</desc>
          <rect className="hs-sea" width={main.W} height={main.H} rx="14" />
          {satellite && <SatTiles bounds={MAIN} width={main.W} height={main.H} vx={0} vy={0} vw={main.W} vh={main.H} pxWidth={mainPx} />}
          <Grid f={main} lngs={[-83, -82, -81, -80, -79, -78]} lats={[7, 8, 9, 10]} />
          <path className="hs-land" d={landPath(main)} />
          {box && (
            <g className="hs-group" aria-hidden="true">
              <rect x={box.x} y={box.y} width={box.w} height={box.h} rx="8" />
              <text x={box.x + box.w / 2} y={box.y - 8} textAnchor="middle">{groupRanks.join(" · ")}</text>
              <text className="hs-group-hint" x={box.x + box.w / 2} y={box.y + box.h + 19} textAnchor="middle">ver acercamiento</text>
            </g>
          )}
          <g>
            {top.map((q, i) => (inGroup.has(i) ? null : <Pin key={q.id} x={main.x(q.lng)} y={main.y(q.lat)} rank={i + 1} quake={q} size="main" picked={q.id === pickedId} onPick={pick} />))}
          </g>
        </svg>
      </figure>

      {inset && bounds && (
        <figure className="hs-fig-inset">
          <svg ref={insetSvg} className="hs-map" viewBox={`0 0 ${inset.W} ${inset.H}`} role="group" aria-labelledby="hs-inset-title">
            <title id="hs-inset-title">{`Acercamiento al suroeste: puestos ${groupRanks.join(", ")}`}</title>
            <rect className="hs-sea" width={inset.W} height={inset.H} rx="14" />
            {satellite && <SatTiles bounds={bounds} width={inset.W} height={inset.H} vx={0} vy={0} vw={inset.W} vh={inset.H} pxWidth={insetPx} />}
            <Grid f={inset} lngs={halfDegrees(bounds.minLng, bounds.maxLng)} lats={halfDegrees(bounds.minLat, bounds.maxLat)} />
            {/* De cerca, el contorno simplificado del país no coincide con la costa de la imagen: sobre el satélite se omite. */}
            {!satellite && <path className="hs-land" d={landPath(inset)} />}
            <g>
              {members.map((m, i) => {
                const trueX = inset.x(m.quake.lng);
                const trueY = inset.y(m.quake.lat);
                const moved = Math.hypot(positions[i].x - trueX, positions[i].y - trueY) > 2;
                return (
                  <g key={m.quake.id}>
                    {moved && <line className="hs-leader" x1={trueX} y1={trueY} x2={positions[i].x} y2={positions[i].y} />}
                    {moved && <circle className="hs-truepoint" cx={trueX} cy={trueY} r="3" />}
                    <Pin x={positions[i].x} y={positions[i].y} rank={m.rank} quake={m.quake} size="inset" picked={m.quake.id === pickedId} onPick={pick} />
                  </g>
                );
              })}
            </g>
          </svg>
          <figcaption>Acercamiento al suroeste (zona de Burica): puestos {groupRanks.join(", ")}.</figcaption>
        </figure>
      )}
    </div>

    {satellite && <p className="tm-credit">{SAT_CREDIT}</p>}
    <p className="tm-hint">Toca un número para ver ese sismo. Con el teclado, Tab llega al mapa y las flechas pasan de un puesto a otro.</p>
    <div className="tm-card" ref={card} role="status" aria-live="polite">
      {picked ? (
        <>
          <div className="tm-head">
            <span className={`tm-rank hs-${eraOf(picked)}`} aria-hidden="true">{pickedIndex + 1}</span>
            <div>
              <strong className="tm-mag">M {formatMag(picked.mag)}{kind(picked) && <small> {kind(picked)}</small>}</strong>
              <span className="tm-when">{formatDateUTC(picked.time)} · {clock(picked.time)} UTC</span>
            </div>
          </div>
          <p className="tm-place">{placeEs(picked.place)}</p>
          <dl className="hx-facts tm-facts">
            <div><dt>Puesto por magnitud</dt><dd>{pickedIndex + 1} de {total}</dd></div>
            <div><dt>Profundidad</dt><dd>{picked.depth === null ? "sin dato" : `${Math.round(picked.depth)} km`}</dd></div>
            <div><dt>Provincia o comarca</dt><dd>{provinceTexts[picked.id] ?? "sin dato"}</dd></div>
          </dl>
          <div className="tm-actions">
            <button type="button" className="hx-btn" onClick={() => goTo(pickedIndex, false)} disabled={pickedIndex === 0}><ChevronLeft size={16} aria-hidden="true" />Puesto anterior</button>
            <button type="button" className="hx-btn" onClick={() => goTo(pickedIndex + 2, false)} disabled={pickedIndex === top.length - 1}>Puesto siguiente<ChevronRight size={16} aria-hidden="true" /></button>
            <button type="button" className="hx-btn hx-main" onClick={() => openInExplorer(picked.id)}>Ver ficha completa ↑</button>
          </div>
        </>
      ) : (
        <p className="tm-empty">Ningún sismo elegido.</p>
      )}
    </div>
    </div>
  );
}
