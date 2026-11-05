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
// `panX` y `panY` son lo que se ha movido la escena en la pantalla (píxeles), para recorrerla cuando está acercada.
type View = { yaw: number; pitch: number; zoom: number; panX: number; panY: number };
const DEFAULT_VIEW: View = { yaw: 38, pitch: 58, zoom: 1, panX: 0, panY: 0 };
// `pitch` es cuánto se inclina el suelo respecto a la vista desde arriba: 0 = desde arriba, 90 = de canto.
const PRESETS = {
  perspective: { label: "Perspectiva", view: DEFAULT_VIEW },
  top: { label: "Desde arriba", view: { yaw: 0, pitch: 0, zoom: 1, panX: 0, panY: 0 } },
  // Desde el oeste, mirando al este: los sismos (casi todos al oeste de la traza) quedan entre la vista y el plano de la falla.
  // De canto exacto (90°): la profundidad se lee en la regla sin que la distancia a la vista la desplace.
  side: { label: "De lado (corte)", view: { yaw: -90, pitch: 90, zoom: 1, panX: 0, panY: 0 } },
} as const;
const ZOOM_MIN = 0.6;
const ZOOM_MAX = 6;
// Un dedo que se mueve menos que esto al tocar un sismo sigue siendo un toque, no un arrastre.
const TAP_SLOP = 6;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
// Perspectiva de la escena (la misma en el estilo del escenario y en la proyección que decide qué nombres caben). Al mirar casi de canto (la vista de corte)
// se vuelve casi ortogonal: con perspectiva, lo que queda más cerca de la vista se ve más grande y más desplazado, y la regla de profundidad (que está en el
// extremo de la falla) dejaría de leerse bien en los sismos que están a otra distancia.
const PERSPECTIVE_NEAR = 1700;
const PERSPECTIVE_FAR = 20000;
const ORIGIN_Y = 0.36;
// Los números de los estilos se redondean: el servidor los escribe con menos decimales que el navegador y React avisaría de una diferencia.
const r2 = (value: number) => Math.round(value * 100) / 100;
const dateTime = new Intl.DateTimeFormat("es-PA", { timeZone: "America/Panama", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
const SOURCE_NAMES = { usgs: "USGS", igc: "IGC", emsc: "EMSC" } as const;
// Capturar el puntero lanza un error si el dedo ya se levantó (un toque rápido); en ese caso no hay nada que capturar.
const capture = (element: HTMLElement, pointerId: number) => {
  try { element.setPointerCapture(pointerId); } catch { /* el puntero ya terminó */ }
};

export default function FaultScene({ lines, quakes, labels, selectedId, onSelect }: Props) {
  const stage = useRef<HTMLDivElement>(null);
  // Gestos: los dedos (o el mouse) que están tocando y lo que lleva hecho el gesto. Un dedo gira e inclina; dos dedos acercan (pellizco) y mueven.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ moved: boolean; startX: number; startY: number; pinch: { dist: number; mx: number; my: number } | null; suppressClickUntil: number }>(
    { moved: false, startX: 0, startY: 0, pinch: null, suppressClickUntil: 0 },
  );
  const [touched, setTouched] = useState(false);
  const [view, setView] = useState<View>(DEFAULT_VIEW);
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
  const traceW = r2(6 / scale);

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

  const wallMid = useMemo(() => {
    const longest = lines.reduce((best, line) => (line.length > best.length ? line : best), lines[0]);
    const point = longest[Math.floor(longest.length / 2)];
    return geo.at(point[0], point[1]);
  }, [lines, geo]);

  const selected = quakes.find(quake => quake.id === selectedId) ?? null;
  // Marcas que siempre miran a la vista y mantienen su tamaño en la pantalla aunque la escena se acerque o se aleje (como en un mapa): se contragira
  // el giro de la escena y se contraescala su zoom.
  const billboard = (x: number, y: number, z: number): CSSProperties => ({
    transform: `translate3d(${r2(x)}px, ${r2(y)}px, ${r2(z)}px) rotateZ(calc(var(--yaw) * -1)) rotateX(calc(var(--pitch) * -1)) scale(${r2(1 / scale * 1000) / 1000})`,
  });

  // La escena no se puede sacar del todo de la pantalla: su borde llega, como mucho, al centro.
  const limitPan = (next: View): View => {
    const k = fit * next.zoom;
    const limX = (geo.boxW * k) / 2;
    const limY = (geo.boxH * k) / 2;
    return { ...next, panX: clamp(next.panX, -limX, limX), panY: clamp(next.panY, -limY, limY) };
  };
  // Los botones y el teclado acercan alrededor del centro: lo movido se escala con el zoom.
  const move = (dyaw: number, dpitch: number, dzoom = 1) => setView(current => {
    const zoom = clamp(current.zoom * dzoom, ZOOM_MIN, ZOOM_MAX);
    const f = zoom / current.zoom;
    return limitPan({ yaw: current.yaw + dyaw, pitch: clamp(current.pitch + dpitch, 0, 88), zoom, panX: current.panX * f, panY: current.panY * f });
  });
  // Un dedo (o el mouse) arrastrando gira e inclina; arrastrar hacia abajo mira la escena más desde arriba, como en cualquier visor 3D.
  const orbit = (dx: number, dy: number) => move(dx * 0.4, -dy * 0.3);
  const pan = (dx: number, dy: number) => setView(current => limitPan({ ...current, panX: current.panX + dx, panY: current.panY + dy }));
  // Pellizco: acerca alrededor del punto medio de los dos dedos (ese punto de la escena se queda bajo los dedos) y, si los dedos se mueven juntos, mueve la escena.
  const zoomAbout = (factor: number, mx: number, my: number, dx: number, dy: number) => setView(current => {
    const zoom = clamp(current.zoom * factor, ZOOM_MIN, ZOOM_MAX);
    const f = zoom / current.zoom;
    const baseX = stageSize.w / 2;
    const baseY = stageSize.h / 2 + offsetY;
    return limitPan({ ...current, zoom, panX: current.panX * f + (mx - baseX) * (1 - f) + dx, panY: current.panY * f + (my - baseY) * (1 - f) + dy });
  });
  const pinchOf = () => {
    const [a, b] = [...pointers.current.values()];
    const rect = stage.current?.getBoundingClientRect();
    return { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2 - (rect?.left ?? 0), my: (a.y + b.y) / 2 - (rect?.top ?? 0) };
  };
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest(".fs-card, .fs-zoom")) return; // los botones de la propia escena no arrastran
    // Un toque sobre un sismo es un clic; solo se vuelve arrastre si el dedo se mueve (se captura entonces, para que el clic siga llegando al sismo).
    const onQuake = Boolean(target.closest(".fs-quake"));
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    setTouched(true);
    const g = gesture.current;
    if (pointers.current.size === 1) {
      g.moved = false;
      g.startX = event.clientX;
      g.startY = event.clientY;
      g.pinch = null;
    } else {
      g.moved = true;
      g.pinch = pinchOf();
      for (const id of pointers.current.keys()) capture(event.currentTarget, id);
    }
    if (!onQuake) capture(event.currentTarget, event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    const next = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, next);
    const g = gesture.current;
    if (pointers.current.size >= 2) {
      const now = pinchOf();
      const before = g.pinch ?? now;
      g.pinch = now;
      zoomAbout(now.dist / before.dist, now.mx, now.my, now.mx - before.mx, now.my - before.my);
      return;
    }
    if (!g.moved) {
      if (Math.hypot(next.x - g.startX, next.y - g.startY) < TAP_SLOP) return;
      g.moved = true;
      capture(event.currentTarget, event.pointerId);
    }
    const dx = next.x - previous.x;
    const dy = next.y - previous.y;
    if (event.pointerType === "mouse" && event.shiftKey) pan(dx, dy);
    else orbit(dx, dy);
  };
  const onPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    const g = gesture.current;
    g.pinch = null;
    if (pointers.current.size === 0) {
      // Tras arrastrar, el clic que algunos navegadores disparan al soltar sobre un sismo no debe elegirlo.
      if (g.moved) g.suppressClickUntil = performance.now() + 350;
      g.moved = false;
    }
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

  const perspective = Math.round(PERSPECTIVE_NEAR + (PERSPECTIVE_FAR - PERSPECTIVE_NEAR) * clamp((view.pitch - 60) / 24, 0, 1));
  const scale3 = r2(scale * 1000) / 1000;
  const offsetY = r2(stageSize.h * 0.04 - 0.5 * depthPx(FAULT_DEPTH_KM) * Math.sin((view.pitch * Math.PI) / 180) * scale);
  const pivot: CSSProperties & Record<string, string | number> = {
    "--yaw": `${r2(view.yaw)}deg`,
    "--pitch": `${r2(view.pitch)}deg`,
    // Al inclinar el suelo, la falla (que cuelga bajo él) baja en la pantalla: se sube la escena la mitad de lo que baja, para centrarla.
    // scale3d y no scale: `scale` solo escala x e y y dejaba la profundidad sin escalar, o sea exagerada 1/escala veces aunque dijera «Real».
    transform: `translate3d(${r2(view.panX)}px, ${r2(offsetY + view.panY)}px, 0px) scale3d(${scale3}, ${scale3}, ${scale3}) rotateX(${r2(view.pitch)}deg) rotateZ(${r2(view.yaw)}deg)`,
  };

  // Localidades: en orden de importancia; al acercar aparecen más, y solo las que caben sin taparse (se proyecta a la pantalla igual que el navegador).
  const towns = useMemo(() => labels.map(label => ({ ...label, ...geo.at(label.lng, label.lat) })), [labels, geo]);
  const toScreen = (x: number, y: number, z: number) => {
    const yaw = (view.yaw * Math.PI) / 180;
    const pitch = (view.pitch * Math.PI) / 180;
    const dx = x - geo.center.x;
    const dy = y - geo.center.y;
    const x1 = dx * Math.cos(yaw) - dy * Math.sin(yaw);
    const y1 = dx * Math.sin(yaw) + dy * Math.cos(yaw);
    const y2 = y1 * Math.cos(pitch) - z * Math.sin(pitch);
    const z2 = y1 * Math.sin(pitch) + z * Math.cos(pitch);
    const originX = stageSize.w / 2;
    const originY = stageSize.h * ORIGIN_Y;
    const k = perspective / (perspective - z2 * scale);
    return { sx: originX + (stageSize.w / 2 + view.panX + x1 * scale - originX) * k, sy: originY + (stageSize.h / 2 + offsetY + view.panY + y2 * scale - originY) * k };
  };
  const wanted = clamp(Math.round(4 + (view.zoom - 1) * 9), 4, towns.length);
  const visibleTowns: ((typeof towns)[number] & { sx: number; sy: number; w: number })[] = [];
  // El rótulo con el nombre de la falla ocupa su sitio: ninguna localidad se le pone encima.
  const nameTag = toScreen(wallMid.x, wallMid.y, 4);
  for (const town of towns) {
    if (visibleTowns.length >= wanted) break;
    const screen = toScreen(town.x, town.y, 2);
    const w = town.name.length * 8.6 + 16;
    if (Math.abs(nameTag.sx - screen.sx) < (190 + w) / 2 && Math.abs(nameTag.sy - 26 - screen.sy) < 34) continue;
    if (screen.sx - w / 2 < 4 || screen.sx + w / 2 > stageSize.w - 4 || screen.sy < 24 || screen.sy > stageSize.h) continue;
    if (screen.sx + w / 2 > stageSize.w - 62 && screen.sy < 160) continue; // bajo los botones de acercar
    if (visibleTowns.some(other => Math.abs(other.sx - screen.sx) < (other.w + w) / 2 && Math.abs(other.sy - screen.sy) < 26)) continue;
    visibleTowns.push({ ...town, ...screen, w });
  }

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
        style={{ perspective: `${perspective}px`, perspectiveOrigin: `50% ${ORIGIN_Y * 100}%` }}
        tabIndex={0}
        role="group"
        aria-label={`Escena 3D de la falla de Pedro Miguel con ${quakes.length} sismos registrados cerca. Arrastra con un dedo para girar e inclinar y pellizca con dos para acercar; con el teclado, las flechas giran e inclinan y más y menos acercan.`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
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

            {/* El plano de la falla: un muro por cada tramo del trazado, desde la superficie hasta la profundidad de la ilustración. Con líneas cada 5 km para leer la profundidad. */}
            {segments.map((segment, index) => (
              <div key={index} className="fs-wall" style={{ width: segment.length + 0.6, height: depthPx(FAULT_DEPTH_KM), "--km": `${depthPx(5)}px`, transform: `translate3d(${segment.x}px, ${segment.y}px, 0px) rotateZ(${segment.angle}deg) rotateX(-90deg)` } as CSSProperties} />
            ))}

            {/* El trazado en la superficie (la línea publicada por CCAF-DB / GEM): gruesa y brillante para que se vea sobre el satélite; mantiene unos 6 px en pantalla al acercar o alejar. */}
            {/* Dos capas: primero todos los halos y encima todos los núcleos (si no, el halo de un tramo tapa el núcleo del vecino y la línea sale a pedazos). */}
            {(["halo", "core"] as const).map((layer, layerIndex) => segments.map((segment, index) => {
              const h = layer === "halo" ? traceW : r2(traceW * 0.5); // el núcleo, más fino, deja ver el borde rojo
              return (
                <div key={`${layer}-${index}`} className={`fs-trace ${layer}`} style={{ width: r2(segment.length + 0.6), height: h, transform: `translate3d(${segment.x}px, ${segment.y}px, ${layerIndex + 1}px) rotateZ(${segment.angle}deg) translateY(${r2(-h / 2)}px)` }} />
              );
            }))}
            <span className="fs-trace-name" style={billboard(wallMid.x, wallMid.y, 4)}><span>Falla de Pedro Miguel</span></span>

            {/* El plano no es un dato de la falla: se dice en la propia escena. */}
            <span className="fs-wall-label" style={billboard(wallMid.x, wallMid.y, -depthPx(FAULT_DEPTH_KM) - 4)}>Plano ilustrativo hasta {FAULT_DEPTH_KM} km (no es un dato de la falla)</span>

            {/* Regla de profundidad en el extremo sur del trazado. */}
            <div className="fs-ruler" style={{ transform: `translate3d(${southEnd.x + 14}px, ${southEnd.y}px, 0px) rotateZ(calc(var(--yaw) * -1)) rotateX(-90deg)`, height: depthPx(FAULT_DEPTH_KM) }} />
            {DEPTH_TICKS.map(km => (
              <span key={km} className="fs-tick" style={billboard(southEnd.x + 14, southEnd.y, -depthPx(km))}>{km} km</span>
            ))}

            {visibleTowns.map(town => (
              <Fragment key={town.name}>
                <span className="fs-town-dot" style={billboard(town.x, town.y, 1)} />
                <span className="fs-label" style={billboard(town.x, town.y, 2)}>{town.name}</span>
              </Fragment>
            ))}

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
                    onClick={() => { if (performance.now() < gesture.current.suppressClickUntil) return; onSelect(quake.id === selectedId ? null : quake.id); }}
                  />
                </Fragment>
              );
            })}
          </div>
        </div>
        {loaded < geo.tiles.length && <p className="fs-loading" role="status">Cargando el satélite…</p>}
        {/* Botones sobre la escena (como en un mapa): en el teléfono los de la barra de arriba quedan lejos cuando la escena ocupa la pantalla. */}
        <div className="fs-zoom" role="group" aria-label="Acercar, alejar y centrar">
          <button type="button" aria-label="Acercar" onClick={() => move(0, 0, 1.4)}>+</button>
          <button type="button" aria-label="Alejar" onClick={() => move(0, 0, 1 / 1.4)}>−</button>
          <button type="button" aria-label="Centrar la vista" title="Centrar la vista" onClick={() => setView(DEFAULT_VIEW)}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="3.5" /><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4" /></svg>
          </button>
        </div>
        {!touched && (
          <p className="fs-gesture-hint" aria-hidden="true">
            <span className="fs-on-touch">Un dedo gira e inclina · dos dedos acercan y mueven</span>
            <span className="fs-on-mouse">Arrastra para girar · Mayús + arrastrar para mover</span>
          </p>
        )}
        {/* Los datos del sismo tocado salen dentro de la escena (la tarjeta de debajo de la página quedaba fuera de la pantalla). */}
        <div className="fs-card-slot" role="status" aria-live="polite">
          {selected && (
            <div className="fs-card">
              <p>
                <strong>M {selected.mag?.toFixed(1) ?? "—"}</strong> · {dateTime.format(selected.time)}
                <br />
                {selected.place}
                <br />
                Profundidad {selected.depthKm === null ? "sin dato" : `${selected.depthKm.toLocaleString("es-PA", { maximumFractionDigits: 1 })} km`}
                {depthIsAssigned(selected.depthKm) && selected.depthKm !== null ? " (asignada por el catálogo, no medida)" : ""} · {SOURCE_NAMES[selected.source]}
                {selected.traceKm !== undefined && (
                  <span className="fs-card-note">
                    A {selected.traceKm.toLocaleString("es-PA", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km al {selected.traceSide} de la traza (cálculo propio con las posiciones publicadas)
                  </span>
                )}
              </p>
              <button type="button" aria-label="Cerrar los datos del sismo" onClick={() => onSelect(null)}>×</button>
            </div>
          )}
        </div>
        <p className="fs-credit">Imágenes: Esri, Maxar, Earthstar Geographics · Localidades: GeoNames</p>
      </div>

      <div className="fs-legend" aria-label="Leyenda">
        <span><i className="fs-key wall" aria-hidden="true" />Falla: trazado y plano ilustrativo hasta {FAULT_DEPTH_KM} km</span>
        <span><i className="fs-key hl" aria-hidden="true" />Sismo del 4 de noviembre</span>
        <span><i className="fs-key usgs" aria-hidden="true" />Otros sismos registrados</span>
        <span><i className="fs-key ring" aria-hidden="true" />Profundidad de 5 o 10 km exactos: suele ser asignada, no medida</span>
      </div>

      <div className="fs-info">
        <p className="fs-hint">
          Toca un sismo (los círculos) para ver sus datos dentro de la escena.{" "}
          <span className="fs-on-touch">Con un dedo gira e inclina la escena; con dos, pellizca para acercar y arrastra para moverla.</span>
          <span className="fs-on-mouse">Arrastra para girar e inclinar; Mayús + arrastrar la mueve.</span>{" "}
          Al acercar aparecen más nombres de localidades; el botón de la mira devuelve la vista inicial.
        </p>
      </div>
    </div>
  );
}
