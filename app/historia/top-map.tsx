"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PANAMA_RINGS } from "../../lib/panama";
import { eraOf, formatDateUTC, formatMag, placeEs, type HistoricQuake } from "../../lib/history";
import type { WaveData } from "../../lib/usgs-detail";
import { revealNearest, showExplorer, writeSelection } from "./selection";
import { SAT_CREDIT, SatTiles } from "./sat-tiles";
import { toEarthquake } from "./adapter";
import { PlaceFilterControls, PlaceFilterNote, usePlaceFilter } from "./place-filter";
import type { PlaceIndex } from "./place-index";
import "./top-map.css";

// Mapa aparte solo con los 12 sismos más grandes, cada uno con su número de la tabla. Varios caen casi en el mismo punto, al
// suroeste (zona de Burica): sus números se taparían, así que ese grupo se muestra además en un acercamiento. Es interactivo: tocar
// (o con el teclado, Enter) un número abre la ficha de ese sismo debajo del mapa, con los mismos datos del catálogo del USGS que el
// resto de la página; las flechas pasan de un puesto al siguiente y «Ver ficha completa» lo elige en el explorador de arriba. Se puede ver
// en plano, sobre la imagen satelital o en 3D; en 3D, además, se ve cómo se propagó la sacudida de cada uno (ver más abajo), y se
// puede filtrar por la provincia y la ciudad del sismo (las mismas reglas del filtro del mapa en vivo).
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

type Mode = "plan" | "sat" | "3d";
const MODES: { value: Mode; label: string; long: string }[] = [
  { value: "plan", label: "Plano", long: "Mapa plano" },
  { value: "sat", label: "Satélite", long: "Imagen satelital" },
  { value: "3d", label: "3D", long: "Vista en 3D" },
];

// La sacudida de cada sismo, tal como la publica el USGS: se pide al servidor solo cuando se elige un sismo en la vista 3D.
type WaveState = { status: "loading" } | { status: "ready"; data: WaveData } | { status: "none" } | { status: "error" };

