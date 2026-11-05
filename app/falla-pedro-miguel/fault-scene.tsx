"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { FAULT_DEPTH_KM } from "../../lib/active-faults";
import { SCENE_BOX, TILE_ZOOM, depthIsAssigned, kmPerPixel, worldPixel, type SceneQuake } from "../../lib/fault-geometry";

// La falla de Pedro Miguel en 3D: el satélite de la zona como suelo, el trazado publicado de la falla, su plano hacia abajo (ilustrativo:
// la base de datos no publica hasta qué profundidad llega) y los sismos registrados cerca, cada uno a su profundidad publicada. Es 3D del
// navegador (CSS), sin librerías: el suelo es una cuadrícula de mosaicos y la falla, un muro por cada tramo del trazado. La profundidad va
// a escala real (o ×2); el relieve del terreno no se representa.

type Label = { name: string; lat: number; lng: number };
type Props = {
  lines: [number, number][][];
  quakes: SceneQuake[];
  labels: Label[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
};

const TILE_URL = (x: number, y: number) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${TILE_ZOOM}/${y}/${x}`;
const DEPTH_TICKS = [0, 5, 10, 15];
const DEFAULT_VIEW = { yaw: 38, pitch: 58, zoom: 1 };
// `pitch` es cuánto se inclina el suelo respecto a la vista desde arriba: 0 = desde arriba, 90 = de canto.
const PRESETS = {
  perspective: { label: "Perspectiva", view: DEFAULT_VIEW },
  top: { label: "Desde arriba", view: { yaw: 0, pitch: 0, zoom: 1 } },
  // Desde el oeste, mirando al este: los sismos (casi todos al oeste de la traza) quedan entre la vista y el plano de la falla.
  side: { label: "De lado (corte)", view: { yaw: -90, pitch: 84, zoom: 1 } },
} as const;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
// Los números de los estilos se redondean: el servidor los escribe con menos decimales que el navegador y React avisaría de una diferencia.
const r2 = (value: number) => Math.round(value * 100) / 100;
const dateTime = new Intl.DateTimeFormat("es-PA", { timeZone: "America/Panama", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
const SOURCE_NAMES = { usgs: "USGS", igc: "IGC", emsc: "EMSC" } as const;

export default function FaultScene({ lines, quakes, labels, selectedId, onSelect }: Props) {
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const [view, setView] = useState<{ yaw: number; pitch: number; zoom: number }>(DEFAULT_VIEW);
  const [stageSize, setStageSize] = useState({ w: 720, h: 520 });
  const [surface, setSurface] = useState(62);
  const [vex, setVex] = useState<1 | 2>(1);
  const [loaded, setLoaded] = useState(0);

  // Geometría en píxeles del suelo (mosaicos de 256 px): origen en la esquina noroeste del bloque de mosaicos.
  const geo = useMemo(() => {
    const nw = worldPixel(SCENE_BOX.west, SCENE_BOX.north, TILE_ZOOM);
    const se = worldPixel(SCENE_BOX.east, SCENE_BOX.south, TILE_ZOOM);
    const x0 = Math.floor(nw.x / 256);
    const x1 = Math.floor(se.x / 256);
    const y0 = Math.floor(nw.y / 256);
    const y1 = Math.floor(se.y / 256);
    const origin = { x: x0 * 256, y: y0 * 256 };
    const at = (lng: number, lat: number) => {
      const p = worldPixel(lng, lat, TILE_ZOOM);
      return { x: r2(p.x - origin.x), y: r2(p.y - origin.y) };
    };
    const tiles: { x: number; y: number; left: number; top: number }[] = [];
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) tiles.push({ x: tx, y: ty, left: (tx - x0) * 256, top: (ty - y0) * 256 });
    const centerLat = (SCENE_BOX.north + SCENE_BOX.south) / 2;
    return {
      at,
      tiles,
      width: (x1 - x0 + 1) * 256,
      height: (y1 - y0 + 1) * 256,
      center: at((SCENE_BOX.west + SCENE_BOX.east) / 2, centerLat),
      boxW: se.x - nw.x,
      boxH: se.y - nw.y,
      pxPerKm: 1 / kmPerPixel(centerLat, TILE_ZOOM),
    };
  }, []);

  useEffect(() => {
    const element = stage.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(entries => {
      const rect = entries[0].contentRect;
      setStageSize({ w: rect.width, h: rect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Con la zona entera cabiendo en la vista: el zoom 1 es «todo el recuadro a la vista» según el tamaño de la escena.
  const fit = Math.min(stageSize.w / (geo.boxW * 1.08), stageSize.h / (geo.boxH * 0.86));
  const scale = fit * view.zoom;
  const depthPx = (km: number) => r2(km * geo.pxPerKm * vex);

  const segments = useMemo(() => lines.flatMap(line => line.slice(0, -1).map((a, i) => {
    const p = geo.at(a[0], a[1]);
    const q = geo.at(line[i + 1][0], line[i + 1][1]);
    return { x: p.x, y: p.y, length: r2(Math.hypot(q.x - p.x, q.y - p.y)), angle: r2((Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI) };
  })), [lines, geo]);
  const southEnd = useMemo(() => {
    const all = lines.flat();
    const south = all.reduce((best, point) => (point[1] < best[1] ? point : best), all[0]);
    return geo.at(south[0], south[1]);
  }, [lines, geo]);

  const selected = quakes.find(quake => quake.id === selectedId) ?? null;
  // Marcas que siempre miran a la vista y mantienen su tamaño en la pantalla aunque la escena se acerque o se aleje (como en un mapa): se contragira
  // el giro de la escena y se contraescala su zoom.
  const billboard = (x: number, y: number, z: number): CSSProperties => ({
    transform: `translate3d(${r2(x)}px, ${r2(y)}px, ${r2(z)}px) rotateZ(calc(var(--yaw) * -1)) rotateX(calc(var(--pitch) * -1)) scale(${r2(1 / scale * 1000) / 1000})`,
  });

  const move = (dyaw: number, dpitch: number, dzoom = 1) => setView(current => ({ yaw: current.yaw + dyaw, pitch: clamp(current.pitch + dpitch, 0, 88), zoom: clamp(current.zoom * dzoom, 0.6, 4) }));
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button")) return;
    drag.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const dx = event.clientX - drag.current.x;
    const dy = event.clientY - drag.current.y;
    drag.current = { x: event.clientX, y: event.clientY };
    move(dx * 0.4, event.pointerType === "mouse" ? dy * 0.3 : 0);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 15 : 5;
    if (event.key === "ArrowLeft") move(-step, 0);
    else if (event.key === "ArrowRight") move(step, 0);
    else if (event.key === "ArrowUp") move(0, step);
    else if (event.key === "ArrowDown") move(0, -step);
    else if (event.key === "+" || event.key === "=") move(0, 0, 1.2);
    else if (event.key === "-") move(0, 0, 1 / 1.2);
    else if (event.key === "0") setView(DEFAULT_VIEW);
    else if (event.key === "Escape") onSelect(null);
    else return;
    event.preventDefault();
  };

  const pivot: CSSProperties & Record<string, string | number> = {
    "--yaw": `${r2(view.yaw)}deg`,
    "--pitch": `${r2(view.pitch)}deg`,
    // Al inclinar el suelo, la falla (que cuelga bajo él) baja en la pantalla: se sube la escena la mitad de lo que baja, para centrarla.
    transform: `translate3d(0px, ${r2(stageSize.h * 0.04 - 0.5 * depthPx(FAULT_DEPTH_KM) * Math.sin((view.pitch * Math.PI) / 180) * scale)}px, 0px) scale(${r2(scale * 1000) / 1000}) rotateX(${r2(view.pitch)}deg) rotateZ(${r2(view.yaw)}deg)`,
  };

  return (
    <div className="fs">
      <div className="fs-toolbar" role="group" aria-label="Controles de la escena 3D">
        <div className="fs-seg" role="group" aria-label="Punto de vista">
          {(Object.keys(PRESETS) as (keyof typeof PRESETS)[]).map(key => (
            <button key={key} type="button" onClick={() => setView(PRESETS[key].view)}>{PRESETS[key].label}</button>
          ))}
        </div>
        <div className="fs-seg" role="group" aria-label="Girar e inclinar">
          <button type="button" aria-label="Girar a la izquierda" onClick={() => move(-15, 0)}>⟲</button>
          <button type="button" aria-label="Girar a la derecha" onClick={() => move(15, 0)}>⟳</button>
          <button type="button" aria-label="Mirar más de lado (más inclinado)" title="Mirar más de lado" onClick={() => move(0, 10)}>▲</button>
          <button type="button" aria-label="Mirar más desde arriba (menos inclinado)" title="Mirar más desde arriba" onClick={() => move(0, -10)}>▼</button>
        </div>
        <div className="fs-seg" role="group" aria-label="Acercar o alejar">
          <button type="button" aria-label="Acercar" onClick={() => move(0, 0, 1.25)}>+</button>
          <button type="button" aria-label="Alejar" onClick={() => move(0, 0, 0.8)}>−</button>
        </div>
        <div className="fs-seg" role="group" aria-label="Escala de la profundidad">
          <span className="fs-cap" aria-hidden="true">Profundidad</span>
          <button type="button" aria-pressed={vex === 1} onClick={() => setVex(1)}>Real</button>
          <button type="button" aria-pressed={vex === 2} onClick={() => setVex(2)}>×2</button>
        </div>
        <label className="fs-range">Superficie
          <input type="range" min={20} max={100} step={5} value={surface} onChange={event => setSurface(Number(event.target.value))} aria-label="Opacidad de la superficie" />
          <span>{surface}%</span>
        </label>
      </div>

      <div
        ref={stage}
        className="fs-stage"
        tabIndex={0}
        role="group"
        aria-label={`Escena 3D de la falla de Pedro Miguel con ${quakes.length} sismos registrados cerca. Arrastra para girar; con el teclado, las flechas giran e inclinan y más y menos acercan.`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => { drag.current = null; }}
        onPointerCancel={() => { drag.current = null; }}
        onKeyDown={onKeyDown}
      >
        <div className="fs-pivot" style={pivot}>
          <div className="fs-plane" style={{ left: -geo.center.x, top: -geo.center.y, width: geo.width, height: geo.height }}>
            <div className="fs-ground" style={{ opacity: surface / 100 }}>
              {geo.tiles.map(tile => (
                // eslint-disable-next-line @next/next/no-img-element -- mosaicos del satélite de otro servidor, colocados a mano en el suelo 3D
                <img key={`${tile.x}-${tile.y}`} src={TILE_URL(tile.x, tile.y)} alt="" width={256} height={256} draggable={false} decoding="async" referrerPolicy="no-referrer"
                  style={{ left: tile.left, top: tile.top }} onLoad={() => setLoaded(count => count + 1)} />
              ))}
            </div>

            {/* El plano de la falla: un muro por cada tramo del trazado, desde la superficie hasta la profundidad de la ilustración. */}
            {segments.map((segment, index) => (
              <div key={index} className="fs-wall" style={{ width: segment.length + 0.6, height: depthPx(FAULT_DEPTH_KM), transform: `translate3d(${segment.x}px, ${segment.y}px, 0px) rotateZ(${segment.angle}deg) rotateX(-90deg)` }} />
            ))}

            {/* Regla de profundidad en el extremo sur del trazado. */}
            <div className="fs-ruler" style={{ transform: `translate3d(${southEnd.x + 14}px, ${southEnd.y}px, 0px) rotateZ(calc(var(--yaw) * -1)) rotateX(-90deg)`, height: depthPx(FAULT_DEPTH_KM) }} />
            {DEPTH_TICKS.map(km => (
              <span key={km} className="fs-tick" style={billboard(southEnd.x + 14, southEnd.y, -depthPx(km))}>{km} km</span>
            ))}

            {labels.map(label => {
              const p = geo.at(label.lng, label.lat);
              return <span key={label.name} className="fs-label" style={billboard(p.x, p.y, 2)}>{label.name}</span>;
            })}

            {quakes.map(quake => {
              const p = geo.at(quake.lng, quake.lat);
              const z = -depthPx(clamp(quake.depthKm ?? 0, 0, 40));
              const radius = r2(quake.highlight ? 11 : 4.5 + Math.max(0, (quake.mag ?? 2) - 2) * 2.4); // píxeles de pantalla
              const assigned = depthIsAssigned(quake.depthKm);
              return (
                // Fragment y no un div: un elemento intermedio sin `preserve-3d` aplana a sus hijos y los sismos perderían su profundidad.
                <Fragment key={quake.id}>
                  {z < -1 && <span className="fs-drop" style={{ height: -z, transform: `translate3d(${p.x}px, ${p.y}px, 0px) rotateZ(calc(var(--yaw) * -1)) rotateX(-90deg)` }} />}
                  <span className="fs-epicenter" style={billboard(p.x, p.y, 1)} />
                  <button
                    type="button"
                    className={`fs-quake${quake.highlight ? " hl" : ""}${assigned ? " assigned" : ""}${quake.id === selectedId ? " on" : ""}`}
                    style={{ ...billboard(p.x, p.y, z), width: radius * 2, height: radius * 2, marginLeft: -radius, marginTop: -radius }}
                    aria-label={`Sismo de magnitud ${quake.mag?.toFixed(1) ?? "sin dato"}, ${dateTime.format(quake.time)}`}
                    aria-pressed={quake.id === selectedId}
                    onClick={() => onSelect(quake.id === selectedId ? null : quake.id)}
                  />
                </Fragment>
              );
            })}
          </div>
        </div>
        {loaded < geo.tiles.length && <p className="fs-loading" role="status">Cargando el satélite…</p>}
        <p className="fs-credit">Imágenes: Esri, Maxar, Earthstar Geographics</p>
      </div>

      <div className="fs-legend" aria-label="Leyenda">
        <span><i className="fs-key wall" aria-hidden="true" />Falla: trazado y plano ilustrativo hasta {FAULT_DEPTH_KM} km</span>
        <span><i className="fs-key hl" aria-hidden="true" />Sismo del 4 de noviembre</span>
        <span><i className="fs-key usgs" aria-hidden="true" />Otros sismos registrados</span>
        <span><i className="fs-key ring" aria-hidden="true" />Profundidad asignada por el catálogo (0, 5 o 10 km)</span>
      </div>

      <div className="fs-info" role="status" aria-live="polite">
        {selected ? (
          <p>
            <strong>M {selected.mag?.toFixed(1) ?? "—"}</strong> · {dateTime.format(selected.time)} · {selected.place} · profundidad{" "}
            {selected.depthKm === null ? "sin dato" : `${selected.depthKm.toLocaleString("es-PA", { maximumFractionDigits: 1 })} km`}
            {depthIsAssigned(selected.depthKm) && selected.depthKm !== null ? " (asignada por el catálogo, no medida)" : ""} · {SOURCE_NAMES[selected.source]}
          </p>
        ) : (
          <p className="fs-hint">Toca un sismo para ver sus datos. Arrastra para girar la escena.</p>
        )}
      </div>
    </div>
  );
}