export default function TopMap({ top, total, provinceTexts, placeIndex }: { top: HistoricQuake[]; total: number; provinceTexts: Record<string, string>; placeIndex: PlaceIndex }) {
  const root = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<Mode>("plan");
  const satellite = mode === "sat";
  const [three, setThree] = useState<{ Scene: typeof import("../quake-3d").default } | null>(null);
  const [threeFailed, setThreeFailed] = useState(false);
  const [full, setFull] = useState(false);
  const [layers, setLayers] = useState({ plates: false, faults: false });
  const [waves, setWaves] = useState<Record<string, WaveState>>({});
  // true = la escena 3D arranca sola la animación de la sacudida (se pidió «Ver su onda en 3D»).
  const [autoWave, setAutoWave] = useState(false);
  const loadThree = () => {
    setThreeFailed(false);
    import("../quake-3d").then(module => setThree({ Scene: module.default })).catch(() => setThreeFailed(true));
  };
  const chooseMode = (next: Mode, auto = false) => {
    setMode(next);
    setAutoWave(auto && next === "3d");
    setFull(false);
    if (next === "3d" && !three) loadThree();
    if (next === "3d" && pickedId) ensureWave(pickedId);
  };
  // Con la escena 3D ampliada sobre la página: Escape la cierra y la página de abajo no se desplaza.
  useEffect(() => {
    if (!full) return;
    const onKey = (event: globalThis.KeyboardEvent) => event.key === "Escape" && setFull(false);
    const previous = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.documentElement.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [full]);

  // Filtros por provincia y ciudad (los mismos del explorador de los 94 sismos). Las opciones salen de los propios 12.
  const rows = useMemo(() => top.map((quake, index) => ({ quake, rank: index + 1 })), [top]);
  const ids = useMemo(() => top.map(quake => quake.id), [top]);
  const place = usePlaceFilter(ids, placeIndex);
  const placeMatches = place.matches;
  const visible = useMemo(() => rows.filter(row => placeMatches(row.quake.id)), [rows, placeMatches]);
  const visibleQuakes = useMemo(() => visible.map(row => row.quake), [visible]);
  const filtersKey = place.key;

  const [pickedId, setPickedId] = useState<string | null>(null);
  const visibleIndex = visible.findIndex(row => row.quake.id === pickedId);
  const picked = visibleIndex >= 0 ? visible[visibleIndex].quake : null;
  const pickedRank = visibleIndex >= 0 ? visible[visibleIndex].rank : 0;
  const card = useRef<HTMLDivElement>(null);
  // Tocar el mismo número otra vez cierra la ficha. Al tocar con el dedo o el ratón, la ficha (que queda debajo de los mapas) se
  // muestra si no se veía; con el teclado no se mueve la página, el foco ya está en el número.
  const pick = (id: string, reveal: boolean) => {
    // (la sacudida se pide al elegir en 3D; el estado de «elegido» alterna con el mismo número, y la sacudida solo se pide al elegirlo)
    if (id !== pickedId && mode === "3d") ensureWave(id);
    setPickedId(current => (current === id ? null : id));
    if (reveal) window.setTimeout(() => revealNearest(card.current), 30);
  };
  // Pasa al sismo que está `offset` lugares más allá entre los que se ven (en orden de puesto); con el teclado, además, pasa el foco a su número.
  const goBy = (from: number, offset: number, focus: boolean) => {
    const target = visible[Math.min(visible.length - 1, Math.max(0, from + offset))];
    if (!target) return;
    if (mode === "3d") ensureWave(target.quake.id);
    setPickedId(target.quake.id);
    if (focus) root.current?.querySelector<SVGElement>(`[data-rank="${target.rank}"]`)?.focus();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const rank = Number((event.target as Element).closest?.("[data-rank]")?.getAttribute("data-rank"));
    const from = visible.findIndex(row => row.rank === rank);
    if (!rank || from < 0) return;
    const to = event.key === "ArrowRight" || event.key === "ArrowDown" ? from + 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? from - 1 : event.key === "Home" ? 0 : event.key === "End" ? visible.length - 1 : null;
    if (to === null) return;
    event.preventDefault();
    goBy(to, 0, true);
  };
  const openInExplorer = (id: string) => {
    writeSelection(id);
    showExplorer();
  };

  // La sacudida del sismo elegido: se pide al elegirlo en la vista 3D (o al pedir ver su onda) y se guarda; cada sismo se pide una sola vez.
  const requested = useRef(new Set<string>());
  const fetchWave = (id: string) => {
    requested.current.add(id);
    setWaves(current => ({ ...current, [id]: { status: "loading" } }));
    fetch(`/api/historia/sacudida/${id}`)
      .then(response => (response.ok ? (response.json() as Promise<WaveData>) : Promise.reject(new Error(String(response.status)))))
      .then(data => setWaves(current => ({ ...current, [id]: data.shakeGrid ? { status: "ready", data } : { status: "none" } })))
      .catch(() => {
        requested.current.delete(id);
        setWaves(current => ({ ...current, [id]: { status: "error" } }));
      });
  };
  const ensureWave = (id: string) => {
    if (!requested.current.has(id)) fetchWave(id);
  };
  const wave = picked ? waves[picked.id] : undefined;
  const waveData = wave?.status === "ready" ? wave.data : null;
  // Sin modelo de falla del USGS (todos menos el de 2026), la onda se calcula desde el hipocentro publicado.
  const pointSource = useMemo(
    () => (picked && waveData && !waveData.fault && picked.depth !== null ? { lng: picked.lng, lat: picked.lat, depth: picked.depth } : null),
    [picked, waveData],
  );
  const events3d = useMemo(() => visibleQuakes.map(quake => toEarthquake(quake)), [visibleQuakes]);
  const main3d = useMemo(() => (picked ? toEarthquake(picked) : null), [picked]);
  const viewWave = () => {
    if (!picked) return;
    chooseMode("3d", true);
  };

  const [mainPx, setMainPx] = useState(700);
  const [insetPx, setInsetPx] = useState(460);
  // El ancho en pantalla de cada mapa decide cuánto detalle de imagen satelital se pide (el acercamiento pide más que el general).
  const mainSvg = useRef<SVGSVGElement>(null);
  const insetSvg = useRef<SVGSVGElement>(null);
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
  }, [mode, filtersKey]);

  const main = frame(MAIN, MAIN_W);
  const crowded = crowdedGroup(visibleQuakes, main);
  const inGroup = new Set(crowded);
  const groupRanks = crowded.map(i => visible[i].rank).sort((a, b) => a - b);

  let bounds: Bounds | null = null;
  if (crowded.length) {
    const members = crowded.map(i => visibleQuakes[i]);
    const pad = 0.3;
    bounds = {
      minLng: Math.min(...members.map(q => q.lng)) - pad,
      maxLng: Math.max(...members.map(q => q.lng)) + pad,
      minLat: Math.min(...members.map(q => q.lat)) - pad,
      maxLat: Math.max(...members.map(q => q.lat)) + pad,
    };
  }
  const inset = bounds ? frame(bounds, INSET_W) : null;
  const members = crowded.map(i => ({ rank: visible[i].rank, quake: visibleQuakes[i] }));
  const positions = inset ? spread(members.map(m => ({ x: inset.x(m.quake.lng), y: inset.y(m.quake.lat) })), 44) : [];
  const box = bounds && { x: main.x(bounds.minLng), y: main.y(bounds.maxLat), w: main.x(bounds.maxLng) - main.x(bounds.minLng), h: main.y(bounds.minLat) - main.y(bounds.maxLat) };
  const description = visible.map(row => `${row.rank}.º, M ${formatMag(row.quake.mag)}, ${formatDateUTC(row.quake.time)}, ${placeEs(row.quake.place)}`).join("; ");
  const pickedCity = picked ? placeIndex.cities[placeIndex.quakes[picked.id]?.[1] ?? ""] : undefined;

  return (
    <div ref={root} onKeyDown={onKeyDown}>
      <div className="hx-controls tm-controls">
        <div className="hx-group tm-view" role="group" aria-label="Vista del mapa de los 12 más grandes">
          <span className="hx-label">Vista</span>
          {MODES.map(item => (
            <button key={item.value} type="button" className="hx-chip" aria-pressed={mode === item.value} aria-label={item.long} onClick={() => chooseMode(item.value)}>{item.label}</button>
          ))}
        </div>
        <PlaceFilterControls filter={place} />
      </div>
      <p className="tm-count" role="status">{place.filtered ? `Se ven ${visible.length} de los ${rows.length} sismos más grandes (${place.label}).` : `Se ven los ${rows.length} sismos más grandes.`}</p>
      <PlaceFilterNote />

      {mode === "3d" ? (
        <div className={`map-frame hx-3d${full ? " is-full" : ""}`}>
          {three ? (
            <three.Scene
              events={events3d} filtersKey={filtersKey} fitKey={0} restartKey={0} autoPlay={autoWave} expanded={full} overlay={full} onToggleExpanded={() => setFull(value => !value)}
              mainshock={main3d} mainLabel="El elegido" aftershockToggle={false} selectedId={picked?.id ?? null} replay={null} region={null}
              fault={waveData?.fault ?? null} felt={null} shaking={null} plates={layers.plates} activeFaults={layers.faults}
              wave={waveData !== null} shakeGrid={waveData?.shakeGrid ?? null} mechanism={waveData?.mechanism ?? null} pointSource={pointSource}
              layerControls={(
                <div className="q3-seg q3-layers" role="group" aria-label="Capas del mapa 3D">
                  <button type="button" className={`layer-chip${layers.plates ? " on" : ""}`} aria-pressed={layers.plates} onClick={() => setLayers(value => ({ ...value, plates: !value.plates }))}
                    title="Límites entre las placas tectónicas (modelo PB2002, P. Bird 2003): aproximados"><span className="chip-long">Placas tectónicas</span><span className="chip-short" aria-hidden="true">Placas</span></button>
                  <button type="button" className={`layer-chip${layers.faults ? " on" : ""}`} aria-pressed={layers.faults} onClick={() => setLayers(value => ({ ...value, faults: !value.faults }))}
                    title="Fallas activas en tierra en el centro del país: Pedro Miguel, Limón y Gatún (CCAF-DB/GEM; Rockwell et al., 2010; Gath et al.)"><span className="chip-long">Fallas activas</span><span className="chip-short" aria-hidden="true">Fallas</span></button>
                </div>
              )}
              onSelect={id => pick(id, false)}
            />
          ) : (
            <div className="q3-loading" role="status">
              {threeFailed ? <>No se pudo cargar la vista 3D. <button type="button" className="hx-btn" onClick={loadThree}>Reintentar</button></> : "Cargando la vista 3D…"}
            </div>
          )}
        </div>
      ) : visible.length === 0 ? (
        <p className="tm-empty">Ninguno de los 12 cae ahí.</p>
      ) : (
        <div className={`hs-figure${inset ? " hs-has-inset" : ""}${satellite ? " tm-sat" : ""}`}>
          <figure className="hs-fig-main">
            <svg ref={mainSvg} className="hs-map" viewBox={`0 0 ${main.W} ${main.H}`} role="group" aria-labelledby="hs-top-title hs-top-desc">
              <title id="hs-top-title">Mapa de los sismos más grandes de Panamá desde 1900</title>
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
                {visible.map((row, i) => (inGroup.has(i) ? null : <Pin key={row.quake.id} x={main.x(row.quake.lng)} y={main.y(row.quake.lat)} rank={row.rank} quake={row.quake} size="main" picked={row.quake.id === pickedId} onPick={pick} />))}
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
      )}

      {satellite && <p className="tm-credit">{SAT_CREDIT}</p>}
      {mode === "3d" ? (
        <p className="tm-hint">
          Cada sismo está a su profundidad bajo la superficie. Elige uno (toca su esfera o su número aquí abajo) y pulsa «Ver cómo se propagó la sacudida»: el color de cada lugar es la intensidad que estima el USGS y el frente avanza con los tiempos que calcula el modelo ak135 desde el hipocentro (con el modelo de falla del USGS, en el de 2026). Ojo: en la escena 3D las horas están en hora de Panamá; en el resto de la página, en hora universal (UTC).
        </p>
      ) : (
        <p className="tm-hint">Toca un número para ver ese sismo. Con el teclado, Tab llega al mapa y las flechas pasan de un puesto a otro.</p>
      )}
      <ol className="tm-ranks" aria-label="Elegir uno de los sismos que se ven">
        {visible.map(row => (
          <li key={row.quake.id}>
            <button type="button" className="hx-chip tm-rankbtn" data-era={eraOf(row.quake)} aria-pressed={row.quake.id === pickedId} onClick={() => pick(row.quake.id, true)}
              aria-label={`Puesto ${row.rank}, magnitud ${formatMag(row.quake.mag)}, ${formatDateUTC(row.quake.time)}`}>
              <b>{row.rank}</b><span>M {formatMag(row.quake.mag)}</span>
            </button>
          </li>
        ))}
      </ol>

      <div className="tm-card" ref={card} role="status" aria-live="polite">
        {picked ? (
          <>
            <div className="tm-head">
              <span className={`tm-rank hs-${eraOf(picked)}`} aria-hidden="true">{pickedRank}</span>
              <div>
                <strong className="tm-mag">M {formatMag(picked.mag)}{kind(picked) && <small> {kind(picked)}</small>}</strong>
                <span className="tm-when">{formatDateUTC(picked.time)} · {clock(picked.time)} UTC</span>
              </div>
            </div>
            <p className="tm-place">{placeEs(picked.place)}</p>
            <dl className="hx-facts tm-facts">
              <div><dt>Puesto por magnitud</dt><dd>{pickedRank} de {total}</dd></div>
              <div><dt>Profundidad</dt><dd>{picked.depth === null ? "sin dato" : `${Math.round(picked.depth)} km`}</dd></div>
              <div><dt>Provincia o comarca</dt><dd>{provinceTexts[picked.id] ?? "sin dato"}</dd></div>
              <div><dt>Ciudad o localidad</dt><dd>{pickedCity ?? "sin dato"}</dd></div>
            </dl>
            <div className="tm-wave" aria-live="polite">
              {wave?.status === "loading" && <p>Cargando la sacudida que estima el USGS… (el USGS a veces tarda unos segundos en responder).</p>}
              {wave?.status === "none" && <p><strong>Sin onda para este sismo:</strong> el USGS no publica un mapa de sacudida (ShakeMap) de él, así que no se dibuja ninguna: no se inventa.</p>}
              {wave?.status === "error" && <p>No se pudo cargar la sacudida del USGS. <button type="button" className="hx-linkbtn" onClick={() => fetchWave(picked.id)}>Reintentar</button></p>}
              {waveData && <p><strong>Sacudida:</strong> el USGS publica su ShakeMap{waveData.fault ? " y el modelo de la ruptura" : ""}; abajo, en la escena 3D, pulsa «{waveData.fault ? "Ver la ruptura y la onda" : "Ver cómo se propagó la sacudida"}».{!waveData.fault && " Se calcula desde el hipocentro publicado: cerca del epicentro es aproximada."}</p>}
              {mode !== "3d" && <button type="button" className="hx-btn" onClick={viewWave}>Ver su onda en 3D</button>}
            </div>
            <div className="tm-actions">
              <button type="button" className="hx-btn" onClick={() => goBy(visibleIndex, -1, false)} disabled={visibleIndex === 0}><ChevronLeft size={16} aria-hidden="true" />Puesto anterior</button>
              <button type="button" className="hx-btn" onClick={() => goBy(visibleIndex, 1, false)} disabled={visibleIndex === visible.length - 1}>Puesto siguiente<ChevronRight size={16} aria-hidden="true" /></button>
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
