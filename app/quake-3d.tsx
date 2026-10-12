"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { isAftershock, type Earthquake, type ReplayStep } from "../lib/earthquakes";
import type { Contour, Fault, Felt, Mechanism, ShakeGrid } from "../lib/usgs-detail";
import { PANAMA_RINGS } from "../lib/panama";
import { PROVINCE_BY_ID } from "../lib/province-of";
import { PROVINCE_LABELS, TOWN_LABELS } from "../lib/province-labels";
import { PROVINCES } from "../lib/provinces";
import { KIND_INFO, PLATE_BOUNDARIES, PLATE_LABELS, PLATE_NAMES, PLATE_SHORT } from "../lib/plates";
import PlatesLegend from "./plates-legend";
import { intensityColor, intensityRgb, slipColor } from "../lib/usgs-colors";
import { depthColor, isRoundDepth } from "../lib/depth";
import { buildGroundModel, groundMotion } from "../lib/ground-motion";
import { loadMosaic, paintMosaic, paintTexture, planTiles, type Mosaic } from "./satellite-tiles";
import { reducedMotion, shakeElement } from "./shake";
// Inline SVG keeps these small controls independent of the icon library runtime.
const ICON_PATHS = {
  Box: "m12 3 9 5v8l-9 5-9-5V8l9-5Zm0 9 9-4M12 12 3 8m9 4v9",
  Compass: "m16 8-3 5-5 3 3-5 5-3ZM12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20",
  Focus: "M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8",
  Maximize2: "M15 3h6v6m0-6-7 7M9 21H3v-6m0 6 7-7",
  Minimize2: "M21 3l-7 7m0-6v6h6M3 21l7-7m-6 0h6v6",
  Minus: "M5 12h14",
  Plus: "M5 12h14m-7-7v14",
  RotateCcw: "M3 10a9 9 0 1 1 1 7M3 4v6h6",
} as const;
function SceneIcon({ name, size = 17 }: { name: keyof typeof ICON_PATHS; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICON_PATHS[name]} /></svg>;
}

type Props = {
  events: Earthquake[];
  // Filtros puestos en la página ("" = ninguno): con alguno se muestran las réplicas que deja pasar (si no, no se notaría).
  filtersKey: string;
  mainshock: Earthquake | null;
  selectedId: string | null;
  replay: ReplayStep | null;
  region: string | null;
  fault: Fault | null;
  felt: Felt | null;
  shaking: Contour[] | null;
  // Límites de las placas tectónicas (datos estáticos).
  plates: boolean;
  // Onda de sacudida: cómo se propagó por el país (intensidad del ShakeMap + llegada calculada con velocidades típicas).
  wave: boolean;
  shakeGrid: ShakeGrid | null;
  // Mecanismo focal del USGS: de su plano de falla sale el sentido del deslizamiento que muestran las flechas.
  mechanism: Mechanism | null;
  // Interruptores de las capas del USGS, que maneja el mapa.
  layerControls: ReactNode;
  onSelect: (id: string) => void;
};

// px y py: desplazamiento de la escena en píxeles (mover con dos dedos o Mayús + arrastrar).
type Camera = { yaw: number; pitch: number; zoom: number; px: number; py: number };
type Point = { x: number; y: number; z: number };

const KM_PER_DEG = 111.32;
const KM_PER_LAT = 110.57;
const PRESETS = {
  perspective: { yaw: 12, pitch: 46, zoom: 1, px: 0, py: 0 },
  top: { yaw: 0, pitch: 90, zoom: 1, px: 0, py: 0 },
  side: { yaw: 0, pitch: 4, zoom: 1, px: 0, py: 0 },
} as const;

// Punto de vista inicial según la forma del lienzo: en uno alto o casi cuadrado (celular, tablet vertical) se mira a lo largo
// de la caja, que es larga y angosta, así llena el alto en vez de quedar chica en el centro.
const homeFor = (w: number, h: number): Camera => {
  const aspect = w / h;
  // Se mira desde el sur-suroeste, hacia donde buza la falla: así la ruptura se ve de frente y no de canto.
  return aspect < 1 ? { yaw: 78, pitch: 48, zoom: 1, px: 0, py: 0 } : { yaw: 12, pitch: 46, zoom: 1, px: 0, py: 0 };
};
const EXAGGERATIONS = [1, 4, 8] as const;
// Opacidad de la imagen satelital (algo translúcida para que se integre con el fondo).
const SAT_ALPHA = 0.9;
const SAT_KEY = "sismo_3d_satellite";
// Velocidad de la animación de la ruptura respecto al tiempo real del modelo (la ruptura dura unos 43 s).
const RUPTURE_SPEED = 3;
// Velocidades típicas de las ondas sísmicas en la corteza (km/s). Con ellas se calcula cuándo llega cada onda a cada punto.
const VP = 6.0;
const VS = 3.5;
// Con la onda de sacudida el recorrido dura más (llega a todo el país), así que la animación va más rápida.
const WAVE_SPEED = 6;
const COLORS = { low: "#f5c542", mid: "#f08a24", high: "#da121a", latest: "#1d6bff", main: "#a21caf" };
const clock = new Intl.DateTimeFormat("es-PA", { timeZone: "America/Panama", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });


const depthOf = (event: Earthquake) => event.geometry.coordinates[2];
// Profundidad con un decimal como máximo (12.647 → 12.6).
// Márgenes del encuadre (izquierda, derecha, vertical): a la izquierda van los kilómetros de profundidad.
const marginsFor = (w: number) => (w < 480 ? ([44, 18, 52] as const) : ([56, 60, 42] as const));
const km = (value: number) => `${Math.round(value * 10) / 10} km`;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

type Item = {
  event: Earthquake;
  mag: number | null;
  depth: number;
  fixed: boolean;
  tier: "low" | "mid" | "high";
  radius: number;
  p: Point;
  top: Point;
};

// Caja que contiene todo el país (tierra firme e islas), para que la escena siempre muestre Panamá completo.
const COUNTRY = (() => {
  const points = PANAMA_RINGS.flat();
  const [lngs, lats] = [points.map(p => p[0]), points.map(p => p[1])];
  return { west: Math.min(...lngs), east: Math.max(...lngs), south: Math.min(...lats), north: Math.max(...lats) };
})();

type SceneInfo = {
  south: number; north: number; west: number; east: number;
  lat0: number; lng0: number;
  toKm: (lng: number, lat: number) => { x: number; y: number };
  floorKm: number; halfW: number; halfH: number;
};

// Cámara → pantalla. Km (este, norte, arriba) pasan a un plano con un poco de perspectiva, y la caja entera (superficie y
// suelo de profundidad) se encuadra en el lienzo desde cualquier ángulo. `depth` crece hacia quien mira, para ordenar de
// lejos a cerca.
function makeProjection(scene: SceneInfo, camera: Camera, w: number, h: number, exaggeration: number) {
  const yaw = (camera.yaw * Math.PI) / 180;
  const pitch = (camera.pitch * Math.PI) / 180;
  const [cy, sy, cp, sp] = [Math.cos(yaw), Math.sin(yaw), Math.cos(pitch), Math.sin(pitch)];
  const radius = Math.hypot(scene.halfW, scene.halfH, (scene.floorKm * exaggeration) / 2);
  const dist = radius * 3.2;
  const midZ = -(scene.floorKm * exaggeration) / 2;
  const at = (lng: number, lat: number, depthKm: number): Point => ({ ...scene.toKm(lng, lat), z: -depthKm * exaggeration });
  const raw = (p: Point) => {
    const x1 = p.x * cy - p.y * sy;
    const y1 = p.x * sy + p.y * cy;
    const z1 = p.z - midZ;
    const toward = -y1 * cp + z1 * sp;
    const k = dist / (dist - toward);
    return { rx: x1 * k, ry: (y1 * sp + z1 * cp) * k, depth: toward, k };
  };
  const box8 = ([scene.south, scene.north] as const).flatMap(lat => ([scene.west, scene.east] as const).flatMap(lng => [at(lng, lat, 0), at(lng, lat, scene.floorKm)])).map(raw);
  const [minX, maxX] = [Math.min(...box8.map(r => r.rx)), Math.max(...box8.map(r => r.rx))];
  const [minY, maxY] = [Math.min(...box8.map(r => r.ry)), Math.max(...box8.map(r => r.ry))];
  const [marginL, marginR, marginV] = marginsFor(w);
  const fit = Math.min((w - marginL - marginR) / (maxX - minX), (h - 2 * marginV) / (maxY - minY));
  const scale = fit * camera.zoom;
  const originX = marginL + (w - marginL - marginR) / 2;
  const project = (p: Point) => {
    const r = raw(p);
    return { sx: originX + (r.rx - (minX + maxX) / 2) * scale + camera.px, sy: h / 2 - (r.ry - (minY + maxY) / 2) * scale + camera.py, depth: r.depth, k: r.k };
  };
  return { at, project, sp, fit, originX };
}

// Las cuatro esquinas del rectángulo de la falla (arriba-izquierda, arriba-derecha, abajo-derecha, abajo-izquierda),
// sacadas de las celdas del modelo: las más extremas a lo largo del rumbo y de la profundidad.
function faultOutline(fault: Fault, strike: number): [number, number, number][] {
  const corners = fault.subfaults.flatMap(sub => sub.ring);
  const a = (strike * Math.PI) / 180;
  const [lng0, lat0] = corners[0];
  const along = ([lng, lat]: [number, number, number]) => (lng - lng0) * KM_PER_DEG * Math.cos((lat0 * Math.PI) / 180) * Math.sin(a) + (lat - lat0) * KM_PER_LAT * Math.cos(a);
  const us = corners.map(along);
  const ds = corners.map(c => c[2]);
  const [uMin, uMax, dMin, dMax] = [Math.min(...us), Math.max(...us), Math.min(...ds), Math.max(...ds)];
  const uSpan = Math.max(uMax - uMin, 1);
  const dSpan = Math.max(dMax - dMin, 1);
  return ([[uMin, dMin], [uMax, dMin], [uMax, dMax], [uMin, dMax]] as const).map(([tu, td]) => {
    let best = 0;
    let bestScore = Infinity;
    corners.forEach((_, i) => {
      const score = Math.abs(us[i] - tu) / uSpan + Math.abs(ds[i] - td) / dSpan;
      if (score < bestScore) { bestScore = score; best = i; }
    });
    return corners[best];
  });
}

// Punto de la superficie (longitud, latitud) que cae en el centro de la vista: se busca con el método de Newton sobre la
// proyección (unas pocas vueltas bastan).
function surfaceAtCenter(scene: SceneInfo, camera: Camera, w: number, h: number, exaggeration: number) {
  const proj = makeProjection(scene, camera, w, h, exaggeration);
  let lng = scene.lng0;
  let lat = scene.lat0;
  const step = 0.05;
  for (let i = 0; i < 8; i++) {
    const p = proj.project(proj.at(lng, lat, 0));
    const [ex, ey] = [proj.originX - p.sx, h / 2 - p.sy];
    if (Math.hypot(ex, ey) < 0.5) break;
    const pe = proj.project(proj.at(lng + step, lat, 0));
    const pn = proj.project(proj.at(lng, lat + step, 0));
    const [j11, j21, j12, j22] = [(pe.sx - p.sx) / step, (pe.sy - p.sy) / step, (pn.sx - p.sx) / step, (pn.sy - p.sy) / step];
    const det = j11 * j22 - j12 * j21;
    if (Math.abs(det) < 1e-9) break;
    lng += (ex * j22 - ey * j12) / det;
    lat += (ey * j11 - ex * j21) / det;
  }
  return { lng: clamp(lng, scene.west, scene.east), lat: clamp(lat, scene.south, scene.north) };
}

// Rosa de los vientos de 16 rumbos (abreviada y completa) para decir hacia dónde se mueve el terreno.
const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO"] as const;
const COMPASS_LONG = ["norte", "nornoreste", "noreste", "estenoreste", "este", "estesureste", "sureste", "sursureste", "sur", "sursuroeste", "suroeste", "oestesuroeste", "oeste", "oestenoroeste", "noroeste", "nornoroeste"] as const;
const moveText = (meters: number) => (meters >= 1 ? `${meters.toFixed(1)} m` : meters >= 0.01 ? `${Math.round(meters * 100)} cm` : "menos de 1 cm");

// Vista tridimensional: la superficie (costa de Panamá) arriba y cada sismo a su profundidad. Se dibuja con un
// lienzo y proyección propia: son unos cientos de puntos y evita cargar una librería 3D para esto.
export default function Quake3D({ events, filtersKey, mainshock, selectedId, replay, region, fault, felt, shaking, plates, wave, shakeGrid, mechanism, layerControls, onSelect }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 640, h: 420 });
  const [exaggeration, setExaggeration] = useState<number>(4);
  // Por defecto los puntos se colorean por profundidad: es lo que esta vista enseña mejor.
  const [colorBy, setColorBy] = useState<"depth" | "mag">("depth");
  // `expanded`: pantalla completa del navegador. `overlay`: respaldo para navegadores que no la permiten (iPhone): la
  // escena se abre sobre toda la página.
  const [expanded, setExpanded] = useState(false);
  const [overlay, setOverlay] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [surfaceOpacity, setSurfaceOpacity] = useState(90);
  // La pantalla tiembla cuando la onda de sacudida llega al centro de la vista (efecto visual; se puede apagar).
  const [screenShake, setScreenShake] = useState(true);
  // Las réplicas están ocultas por defecto: la escena enseña el sismo principal, su ruptura y la onda. Con algún filtro
  // puesto, o con la secuencia en reproducción, se muestran (es justo lo que se está pidiendo ver), y el sismo seleccionado
  // nunca se oculta. Lo que la persona elige con el interruptor vale mientras no cambie ningún filtro.
  const [aftershockChoice, setAftershockChoice] = useState<{ key: string; show: boolean } | null>(null);
  const showAftershocks = aftershockChoice && aftershockChoice.key === filtersKey ? aftershockChoice.show : filtersKey !== "";
  // Animación de la ruptura: segundo del modelo que se está mostrando (null = la ruptura ya terminada, completa).
  const [ruptureTime, setRuptureTime] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const clockRef = useRef(0);
  const autoPlayed = useRef(false);
  // Al abrir, la cámara baja desde una vista casi cenital hasta el punto de vista inicial (salvo que se pidan menos animaciones).
  const [camera, setCamera] = useState<Camera>(() => {
    if (typeof window === "undefined") return PRESETS.perspective;
    const start = homeFor(Math.min(window.innerWidth, 700) - 36, window.innerWidth < 700 ? 400 : 420);
    return reducedMotion() ? start : { ...start, yaw: start.yaw + 30, pitch: 74, zoom: 0.8 };
  });
  const introRef = useRef<() => void>(() => {});
  const frameRef = useRef<() => void>(() => {});
  const framedKey = useRef<string | null>(null);
  const zoomRef = useRef<(factor: number, fx: number, fy: number) => void>(() => {});
  const cameraRef = useRef(camera);
  const [satellite, setSatellite] = useState(() => {
    try {
      return localStorage.getItem(SAT_KEY) !== "off";
    } catch {
      return true;
    }
  });
  const [tiles, setTiles] = useState({ loaded: 0, failed: 0, total: 0 });
  const mosaicRef = useRef<Mosaic | null>(null);
  const bufferRef = useRef<HTMLCanvasElement | null>(null);
  const bufferKeyRef = useRef("");
  const waveTexRef = useRef<HTMLCanvasElement | null>(null);
  const waveBufRef = useRef<HTMLCanvasElement | null>(null);
  const hits = useRef<{ id: string; x: number; y: number; r: number; depth: number }[]>([]);
  const frame = useRef(0);

  // El navegador gestiona Escape y devuelve el mapa a su sitio al salir.
  useEffect(() => {
    const update = () => {
      const active = document.fullscreenElement === root.current?.parentElement;
      setExpanded(active);
      if (active) setOverlay(false);
    };
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);
  const toggleExpanded = async () => {
    const container = root.current?.parentElement;
    if (document.fullscreenElement === container) {
      await document.exitFullscreen();
    } else if (overlay) {
      setOverlay(false);
    } else {
      try {
        if (!container?.requestFullscreen) throw new Error("Fullscreen unavailable");
        // Algunos navegadores integrados dejan la promesa sin resolver: se espera un instante y, si no se logró, se usa el respaldo.
        await Promise.race([container.requestFullscreen(), new Promise((_, reject) => window.setTimeout(() => reject(new Error("timeout")), 900))]);
        if (document.fullscreenElement !== container) throw new Error("Fullscreen not granted");
      } catch {
        // Safari móvil y navegadores integrados: se amplía sobre la página.
        setOverlay(true);
      }
    }
  };
  // Con el respaldo abierto, Escape lo cierra y la página de abajo no se desplaza.
  useEffect(() => {
    if (!overlay) return;
    const onKeyDown = (event: KeyboardEvent) => event.key === "Escape" && setOverlay(false);
    const previous = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.documentElement.style.overflow = previous;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [overlay]);
  const isExpanded = expanded || overlay;

  useEffect(() => {
    cameraRef.current = camera;
  }, [camera]);

  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const observer = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setSize({ w: Math.max(240, Math.round(width)), h: Math.max(220, Math.round(height)) });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const baseEvents = useMemo(
    () => (showAftershocks || replay !== null || !mainshock ? events : events.filter(event => !isAftershock(event, mainshock))),
    [events, mainshock, showAftershocks, replay],
  );
  const visibleEvents = useMemo(() => {
    const picked = events.find(event => event.id === selectedId);
    return picked && !baseEvents.includes(picked) ? [...baseEvents, picked] : baseEvents;
  }, [events, baseEvents, selectedId]);

  const scene = useMemo(() => {
    const coords = baseEvents.map(event => event.geometry.coordinates);
    // Siempre Panamá completo; si algún sismo o la falla caen fuera del país (réplicas mar adentro), la caja crece para incluirlos.
    const lats = [COUNTRY.south, COUNTRY.north, ...coords.map(c => c[1])];
    const lngs = [COUNTRY.west, COUNTRY.east, ...coords.map(c => c[0])];
    if (fault) for (const sub of fault.subfaults) for (const [lng, lat] of sub.ring) { lats.push(lat); lngs.push(lng); }
    const pad = 0.3;
    const south = Math.min(...lats) - pad;
    const north = Math.max(...lats) + pad;
    const west = Math.min(...lngs) - pad;
    const east = Math.max(...lngs) + pad;
    const lat0 = (south + north) / 2;
    const lng0 = (west + east) / 2;
    const kmLng = KM_PER_DEG * Math.cos((lat0 * Math.PI) / 180);
    const toKm = (lng: number, lat: number) => ({ x: (lng - lng0) * kmLng, y: (lat - lat0) * KM_PER_LAT });
    const maxDepth = Math.max(10, ...coords.map(c => c[2] ?? 0), ...(fault ? fault.subfaults.flatMap(s => s.ring.map(r => r[2])) : []));
    const floorKm = Math.ceil(maxDepth / 10) * 10;
    return { south, north, west, east, lat0, lng0, kmLng, toKm, floorKm, halfW: ((east - west) / 2) * kmLng, halfH: ((north - south) / 2) * KM_PER_LAT };
  }, [baseEvents, fault]);

  // Imagen satelital de la superficie: se piden los mosaicos de la zona que se está viendo (el navegador los guarda un día).
  const [south, north, west, east] = [scene.south, scene.north, scene.west, scene.east].map(value => Math.round(value * 100) / 100);
  const maxTiles = size.w < 520 ? 32 : 48;
  useEffect(() => {
    if (!satellite) {
      mosaicRef.current = null;
      return;
    }
    const plan = planTiles({ west, east, south, north }, maxTiles);
    const total = (plan.x1 - plan.x0 + 1) * (plan.y1 - plan.y0 + 1);
    let live = true;
    // El conteo arranca en 0 antes de que llegue ningún mosaico (los ya guardados avisan después, en orden).
    queueMicrotask(() => live && setTiles({ loaded: 0, failed: 0, total }));
    const { mosaic, cancel } = loadMosaic(plan, ok => live && setTiles(current => ({ ...current, loaded: current.loaded + (ok ? 1 : 0), failed: current.failed + (ok ? 0 : 1) })));
    mosaicRef.current = mosaic;
    return () => {
      live = false;
      cancel();
      mosaicRef.current = null;
    };
  }, [satellite, west, east, south, north, maxTiles]);

  useEffect(() => {
    try {
      localStorage.setItem(SAT_KEY, satellite ? "on" : "off");
    } catch {
      // Sin almacenamiento, la elección vale solo para esta visita.
    }
  }, [satellite]);

  const latest = useMemo(
    () => events.reduce<Earthquake | null>((best, event) => (!best || event.properties.time > best.properties.time ? event : best), null),
    [events],
  );

  // En la reproducción de la secuencia, la vista tiembla con la magnitud de cada sismo, igual que el mapa.
  useEffect(() => {
    const el = canvas.current;
    if (el && replay && replay.index > 0 && !reducedMotion()) shakeElement(el, replay.mag);
  }, [replay]);

  const selectedEvent = useMemo(() => events.find(event => event.id === selectedId) ?? null, [events, selectedId]);

  // La ruptura se puede animar si el modelo trae el tiempo de cada celda.
  // Llegada de las ondas a cada celda del ShakeMap: cada celda de la falla emite desde el segundo en que se rompe, y a cada
  // punto la onda le llega desde la celda más cercana en tiempo. Es un cálculo con velocidades típicas, no un registro.
  const waveField = useMemo(() => {
    if (!wave || !shakeGrid || !fault || fault.durationS === null) return null;
    const { nx, ny, west, east, south, north } = shakeGrid;
    const raw = atob(shakeGrid.mmi10);
    if (raw.length !== nx * ny) return null;
    const mmi = new Uint8Array(nx * ny);
    for (let i = 0; i < raw.length; i++) mmi[i] = raw.charCodeAt(i);
    const sources = fault.subfaults.map(sub => ({
      lng: sub.ring.reduce((sum, c) => sum + c[0], 0) / 4,
      lat: sub.ring.reduce((sum, c) => sum + c[1], 0) / 4,
      depth: sub.ring.reduce((sum, c) => sum + c[2], 0) / 4,
      t: sub.t ?? 0,
    }));
    const [arrivalS, arrivalP] = [new Float32Array(nx * ny), new Float32Array(nx * ny)];
    let end = 0;
    let originLng = 0;
    let originLat = 0;
    if (mainshock) [originLng, originLat] = mainshock.geometry.coordinates;
    const nearKm = new Float32Array(nx * ny);
    for (let iy = 0; iy < ny; iy++) {
      const lat = south + ((north - south) * iy) / (ny - 1);
      const [kx, ky] = [Math.cos((lat * Math.PI) / 180) * KM_PER_DEG, KM_PER_LAT];
      for (let ix = 0; ix < nx; ix++) {
        const lng = west + ((east - west) * ix) / (nx - 1);
        let [bestS, bestP] = [Infinity, Infinity];
        for (const source of sources) {
          const d = Math.hypot((lng - source.lng) * kx, (lat - source.lat) * ky, source.depth);
          bestS = Math.min(bestS, source.t + d / VS);
          bestP = Math.min(bestP, source.t + d / VP);
        }
        const k = iy * nx + ix;
        arrivalS[k] = bestS;
        arrivalP[k] = bestP;
        nearKm[k] = Math.hypot((lng - originLng) * kx, (lat - originLat) * ky);
        // Solo cuenta lo que cae dentro de la escena (Panamá y sus alrededores) para decidir cuánto dura el recorrido.
        if (lng >= scene.west && lng <= scene.east && lat >= scene.south && lat <= scene.north) end = Math.max(end, bestS);
      }
    }
    return { nx, ny, mmi, arrivalS, arrivalP, nearKm, end: Math.ceil(end) };
  }, [wave, shakeGrid, fault, mainshock, scene]);
  // Sentido del deslizamiento: del plano del mecanismo focal que coincide con la falla del modelo (mismo rumbo) se saca hacia
  // dónde se mueve el bloque que buza (el «techo») respecto al otro; el otro lado se mueve al contrario. Solo la dirección
  // horizontal (este, norte): el largo de las flechas no representa cuánto se movió.
  const slipSense = useMemo(() => {
    if (!fault || !mechanism || fault.strike === null) return null;
    const gap = (a: number, b: number) => Math.abs((((a - b) % 360) + 540) % 360 - 180);
    const plane = mechanism.planes.reduce((best, candidate) => (gap(candidate.strike, fault.strike!) < gap(best.strike, fault.strike!) ? candidate : best));
    if (gap(plane.strike, fault.strike) > 20) return null;
    const [strike, dip, rake] = [plane.strike, plane.dip, plane.rake].map(v => (v * Math.PI) / 180);
    const updip = strike - Math.PI / 2;
    const east = Math.cos(rake) * Math.sin(strike) + Math.sin(rake) * Math.cos(dip) * Math.sin(updip);
    const north = Math.cos(rake) * Math.cos(strike) + Math.sin(rake) * Math.cos(dip) * Math.cos(updip);
    const length = Math.hypot(east, north);
    // Si el movimiento es casi vertical (falla inversa o normal pura) las flechas en planta no dicen nada.
    if (length < 0.35) return null;
    const lateral = Math.abs(plane.rake) <= 45 ? "lateral izquierdo" : Math.abs(plane.rake) >= 135 ? "lateral derecho" : "oblicuo";
    return { east: east / length, north: north / length, strike: plane.strike, dip: plane.dip, rake: plane.rake, kind: lateral };
  }, [fault, mechanism]);
  // Cuánto se mueve el terreno (en horizontal, en metros reales, sin exagerar) en el centro de la vista, calculado con las
  // ecuaciones de Okada (1985) y el deslizamiento que lleva cada celda del modelo del USGS en este segundo.
  const groundModel = useMemo(
    () => (fault && slipSense && fault.strike !== null ? buildGroundModel(fault, fault.strike, slipSense.rake) : null),
    [fault, slipSense],
  );
  const ground = useMemo(() => {
    if (!groundModel || !fault) return null;
    const center = surfaceAtCenter(scene, camera, size.w, size.h, exaggeration);
    const slips = fault.subfaults.map(sub => sub.slip * (ruptureTime === null || sub.t === null ? 1 : clamp((ruptureTime - sub.t) / Math.max(sub.rise ?? 1, 1), 0, 1)));
    const { east, north } = groundMotion(groundModel, slips, center.lng, center.lat);
    const meters = Math.hypot(east, north);
    const point = Math.round((((Math.atan2(east, north) * 180) / Math.PI + 360) % 360) / 22.5) % 16;
    // Localidad cercana (si hay una a menos de 30 km), para decir dónde se está mirando.
    const kx = Math.cos((center.lat * Math.PI) / 180) * KM_PER_DEG;
    let town: string | null = null;
    let best = 30;
    for (const candidate of TOWN_LABELS) {
      const km = Math.hypot((candidate.lng - center.lng) * kx, (candidate.lat - center.lat) * KM_PER_LAT);
      if (km < best) {
        best = km;
        town = candidate.name;
      }
    }
    return { meters, short: COMPASS[point], long: COMPASS_LONG[point], town };
  }, [groundModel, fault, scene, camera, size, exaggeration, ruptureTime]);

  // La línea de tiempo llega hasta que la onda cubre la escena (si se muestra) o hasta que termina la ruptura.
  const ruptureDuration = fault?.durationS == null ? null : Math.max(fault.durationS, waveField?.end ?? 0);
  const playSpeed = waveField ? WAVE_SPEED : RUPTURE_SPEED;
  const isPlaying = playing && ruptureDuration !== null;
  // Hasta qué distancia del epicentro ya llegó la onda S en el segundo `t`.
  const reachedKm = (t: number) => {
    if (!waveField) return null;
    let far = 0;
    for (let k = 0; k < waveField.arrivalS.length; k++) if (waveField.arrivalS[k] <= t && waveField.nearKm[k] > far) far = waveField.nearKm[k];
    return Math.round(far / 5) * 5;
  };
  // Celda del ShakeMap que cae en el centro de la vista: de ahí sale la fuerza del temblor de pantalla (solo mientras corre).
  const focusCell = useMemo(() => {
    if (!waveField || !screenShake || !playing) return -1;
    const projection = makeProjection(scene, camera, size.w, size.h, exaggeration);
    const grid = shakeGrid;
    if (!grid) return -1;
    let best = -1;
    let bestD = Infinity;
    // Basta con una de cada dos celdas: es solo para saber qué zona se mira, y así cuesta la cuarta parte al mover la cámara.
    for (let iy = 0; iy < waveField.ny; iy += 2) {
      const lat = grid.south + ((grid.north - grid.south) * iy) / (waveField.ny - 1);
      for (let ix = 0; ix < waveField.nx; ix += 2) {
        const lng = grid.west + ((grid.east - grid.west) * ix) / (waveField.nx - 1);
        const p = projection.project(projection.at(lng, lat, 0));
        const d = (p.sx - projection.originX) ** 2 + (p.sy - size.h / 2) ** 2;
        if (d < bestD) {
          bestD = d;
          best = iy * waveField.nx + ix;
        }
      }
    }
    return best;
  }, [waveField, shakeGrid, screenShake, playing, scene, camera, size, exaggeration]);
  // El lienzo tiembla cuando la onda llega al centro de la vista: leve con la P, fuerte con la S y luego se apaga. La fuerza
  // sigue la intensidad que estima el USGS en ese lugar. Es un efecto visual, no un registro.
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    if (!waveField || focusCell < 0 || ruptureTime === null || reducedMotion()) {
      el.style.transform = "";
      return;
    }
    const t = ruptureTime;
    const [tp, ts] = [waveField.arrivalP[focusCell], waveField.arrivalS[focusCell]];
    const tau = Math.max(10, (fault?.durationS ?? 40) * 0.9);
    const envelope = t >= ts ? Math.min(1, 0.3 + (t - ts) / 2) * Math.exp(-(t - ts) / tau) : t >= tp ? 0.18 * Math.min(1, (t - tp) / 1.5) : 0;
    const strength = clamp((waveField.mmi[focusCell] / 10 - 3) / 6, 0, 1) ** 1.3;
    const a = (size.w < 480 ? 7 : 12) * strength * envelope;
    if (a < 0.05) {
      el.style.transform = "";
      return;
    }
    const dx = a * (Math.sin(t * 9) + 0.6 * Math.sin(t * 15 + 1.1));
    const dy = a * 0.8 * (Math.sin(t * 12 + 2.3) + 0.5 * Math.sin(t * 7));
    // Se agranda un poco para que los bordes no queden al descubierto al moverse.
    el.style.transform = `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) scale(${(1 + (a * 3.2 + 1) / Math.min(size.w, size.h)).toFixed(4)})`;
  }, [waveField, focusCell, ruptureTime, fault, size]);
  useEffect(() => {
    const el = canvas.current;
    return () => {
      if (el) el.style.transform = "";
    };
  }, []);
  const startRupture = () => {
    clockRef.current = 0;
    setRuptureTime(0);
    setPlaying(true);
  };
  useEffect(() => {
    if (!playing || ruptureDuration === null) return;
    let raf = 0;
    let previous = -1;
    // En celulares (el lado corto de la pantalla mide menos de 600 px, de pie o acostados) se redibuja a ~30 cuadros por segundo:
    // se ve igual de fluido y gasta la mitad de batería y de procesador. Las tabletas, que sí tienen con qué, van a 60. El
    // tiempo del modelo corre a la misma velocidad en ambos casos.
    const gap = Math.min(window.innerWidth, window.innerHeight) < 600 ? 30 : 0;
    let shown = -Infinity;
    const tick = (now: number) => {
      if (previous < 0) previous = now;
      clockRef.current += ((now - previous) / 1000) * playSpeed;
      previous = now;
      if (clockRef.current >= ruptureDuration) {
        setRuptureTime(null);
        setPlaying(false);
        return;
      }
      if (now - shown >= gap) {
        shown = now;
        setRuptureTime(clockRef.current);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, ruptureDuration, playSpeed]);
  // Al abrir el 3D con la falla cargada, la ruptura se reproduce una vez (salvo que se pidan menos animaciones).
  useEffect(() => {
    if (ruptureDuration === null || autoPlayed.current || reducedMotion()) return;
    const timer = window.setTimeout(() => {
      autoPlayed.current = true;
      clockRef.current = 0;
      setRuptureTime(0);
      setPlaying(true);
    }, 2200);
    return () => window.clearTimeout(timer);
  }, [ruptureDuration]);

  const facts = useMemo(() => {
    const depths = visibleEvents.map(depthOf).filter((d): d is number => typeof d === "number");
    const fixed = depths.filter(isRoundDepth).length;
    return { count: visibleEvents.length, withDepth: depths.length, fixed, deepest: depths.length ? Math.max(...depths) : null };
  }, [visibleEvents]);

  // Cualquier cambio en la cámara, la escala vertical o los datos vuelve a pintar el lienzo.
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    el.width = Math.round(size.w * dpr);
    el.height = Math.round(size.h * dpr);
    const ctx = el.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // En tabletas táctiles (iPad) los rótulos del lienzo se ven desde más lejos: un poco más grandes.
    const ts = (parseFloat(getComputedStyle(el).getPropertyValue("--ts")) || 1) * (size.w >= 700 && window.matchMedia("(pointer: coarse)").matches ? 1.12 : 1);
    const font = (px: number, weight = 600) => `${weight} ${Math.round(px * ts * 10) / 10}px "Space Grotesk", system-ui, sans-serif`;

    const { w, h } = size;
    const { at, project, sp } = makeProjection(scene, camera, w, h, exaggeration);
    const pathTo = (i: number, sx: number, sy: number) => {
      if (i) ctx.lineTo(sx, sy);
      else ctx.moveTo(sx, sy);
    };
    const line = (a: Point, b: Point) => {
      const [pa, pb] = [project(a), project(b)];
      ctx.beginPath();
      ctx.moveTo(pa.sx, pa.sy);
      ctx.lineTo(pb.sx, pb.sy);
      ctx.stroke();
    };

    // El fondo lo pone el contenedor (CSS), para que no se note el borde del lienzo.
    ctx.clearRect(0, 0, w, h);

    const atmosphere = ctx.createRadialGradient(w * 0.5, h * 0.3, 0, w * 0.5, h * 0.45, Math.max(w, h) * 0.7);
    atmosphere.addColorStop(0, "rgba(31,104,135,.22)");
    atmosphere.addColorStop(0.65, "rgba(8,29,48,.08)");
    atmosphere.addColorStop(1, "rgba(1,8,18,.45)");
    ctx.fillStyle = atmosphere;
    ctx.fillRect(0, 0, w, h);

    // Caja de profundidad: suelo y cuatro aristas hasta la profundidad máxima.
    const [sw, se, ne, nw] = [at(scene.west, scene.south, 0), at(scene.east, scene.south, 0), at(scene.east, scene.north, 0), at(scene.west, scene.north, 0)];
    const floor = [sw, se, ne, nw].map(p => ({ ...p, z: -scene.floorKm * exaggeration }));
    // Un volumen de referencia iluminado, sin inventar estratos ni elevaciones del terreno.
    const polygon = (points: Point[]) => {
      ctx.beginPath();
      points.forEach((p, i) => { const q = project(p); pathTo(i, q.sx, q.sy); });
      ctx.closePath();
    };
    const floorCenter = project({ x: 0, y: 0, z: -scene.floorKm * exaggeration });
    ctx.save();
    ctx.translate(floorCenter.sx, floorCenter.sy + 12);
    ctx.scale(1, 0.24);
    const shadow = ctx.createRadialGradient(0, 0, 5, 0, 0, w * 0.42);
    shadow.addColorStop(0, "rgba(0,0,0,.55)");
    shadow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = shadow;
    ctx.fillRect(-w, -h * 4, w * 2, h * 8);
    ctx.restore();
    const volume = [sw, se, ne, nw];
    volume.map((p, i) => ({ i, depth: (project(p).depth + project(volume[(i + 1) % 4]).depth) / 2 }))
      .sort((a, b) => a.depth - b.depth).forEach(({ i }) => {
        const j = (i + 1) % 4;
        const top = project(volume[i]);
        const bottom = project(floor[i]);
        const glass = ctx.createLinearGradient(top.sx, top.sy, bottom.sx, bottom.sy + 1);
        glass.addColorStop(0, "rgba(66,151,179,.16)");
        glass.addColorStop(0.45, "rgba(29,76,105,.10)");
        glass.addColorStop(1, "rgba(12,27,49,.42)");
        polygon([volume[i], volume[j], floor[j], floor[i]]);
        ctx.fillStyle = glass;
        ctx.fill();
      });
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(160,190,230,.22)";
    ctx.setLineDash([]);
    ctx.beginPath();
    floor.forEach((p, i) => { const q = project(p); pathTo(i, q.sx, q.sy); });
    ctx.closePath();
    ctx.fillStyle = "rgba(15,46,66,.48)";
    ctx.fill();
    ctx.stroke();
    [sw, se, ne, nw].forEach((p, i) => line(p, floor[i]));
    ctx.strokeStyle = "rgba(98,170,189,.12)";
    for (let i = 1; i < 9; i++) {
      const x = scene.west + (scene.east - scene.west) * i / 9;
      const y = scene.south + (scene.north - scene.south) * i / 9;
      line(at(x, scene.south, scene.floorKm), at(x, scene.north, scene.floorKm));
      line(at(scene.west, y, scene.floorKm), at(scene.east, y, scene.floorKm));
    }

    // Cada 10 km de profundidad, una marca en la arista más cercana a quien mira y un plano tenue.
    const corners = [sw, se, ne, nw];
    const nearest = corners.map((p, i) => ({ i, d: project(p).depth })).sort((a, b) => b.d - a.d)[0].i;
    ctx.font = font(10, 700);
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    // Desde arriba el eje de profundidad se aplasta: si las marcas quedarían amontonadas, se omiten o se espacian.
    const tickGap = Math.abs(project({ ...corners[nearest], z: -10 * exaggeration }).sy - project(corners[nearest]).sy);
    const tickEvery = tickGap < 2 ? Infinity : Math.max(1, Math.ceil(13 / tickGap));
    for (let km = 10 * tickEvery; km <= scene.floorKm; km += 10 * tickEvery) {
      const base = corners[nearest];
      const mark = { ...base, z: -km * exaggeration };
      const q = project(mark);
      ctx.strokeStyle = "rgba(160,190,230,.18)";
      ctx.beginPath();
      ctx.moveTo(q.sx - 5, q.sy);
      ctx.lineTo(q.sx + 5, q.sy);
      ctx.stroke();
      ctx.fillStyle = "rgba(205,220,242,.85)";
      ctx.fillText(`${km} km`, q.sx - 9, q.sy);
    }

    // Imagen satelital de la superficie. Va de fondo, antes que los sismos, para que estos se vean nítidos encima (la
    // profundidad la dan el hilo, la caja y las marcas de km). Se pinta opaca en un lienzo aparte, así no se notan las
    // uniones entre triángulos, y luego se mezcla.
    const mosaic = satellite ? mosaicRef.current : null;
    if (mosaic && tiles.loaded > 0) {
      // Conserva la nitidez en pantallas Retina sin superar 2× la resolución CSS.
      const buffer = (bufferRef.current ??= document.createElement("canvas"));
      if (buffer.width !== Math.round(w * dpr) || buffer.height !== Math.round(h * dpr)) {
        buffer.width = Math.round(w * dpr);
        buffer.height = Math.round(h * dpr);
      }
      const bctx = buffer.getContext("2d");
      if (bctx) {
        // La imagen solo se vuelve a pintar si cambió algo que la afecta (cámara, tamaño, escena, mosaicos): mientras corre la
        // animación se reutiliza, que es lo que más alivia a los teléfonos.
        const key = [w, h, dpr, camera.yaw, camera.pitch, camera.zoom, camera.px, camera.py, exaggeration, scene.west, scene.east, scene.south, scene.north, scene.floorKm, tiles.loaded, tiles.total].join("|");
        if (bufferKeyRef.current !== key) {
          bufferKeyRef.current = key;
          bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          bctx.clearRect(0, 0, w, h);
          bctx.imageSmoothingQuality = "high";
          const cols = clamp(Math.round(w / 40), 12, 28);
          const rows = clamp(Math.round((cols * scene.halfH) / scene.halfW), 8, 24);
          paintMosaic(bctx, mosaic, scene, (lng, lat) => {
            const q = project(at(lng, lat, 0));
            return { sx: q.sx, sy: q.sy };
          }, cols, rows);
        }
        ctx.save();
        ctx.globalAlpha = SAT_ALPHA * surfaceOpacity / 100;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(buffer, 0, 0, w, h);
        ctx.restore();
      }
    }

    // Planos de referencia cada 10 km bajo la superficie: así se lee a qué nivel está cada sismo, también de lado.
    ctx.setLineDash([]);
    ctx.lineWidth = 0.9;
    ctx.strokeStyle = "rgba(148,197,213,.14)";
    const levelStep = Math.max(10, Math.ceil(scene.floorKm / 60) * 10);
    for (let level = levelStep; level < scene.floorKm; level += levelStep) {
      ctx.beginPath();
      [sw, se, ne, nw].forEach((c, i) => { const q = project({ ...c, z: -level * exaggeration }); pathTo(i, q.sx, q.sy); });
      ctx.closePath();
      ctx.stroke();
    }

    // Todo lo que está bajo tierra se ordena de lejos a cerca.
    type Drawable = { depth: number; draw: () => void };
    const drawables: Drawable[] = [];
    const items: Item[] = visibleEvents.map(event => {
      const [lng, lat, depthRaw] = event.geometry.coordinates;
      const depth = depthRaw ?? 0;
      const mag = event.properties.mag;
      const m = mag ?? 0;
      const tier: Item["tier"] = m >= 5 ? "high" : m >= 3 ? "mid" : "low";
      const base = tier === "high" ? 6.5 + (m - 5) * 2.2 : tier === "mid" ? 3.4 + (m - 3) * 1.2 : 2.4;
      return { event, mag, depth, fixed: isRoundDepth(depthRaw), tier, radius: base, p: at(lng, lat, depth), top: at(lng, lat, 0) };
    });

    // Las celdas de la falla se pintan después de los sismos, algo translúcidas: así el reparto del deslizamiento se lee
    // limpio y los sismos que quedan detrás se ven a través.
    const faultCells: Drawable[] = [];
    if (fault) {
      for (const sub of fault.subfaults) {
        const projected = sub.ring.map(([lng, lat, d]) => project(at(lng, lat, d)));
        // Con la animación en marcha, cada celda se desliza desde su segundo de inicio hasta su deslizamiento final.
        const progress = ruptureTime === null || sub.t === null ? 1 : clamp((ruptureTime - sub.t) / Math.max(sub.rise ?? 1, 1), 0, 1);
        faultCells.push({
          depth: projected.reduce((sum, q) => sum + q.depth, 0) / 4,
          draw: () => {
            ctx.beginPath();
            projected.forEach((q, i) => pathTo(i, q.sx, q.sy));
            ctx.closePath();
            if (progress === 0) {
              ctx.fillStyle = "rgba(120,140,190,.10)";
              ctx.fill();
              ctx.strokeStyle = "rgba(190,205,240,.22)";
              ctx.lineWidth = 0.5;
              ctx.stroke();
              return;
            }
            ctx.fillStyle = slipColor(sub.slip * progress, fault.maxSlipM, 0.8);
            ctx.fill();
            // El frente de la ruptura (celdas que se están moviendo ahora) se marca con un borde claro.
            const moving = ruptureTime !== null && progress < 1;
            ctx.strokeStyle = moving ? "rgba(255,255,255,.95)" : "rgba(20,8,40,.3)";
            ctx.lineWidth = moving ? 1.4 : 0.5;
            ctx.stroke();
          },
        });
      }
    }

    const pending = (event: Earthquake) => replay !== null && (replay.index === 0 || event.properties.time > replay.time);
    const currentReplay = (event: Earthquake) => replay !== null && replay.index > 0 && event.properties.time === replay.time;
    hits.current = [];
    const labeled: { sx: number; sy: number; text: string; rank: number }[] = [];
    for (const item of items) {
      if (pending(item.event)) continue;
      const q = project(item.p);
      const top = project(item.top);
      const isMain = item.event.id === mainshock?.id;
      const isLatest = item.event.id === latest?.id;
      const selected = item.event.id === selectedId;
      const color = isMain ? COLORS.main : isLatest ? COLORS.latest : colorBy === "depth" ? depthColor(item.depth) : COLORS[item.tier];
      const markerScale = clamp(Math.sqrt(w / 720) * Math.sqrt(camera.zoom), 0.9, 1.6);
      const r = (isMain ? 11 : item.radius) * Math.min(1.35, Math.max(0.75, q.k)) * markerScale;
      drawables.push({
        depth: q.depth,
        draw: () => {
          // Hilo vertical desde el epicentro (en la superficie) hasta el hipocentro: tenue en los pequeños para que no
          // se llene de rayas, firme en los fuertes y en el seleccionado.
          if (selected || item.tier !== "low") {
            ctx.strokeStyle = selected ? "rgba(255,255,255,.8)" : item.tier === "high" ? "rgba(210,225,250,.45)" : "rgba(190,210,240,.2)";
            ctx.lineWidth = selected ? 1.4 : 0.8;
            ctx.setLineDash(item.tier === "high" || selected ? [] : [2, 3]);
            ctx.beginPath();
            ctx.moveTo(top.sx, top.sy);
            ctx.lineTo(q.sx, q.sy);
            ctx.stroke();
            ctx.setLineDash([]);
          }
          // Resplandor del sismo principal y de las réplicas de M 6 o más.
          if (isMain || (item.mag ?? 0) >= 6) {
            const glow = ctx.createRadialGradient(q.sx, q.sy, r * 0.5, q.sx, q.sy, r * (isMain ? 3 : 2.4));
            glow.addColorStop(0, `${color}${isMain ? "70" : "50"}`);
            glow.addColorStop(1, `${color}00`);
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(q.sx, q.sy, r * (isMain ? 3 : 2.4), 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.beginPath();
          ctx.arc(q.sx, q.sy, r, 0, Math.PI * 2);
          if (item.fixed && !isMain) {
            ctx.fillStyle = `${color}2e`;
            ctx.fill();
            ctx.lineWidth = item.tier === "high" ? 1.8 : 1.2;
            ctx.strokeStyle = color;
            ctx.stroke();
          } else {
            const sphere = ctx.createRadialGradient(q.sx - r * 0.32, q.sy - r * 0.38, r * 0.05, q.sx, q.sy, r);
            sphere.addColorStop(0, "#ffffff");
            sphere.addColorStop(0.28, color);
            sphere.addColorStop(0.72, color);
            sphere.addColorStop(1, "#12233d");
            ctx.fillStyle = sphere;
            ctx.globalAlpha = item.tier === "low" ? 0.9 : 0.96;
            ctx.fill();
            ctx.globalAlpha = 1;
            ctx.lineWidth = isMain || item.tier === "high" ? 1.8 : item.tier === "mid" ? 1 : 0.6;
            ctx.strokeStyle = item.tier === "low" ? "rgba(7,21,43,.65)" : "rgba(255,255,255,.9)";
            ctx.stroke();
          }
          if (currentReplay(item.event)) {
            ctx.beginPath();
            ctx.arc(q.sx, q.sy, r + 7, 0, Math.PI * 2);
            ctx.lineWidth = 2.2;
            ctx.strokeStyle = "#ff8a92";
            ctx.stroke();
          }
          if (selected) {
            ctx.beginPath();
            ctx.arc(q.sx, q.sy, r + 5, 0, Math.PI * 2);
            ctx.lineWidth = 2.4;
            ctx.strokeStyle = "#ffffff";
            ctx.stroke();
          }
        },
      });
      hits.current.push({ id: item.event.id, x: q.sx, y: q.sy, r: Math.max(r + 5, 11), depth: q.depth });
      if (isMain || (item.mag ?? 0) >= 6 || selected) labeled.push({ sx: q.sx, sy: q.sy - r - 7, text: `M ${item.mag === null ? "—" : item.mag.toFixed(1)}${selected ? ` · ${km(item.depth)}` : ""}`, rank: selected ? 99 : item.mag ?? 0 });
    }

    // Fondo: lo más lejano primero. El suelo (superficie) se pinta entre lo profundo y los epicentros.
    drawables.sort((a, b) => a.depth - b.depth);
    drawables.forEach(d => d.draw());
    faultCells.sort((a, b) => a.depth - b.depth).forEach(d => d.draw());
    // Mientras se anima, el punto donde empezó la ruptura (el hipocentro) late con anillos que se abren.
    if (ruptureTime !== null && mainshock) {
      const [hLng, hLat, hDepth] = mainshock.geometry.coordinates;
      const hq = project(at(hLng, hLat, hDepth ?? 0));
      ctx.save();
      for (let ring = 0; ring < 2; ring++) {
        const phase = ((ruptureTime * 0.8 + ring * 0.5) % 1);
        ctx.beginPath();
        ctx.arc(hq.sx, hq.sy, 6 + phase * 26, 0, Math.PI * 2);
        ctx.lineWidth = 2;
        ctx.strokeStyle = `rgba(255,244,190,${(1 - phase) * 0.9})`;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(hq.sx, hq.sy, 4, 0, Math.PI * 2);
      ctx.fillStyle = "#fff4be";
      ctx.fill();
      ctx.restore();
    }

    // Contorno de la ruptura: el rectángulo de la falla, su huella en la superficie (punteada) y los postes que los unen.
    const faultCorners = fault ? faultOutline(fault, fault.strike ?? 288) : null;
    const faultEdge = faultCorners?.map(([lng, lat, d]) => ({ p: project(at(lng, lat, d)), top: project(at(lng, lat, 0)) })) ?? null;
    if (faultEdge) {
      ctx.save();
      ctx.lineJoin = "round";
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = "rgba(255,244,190,.85)";
      ctx.beginPath();
      faultEdge.forEach((c, i) => pathTo(i, c.top.sx, c.top.sy));
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([2, 3]);
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(255,244,190,.6)";
      faultEdge.forEach(c => {
        ctx.beginPath();
        ctx.moveTo(c.top.sx, c.top.sy);
        ctx.lineTo(c.p.sx, c.p.sy);
        ctx.stroke();
      });
      ctx.setLineDash([]);
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = "rgba(255,255,255,.96)";
      ctx.beginPath();
      faultEdge.forEach((c, i) => pathTo(i, c.p.sx, c.p.sy));
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }

    // Superficie: plano translúcido, cuadrícula, costa de Panamá, «lo que se sintió» y epicentros.
    ctx.beginPath();
    [sw, se, ne, nw].forEach((p, i) => { const q = project(p); pathTo(i, q.sx, q.sy); });
    ctx.closePath();
    ctx.fillStyle = `rgba(74,159,186,${0.1 * surfaceOpacity / 100})`;
    ctx.fill();
    ctx.strokeStyle = "rgba(139,221,231,.7)";
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.lineWidth = 0.7;
    ctx.strokeStyle = "rgba(190,215,250,.10)";
    ctx.font = font(9.5, 700);
    ctx.fillStyle = "rgba(205,220,242,.7)";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    // Texto con contorno oscuro para que se lea sobre la imagen satelital.
    const outlined = (text: string, x: number, y: number) => {
      ctx.save();
      ctx.lineJoin = "round";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(7,21,43,.85)";
      ctx.strokeText(text, x, y);
      ctx.restore();
      ctx.fillText(text, x, y);
    };
    // De lado la superficie se ve de canto: sin cuadrícula ni grados, que solo se amontonarían.
    const edgeOn = sp < 0.25;
    for (let lat = Math.ceil(scene.south); lat <= scene.north && !edgeOn; lat++) {
      line(at(scene.west, lat, 0), at(scene.east, lat, 0));
      const q = project(at(scene.west, lat, 0));
      outlined(`${lat}° N`, q.sx - 18, q.sy - 5);
    }
    for (let lng = Math.ceil(scene.west); lng <= scene.east && !edgeOn; lng++) {
      line(at(lng, scene.south, 0), at(lng, scene.north, 0));
      const q = project(at(lng, scene.south, 0));
      outlined(`${Math.abs(lng)}° O`, q.sx, q.sy + 6);
    }

    // Todo lo que va sobre la superficie (cuadros, curvas, costa, provincia) se recorta a su rectángulo.
    ctx.save();
    ctx.beginPath();
    [sw, se, ne, nw].forEach((p, i) => { const q = project(p); pathTo(i, q.sx, q.sy); });
    ctx.closePath();
    ctx.clip();
    // Onda de sacudida: cada celda del ShakeMap se descubre cuando llega la onda S (con su color de intensidad) y, antes, apenas
    // se insinúa la llegada de la P. El frente reciente va más claro. Sin animación se ve el campo completo.
    if (waveField && shakeGrid) {
      const { nx, ny, mmi, arrivalS, arrivalP } = waveField;
      const tex = (waveTexRef.current ??= document.createElement("canvas"));
      if (tex.width !== nx || tex.height !== ny) {
        tex.width = nx;
        tex.height = ny;
      }
      const tctx = tex.getContext("2d");
      const buf = (waveBufRef.current ??= document.createElement("canvas"));
      if (buf.width !== w || buf.height !== h) {
        buf.width = w;
        buf.height = h;
      }
      const bctx = buf.getContext("2d");
      if (tctx && bctx) {
        const image = tctx.createImageData(nx, ny);
        const clock = ruptureTime ?? Infinity;
        for (let iy = 0; iy < ny; iy++) {
          for (let ix = 0; ix < nx; ix++) {
            const k = iy * nx + ix;
            const o = ((ny - 1 - iy) * nx + ix) * 4; // la fila 0 de la imagen es el norte
            if (clock >= arrivalS[k]) {
              const [r, g, b] = intensityRgb(mmi[k] / 10);
              const front = clock === Infinity ? 0 : Math.max(0, 1 - (clock - arrivalS[k]) / 3.5);
              image.data[o] = r + (255 - r) * front * 0.7;
              image.data[o + 1] = g + (255 - g) * front * 0.7;
              image.data[o + 2] = b + (255 - b) * front * 0.7;
              image.data[o + 3] = 255 * (0.62 + front * 0.38);
            } else if (clock >= arrivalP[k]) {
              image.data[o] = 150;
              image.data[o + 1] = 195;
              image.data[o + 2] = 255;
              image.data[o + 3] = 50;
            }
          }
        }
        tctx.putImageData(image, 0, 0);
        const [hx, hy] = [(shakeGrid.east - shakeGrid.west) / (nx - 1) / 2, (shakeGrid.north - shakeGrid.south) / (ny - 1) / 2];
        const tb = { west: shakeGrid.west - hx, east: shakeGrid.east + hx, south: shakeGrid.south - hy, north: shakeGrid.north + hy };
        bctx.setTransform(1, 0, 0, 1, 0, 0);
        bctx.clearRect(0, 0, w, h);
        bctx.imageSmoothingEnabled = true;
        bctx.imageSmoothingQuality = "high";
        const cols = clamp(Math.round(w / 34), 10, 28);
        const rows = clamp(Math.round((cols * scene.halfH) / scene.halfW), 8, 22);
        paintTexture(bctx, tex, (lng, lat) => [((lng - tb.west) / (tb.east - tb.west)) * nx, ((tb.north - lat) / (tb.north - tb.south)) * ny], scene, (lng, lat) => {
          const q = project(at(lng, lat, 0));
          return { sx: q.sx, sy: q.sy };
        }, cols, rows, true);
        ctx.drawImage(buf, 0, 0, w, h);
      }
    }

    if (felt) {
      for (const [s, w2, n, e, cdi] of felt.cells) {
        const cell = [at(w2, s, 0), at(e, s, 0), at(e, n, 0), at(w2, n, 0)].map(project);
        ctx.beginPath();
        cell.forEach((q, i) => (i ? ctx.lineTo(q.sx, q.sy) : ctx.moveTo(q.sx, q.sy)));
        ctx.closePath();
        ctx.fillStyle = intensityColor(cdi, 0.62);
        ctx.fill();
      }
    }

    if (shaking) {
      ctx.lineJoin = "round";
      for (const { value, lines } of shaking) {
        ctx.strokeStyle = intensityColor(value, 0.95);
        ctx.lineWidth = Number.isInteger(value) ? 2.2 : 1.4;
        for (const lineCoords of lines) {
          ctx.beginPath();
          lineCoords.forEach(([lng, lat], i) => { const q = project(at(lng, lat, 0)); pathTo(i, q.sx, q.sy); });
          ctx.stroke();
        }
      }
    }

    // Límites de todas las provincias y comarcas, tenues, para que los nombres tengan referencia.
    ctx.lineJoin = "round";
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = "rgba(210,239,237,.22)";
    for (const division of PROVINCES) {
      for (const ring of division.rings) {
        ctx.beginPath();
        ring.forEach(([lng, lat], i) => { const q = project(at(lng, lat, 0)); pathTo(i, q.sx, q.sy); });
        ctx.closePath();
        ctx.stroke();
      }
    }

    ctx.lineJoin = "round";
    ctx.lineWidth = mosaic && tiles.loaded > 0 ? 1.1 : 1.5;
    ctx.strokeStyle = mosaic && tiles.loaded > 0 ? "rgba(168,230,222,.62)" : "rgba(190,245,233,.88)";
    ctx.fillStyle = mosaic && tiles.loaded > 0 ? "rgba(255,255,255,0)" : "rgba(70,159,151,.20)";
    for (const ring of PANAMA_RINGS) {
      ctx.beginPath();
      ring.forEach(([lng, lat], i) => { const q = project(at(lng, lat, 0)); pathTo(i, q.sx, q.sy); });
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    const province = region ? PROVINCE_BY_ID.get(region) : undefined;
    if (province) {
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 1.8;
      ctx.strokeStyle = "#ffffff";
      for (const ring of province.rings) {
        ctx.beginPath();
        ring.forEach(([lng, lat], i) => { const q = project(at(lng, lat, 0)); pathTo(i, q.sx, q.sy); });
        ctx.closePath();
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    // Límites entre placas tectónicas: un color por tipo (subducción con trazo discontinuo), con un contorno oscuro.
    if (plates) {
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (const boundary of PLATE_BOUNDARIES) {
        ctx.beginPath();
        boundary.points.forEach(([lng, lat], i) => { const q = project(at(lng, lat, 0)); pathTo(i, q.sx, q.sy); });
        ctx.setLineDash([]);
        ctx.strokeStyle = "rgba(6,18,38,.8)";
        ctx.lineWidth = 5.2;
        ctx.stroke();
        ctx.setLineDash(boundary.kind === "subduction" ? [10, 5] : []);
        ctx.strokeStyle = KIND_INFO[boundary.kind].color;
        ctx.lineWidth = 2.6;
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.lineCap = "butt";
    }

    ctx.restore();

    // Rótulo de la ruptura (bajo su borde inferior; arriba suele estar el enjambre de réplicas). Se calcula antes que los
    // nombres para reservarle el sitio.
    let ruptureLabel: { text: string; sub: string | null; x: number; y: number; width: number } | null = null;
    if (fault && faultEdge && !edgeOn) {
      const size1 = fault.lengthKm !== null && fault.widthKm !== null ? ` · ${Math.round(fault.lengthKm)} × ${Math.round(fault.widthKm)} km` : "";
      const text = `Ruptura${size1} · máx. ${fault.maxSlipM.toFixed(1)} m`;
      const sub = slipSense ? "Flechas: sentido del deslizamiento (USGS) · no a escala" : null;
      ctx.save();
      ctx.font = font(10.5, 800);
      let width = ctx.measureText(text).width;
      if (sub) {
        ctx.font = font(9.5, 700);
        width = Math.max(width, ctx.measureText(sub).width);
      }
      ctx.restore();
      const midX = (faultEdge[2].p.sx + faultEdge[3].p.sx) / 2;
      const x = clamp(midX, width / 2 + 6, w - width / 2 - 6);
      let y = Math.max(faultEdge[2].p.sy, faultEdge[3].p.sy) + 13;
      // El crédito de la imagen satelital (abajo; en el celular, a la derecha un poco más arriba) no debe quedar tapado: si el
      // rótulo cae encima, se sube sobre él.
      const credit = w < 480 ? { x0: w - 8 - 215, x1: w - 8, y0: h - 72, y1: h - 54 } : { x0: 72, x1: 72 + 215, y0: h - 26, y1: h - 8 };
      const [top, bottom] = [y - 14, y + (sub ? 18 : 4)];
      if (x + width / 2 > credit.x0 && x - width / 2 < credit.x1 && bottom > credit.y0 && top < credit.y1) y = credit.y0 - (sub ? 22 : 8);
      ruptureLabel = { text, sub, width, x, y };
    }

    // Nombres de las provincias y, al acercar, de las cabeceras de distrito. Cada uno se omite si choca con otro ya
    // puesto; de canto (sin ver la superficie) no se escriben.
    if (!edgeOn) {
      // Primero se reserva el sitio de las etiquetas de magnitud ("M 7.7"), que mandan sobre los nombres.
      const placed: { x0: number; y0: number; x1: number; y1: number }[] = labeled.map(l => ({ x0: l.sx - 32, x1: l.sx + 32, y0: l.sy - 14, y1: l.sy + 5 }));
      if (ruptureLabel) placed.push({ x0: ruptureLabel.x - ruptureLabel.width / 2 - 4, x1: ruptureLabel.x + ruptureLabel.width / 2 + 4, y0: ruptureLabel.y - 14, y1: ruptureLabel.y + (ruptureLabel.sub ? 18 : 4) });
      const inside = (lng: number, lat: number) => lng >= scene.west && lng <= scene.east && lat >= scene.south && lat <= scene.north;
      const put = (text: string, lng: number, lat: number, px: number, weight: number, alpha: number, town: boolean, fill = "#ffffff", dy = 0) => {
        if (!inside(lng, lat)) return;
        const projected = project(at(lng, lat, 0));
        const q = { ...projected, sy: projected.sy + dy };
        ctx.font = font(px, weight);
        const width = ctx.measureText(text).width;
        const x = town ? q.sx + 5 : q.sx - width / 2;
        const box = { x0: x - 3, y0: q.sy - px * ts - 2, x1: x + width + 3, y1: q.sy + 3 };
        if (box.x0 < 2 || box.x1 > w - 2 || box.y0 < 2 || box.y1 > h - 2) return;
        if (placed.some(o => box.x0 < o.x1 && box.x1 > o.x0 && box.y0 < o.y1 && box.y1 > o.y0)) return;
        placed.push(box);
        ctx.save();
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        ctx.lineJoin = "round";
        ctx.lineWidth = 3.2;
        ctx.strokeStyle = "rgba(6,18,38,.9)";
        ctx.globalAlpha = alpha;
        ctx.strokeText(text, x, q.sy);
        ctx.fillStyle = fill;
        ctx.fillText(text, x, q.sy);
        if (town) {
          ctx.beginPath();
          ctx.arc(q.sx, q.sy - px * ts * 0.32, 2.1, 0, Math.PI * 2);
          ctx.fillStyle = "#ffffff";
          ctx.fill();
        }
        ctx.restore();
      };
      const boost = Math.min(1.5, Math.max(0.95, Math.sqrt(camera.zoom)));
      for (const label of PROVINCE_LABELS) {
        put(label.name.toUpperCase(), label.lng, label.lat, 10.5 * boost, 800, region === null || region === label.id ? 0.95 : 0.6, false);
      }
      if (plates) {
        for (const label of PLATE_LABELS) put(PLATE_NAMES[label.code].toUpperCase(), label.lng, label.lat, 10 * boost, 800, 0.95, false, "#8de8ff");
        // Cada límite se rotula con las dos placas que separa («Nazca | Panamá»), junto a su tramo visible, así el
        // nombre no depende de que el centro de la placa caiga dentro de la escena.
        const seen = new Set<string>();
        for (const boundary of PLATE_BOUNDARIES) {
          const key = `${boundary.a}-${boundary.b}-${boundary.kind}`;
          const visible = boundary.points.filter(([lng, lat]) => inside(lng, lat));
          if (seen.has(key) || visible.length < 2) continue;
          seen.add(key);
          const [lng, lat] = visible[Math.floor(visible.length / 2)];
          put(`${PLATE_SHORT[boundary.a]} | ${PLATE_SHORT[boundary.b]}`.toUpperCase(), lng, lat, 9 * boost, 800, 0.97, false, KIND_INFO[boundary.kind].color, -9);
        }
      }
      if (camera.zoom >= 1.5) {
        const count = clamp(Math.round((camera.zoom - 1.2) * 16), 8, TOWN_LABELS.length);
        for (const town of TOWN_LABELS.slice(0, count)) put(town.name, town.lng, town.lat, 9.5 * boost, 700, 0.92, true);
      }
    }

    if (ruptureLabel) {
      ctx.save();
      ctx.font = font(10.5, 800);
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.lineJoin = "round";
      ctx.lineWidth = 3.4;
      ctx.strokeStyle = "rgba(20,8,40,.92)";
      ctx.strokeText(ruptureLabel.text, ruptureLabel.x, ruptureLabel.y);
      ctx.fillStyle = "#fff4be";
      ctx.fillText(ruptureLabel.text, ruptureLabel.x, ruptureLabel.y);
      if (ruptureLabel.sub) {
        ctx.font = font(9.5, 700);
        ctx.lineWidth = 3;
        ctx.strokeText(ruptureLabel.sub, ruptureLabel.x, ruptureLabel.y + 13);
        ctx.fillStyle = "rgba(255,244,190,.88)";
        ctx.fillText(ruptureLabel.sub, ruptureLabel.x, ruptureLabel.y + 13);
      }
      ctx.restore();
    }

    // Flechas del sentido del deslizamiento: una a cada lado de la falla, sobre la superficie. Crecen con el deslizamiento
    // que va liberando la ruptura; su largo no es la distancia que se movió el terreno (por eso el rótulo dice «no a escala»).
    if (fault && faultCorners && slipSense && !edgeOn) {
      let released = 0;
      let total = 0;
      for (const sub of fault.subfaults) {
        total += sub.slip;
        released += sub.slip * (ruptureTime === null ? 1 : sub.t === null ? 0 : clamp((ruptureTime - sub.t) / Math.max(sub.rise ?? 1, 1), 0, 1));
      }
      const progress = total > 0 ? released / total : 1;
      const cLng = faultCorners.reduce((sum, c) => sum + c[0], 0) / faultCorners.length;
      const cLat = faultCorners.reduce((sum, c) => sum + c[1], 0) / faultCorners.length;
      const kx = Math.cos((cLat * Math.PI) / 180) * KM_PER_DEG;
      const onSurface = (eastKm: number, northKm: number) => project(at(cLng + eastKm / kx, cLat + northKm / KM_PER_LAT, 0));
      const dipSide = [Math.sin(((slipSense.strike + 90) * Math.PI) / 180), Math.cos(((slipSense.strike + 90) * Math.PI) / 180)];
      const reach = 24 * (0.35 + 0.65 * progress);
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.globalAlpha = 0.55 + 0.45 * progress;
      for (const sign of [1, -1]) {
        const [mx, my] = [dipSide[0] * 13 * sign, dipSide[1] * 13 * sign];
        const [dx, dy] = [slipSense.east * sign, slipSense.north * sign];
        const tail = onSurface(mx - dx * reach, my - dy * reach);
        const tip = onSurface(mx + dx * reach, my + dy * reach);
        const angle = Math.atan2(tip.sy - tail.sy, tip.sx - tail.sx);
        const head = clamp(Math.hypot(tip.sx - tail.sx, tip.sy - tail.sy) * 0.4, 6, 11);
        for (const [width, color] of [[5.2, "rgba(20,8,40,.9)"], [2.4, "#fff4be"]] as const) {
          ctx.lineWidth = width;
          ctx.strokeStyle = color;
          ctx.beginPath();
          ctx.moveTo(tail.sx, tail.sy);
          ctx.lineTo(tip.sx, tip.sy);
          ctx.moveTo(tip.sx - head * Math.cos(angle - 0.5), tip.sy - head * Math.sin(angle - 0.5));
          ctx.lineTo(tip.sx, tip.sy);
          ctx.lineTo(tip.sx - head * Math.cos(angle + 0.5), tip.sy - head * Math.sin(angle + 0.5));
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    // Epicentros: un punto sobre la superficie, justo encima de cada sismo.
    // Solo los de M 3 o más (y el seleccionado): cientos de puntos blancos tapaban los colores de la zona de réplicas.
    for (const item of items) {
      if (pending(item.event) || (item.tier === "low" && item.event.id !== selectedId)) continue;
      const q = project(item.top);
      ctx.beginPath();
      ctx.arc(q.sx, q.sy, item.tier === "high" ? 2 : 1.4, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,.6)";
      ctx.fill();
    }

    // Etiquetas al final para que nada las tape.
    ctx.font = font(11.5, 800);
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    // Sin que se pisen: primero el seleccionado y los más fuertes; el que choca con uno ya puesto se omite.
    const placedLabels: { sx: number; sy: number }[] = [];
    for (const label of labeled.sort((a, b) => b.rank - a.rank)) {
      if (placedLabels.some(other => Math.abs(other.sx - label.sx) < 72 && Math.abs(other.sy - label.sy) < 25)) continue;
      placedLabels.push(label);
      const labelWidth = ctx.measureText(label.text).width + 16;
      ctx.beginPath();
      ctx.roundRect(label.sx - labelWidth / 2, label.sy - 15, labelWidth, 22, 5);
      ctx.fillStyle = "rgba(5,18,29,.9)";
      ctx.fill();
      ctx.lineWidth = 0.8;
      ctx.strokeStyle = "rgba(163,221,230,.4)";
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.fillText(label.text, label.sx, label.sy);
    }

    // Brújula: hacia dónde queda el norte en pantalla (la vista de frente de la falla deja el mapa «al revés»).
    {
      const [cx, cy, r] = [38, h - 42, 14];
      const yawRad = (camera.yaw * Math.PI) / 180;
      const [dx, dy] = [-Math.sin(yawRad), -Math.cos(yawRad) * Math.max(0.35, sp)];
      const len = Math.hypot(dx, dy) || 1;
      const [ux, uy] = [dx / len, dy / len];
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r + 5, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(6,18,38,.62)";
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,.35)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.strokeStyle = "#ffffff";
      ctx.fillStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(cx - ux * r * 0.6, cy - uy * r * 0.6);
      ctx.lineTo(cx + ux * r * 0.75, cy + uy * r * 0.75);
      ctx.stroke();
      ctx.beginPath();
      const [tx, ty] = [cx + ux * r * 0.95, cy + uy * r * 0.95];
      ctx.moveTo(tx, ty);
      ctx.lineTo(tx - ux * 6 - uy * 3.5, ty - uy * 6 + ux * 3.5);
      ctx.lineTo(tx - ux * 6 + uy * 3.5, ty - uy * 6 - ux * 3.5);
      ctx.closePath();
      ctx.fill();
      ctx.font = font(9, 800);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("N", cx + ux * (r + 12), cy + uy * (r + 12));
      ctx.restore();
    }

    // Atribución de la imagen satelital, siempre a la vista. En pantallas anchas va abajo a la izquierda, junto a la brújula;
    // en el celular, justo encima de la barra de navegación.
    if (mosaic && tiles.loaded > 0) {
      const narrow = w < 480;
      const credit = "Imagen © Esri, Maxar, Earthstar Geographics";
      ctx.font = font(9.5, 600);
      ctx.textAlign = narrow ? "right" : "left";
      ctx.textBaseline = "alphabetic";
      ctx.lineWidth = 3;
      ctx.lineJoin = "round";
      ctx.strokeStyle = "rgba(7,21,43,.85)";
      ctx.fillStyle = "rgba(235,242,252,.9)";
      const [cx, cy] = narrow ? [w - 8, h - 60] : [72, h - 14];
      ctx.strokeText(credit, cx, cy);
      ctx.fillText(credit, cx, cy);
    }
  }, [camera, size, scene, visibleEvents, exaggeration, mainshock, latest, selectedId, replay, region, fault, felt, shaking, plates, waveField, shakeGrid, slipSense, satellite, tiles, colorBy, surfaceOpacity, ruptureTime]);

  // Cambia de cámara con una transición corta (o de golpe si la persona pidió menos movimiento).
  const goTo = (target: Camera, ms = 650) => {
    cancelAnimationFrame(frame.current);
    if (reducedMotion()) {
      setCamera(target);
      return;
    }
    const from = cameraRef.current;
    let begin = -1;
    const step = (now: number) => {
      if (begin < 0) begin = now;
      const t = Math.min(1, (now - begin) / ms);
      const e = 1 - Math.pow(1 - t, 3);
      setCamera({ yaw: from.yaw + (target.yaw - from.yaw) * e, pitch: from.pitch + (target.pitch - from.pitch) * e, zoom: from.zoom + (target.zoom - from.zoom) * e, px: from.px + (target.px - from.px) * e, py: from.py + (target.py - from.py) * e });
      if (t < 1) frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
  };
  // Punto de vista inicial según el tamaño real del escenario en este instante (el estado `size` puede ir un cuadro atrasado
  // justo al abrir).
  const home = (): Camera => {
    const stage = box.current;
    return homeFor(stage?.clientWidth || size.w, stage?.clientHeight || size.h);
  };
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  useEffect(() => {
    if (reducedMotion()) return;
    const timer = window.setTimeout(() => introRef.current(), 300);
    return () => window.clearTimeout(timer);
  }, []);

  // Acercar manteniendo fijo el punto (fx, fy) del lienzo: así el zoom va hacia donde se mira, no al centro.
  const zoomAt = (factor: number, fx: number, fy: number) =>
    setCamera(c => {
      const zoom = clamp(c.zoom * factor, 0.5, 5);
      const k = zoom / c.zoom;
      const [marginL, marginR] = marginsFor(size.w);
      const cx = marginL + (size.w - marginL - marginR) / 2;
      const cy = size.h / 2;
      const limit = size.w * 1.5 * zoom;
      return { ...c, zoom, px: clamp(fx - cx - (fx - cx - c.px) * k, -limit, limit), py: clamp(fy - cy - (fy - cy - c.py) * k, -limit, limit) };
    });
  const panBy = (dx: number, dy: number) =>
    setCamera(c => {
      const limit = size.w * 1.5 * c.zoom;
      return { ...c, px: clamp(c.px + dx, -limit, limit), py: clamp(c.py + dy, -limit, limit) };
    });

  useEffect(() => {
    introRef.current = () => goTo(home(), 1200);
    zoomRef.current = zoomAt;
  });

  const drag = useRef<{ pointers: Map<number, { x: number; y: number }>; moved: number; gap: number | null; mid: { x: number; y: number } | null; pan: boolean } | null>(null);
  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    cancelAnimationFrame(frame.current);
    event.currentTarget.setPointerCapture(event.pointerId);
    const state = drag.current ?? { pointers: new Map(), moved: 0, gap: null, mid: null, pan: false };
    state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (state.pointers.size === 1) {
      state.moved = 0;
      // Con el ratón: Mayús, botón derecho o central mueven la escena; el izquierdo la gira.
      state.pan = event.shiftKey || event.button === 1 || event.button === 2;
    }
    drag.current = state;
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const state = drag.current;
    const last = state?.pointers.get(event.pointerId);
    if (!state || !last) return;
    const [dx, dy] = [event.clientX - last.x, event.clientY - last.y];
    state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    state.moved += Math.abs(dx) + Math.abs(dy);
    if (state.pointers.size >= 2) {
      // Dos dedos: pellizcar acerca o aleja alrededor del punto medio, y moverlos desplaza la escena.
      const [a, b] = [...state.pointers.values()];
      const gap = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const rect = event.currentTarget.getBoundingClientRect();
      if (state.gap && state.mid) {
        panBy(mid.x - state.mid.x, mid.y - state.mid.y);
        zoomAt(gap / state.gap, mid.x - rect.left, mid.y - rect.top);
      }
      state.gap = gap;
      state.mid = mid;
      return;
    }
    if (state.pan) panBy(dx, dy);
    else setCamera(c => ({ ...c, yaw: c.yaw + dx * 0.4, pitch: clamp(c.pitch - dy * 0.3, 3, 90) }));
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const state = drag.current;
    if (!state) return;
    const wasClick = state.pointers.size === 1 && state.moved < 6;
    state.pointers.delete(event.pointerId);
    state.gap = null;
    state.mid = null;
    if (!wasClick || event.type === "pointercancel") return;
    const rect = event.currentTarget.getBoundingClientRect();
    const [x, y] = [event.clientX - rect.left, event.clientY - rect.top];
    // El punto más cercano al toque; si dos quedan casi iguales, el que está más al frente.
    let best: { id: string; d: number; depth: number } | null = null;
    for (const hit of hits.current) {
      const d = Math.hypot(hit.x - x, hit.y - y);
      if (d > hit.r) continue;
      if (!best || d < best.d - 3 || (Math.abs(d - best.d) <= 3 && hit.depth > best.depth)) best = { id: hit.id, d, depth: hit.depth };
    }
    if (best) onSelect(best.id);
  };

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    // Solo con Ctrl/⌘ (o el pellizco del trackpad) la rueda acerca; sin ellas, la página sigue desplazándose.
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      cancelAnimationFrame(frame.current);
      const rect = el.getBoundingClientRect();
      zoomRef.current(Math.exp(-event.deltaY * 0.0025), event.clientX - rect.left, event.clientY - rect.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const onKey = (event: ReactKeyboardEvent) => {
    cancelAnimationFrame(frame.current);
    const step = event.shiftKey ? 15 : 6;
    const [cx, cy] = [size.w / 2, size.h / 2];
    // Con Alt las flechas mueven la escena en vez de girarla.
    const handled = event.altKey
      ? ({ ArrowLeft: () => panBy(40, 0), ArrowRight: () => panBy(-40, 0), ArrowUp: () => panBy(0, 40), ArrowDown: () => panBy(0, -40) } as Record<string, () => void>)[event.key]
      : ({
          ArrowLeft: () => setCamera(c => ({ ...c, yaw: c.yaw - step })),
          ArrowRight: () => setCamera(c => ({ ...c, yaw: c.yaw + step })),
          ArrowUp: () => setCamera(c => ({ ...c, pitch: clamp(c.pitch + step, 3, 90) })),
          ArrowDown: () => setCamera(c => ({ ...c, pitch: clamp(c.pitch - step, 3, 90) })),
          "+": () => zoomAt(1.2, cx, cy),
          "=": () => zoomAt(1.2, cx, cy),
          "-": () => zoomAt(1 / 1.2, cx, cy),
          "0": () => goTo(home()),
        } as Record<string, () => void>)[event.key];
    if (!handled) return;
    event.preventDefault();
    handled();
  };

  const zoomBy = (factor: number) => {
    cancelAnimationFrame(frame.current);
    zoomAt(factor, size.w / 2, size.h / 2);
  };
  // En el celular los botones quedan debajo del escenario: si no se ve completo, se sube hasta él para que se vea el movimiento.
  const revealStage = () => {
    const stage = box.current;
    if (!stage || isExpanded) return;
    const r = stage.getBoundingClientRect();
    if (r.top < 64 || r.bottom > window.innerHeight - 72) stage.scrollIntoView({ block: "center", behavior: reducedMotion() ? "auto" : "smooth" });
  };
  const view = (name: "perspective" | "top" | "side") => {
    revealStage();
    goTo({ ...(name === "perspective" ? home() : PRESETS[name]), zoom: cameraRef.current.zoom });
  };
  // Mira la falla de frente (perpendicular al plano) a escala real y centrada: así se ve el
  // reparto del deslizamiento como en las figuras de los sismólogos. Usa el rumbo y el buzamiento que publica el USGS.
  const showRupture = () => {
    if (!fault) return;
    revealStage();
    const strike = fault.strike ?? 288;
    const dip = fault.dip ?? 50;
    // La cara de una falla que buza hacia el lado de la dirección «rumbo + 90°» se ve de frente desde ese mismo lado: se mira
    // hacia el lado contrario (rumbo + 270°). Con la inclinación igual a 90° menos el buzamiento, la vista cae justo
    // perpendicular al plano. Al quedar el mapa «al revés» (el norte abajo), los nombres siguen leyéndose igual.
    const look = (strike + 270) % 360;
    const base: Camera = { yaw: look > 180 ? look - 360 : look, pitch: clamp(90 - dip, 25, 75), zoom: 1, px: 0, py: 0 };
    const proj = makeProjection(scene, base, size.w, size.h, 1);
    const pts = faultOutline(fault, strike).map(([lng, lat, d]) => proj.project(proj.at(lng, lat, d)));
    const [minX, maxX] = [Math.min(...pts.map(q => q.sx)), Math.max(...pts.map(q => q.sx))];
    const [minY, maxY] = [Math.min(...pts.map(q => q.sy)), Math.max(...pts.map(q => q.sy))];
    const [marginL, marginR, marginV] = marginsFor(size.w);
    const zoom = clamp(0.78 * Math.min((size.w - marginL - marginR) / Math.max(maxX - minX, 1), (size.h - 2 * marginV) / Math.max(maxY - minY, 1)), 1, 5);
    setExaggeration(1);
    goTo({ ...base, zoom, px: -((minX + maxX) / 2 - proj.originX) * zoom, py: -((minY + maxY) / 2 - size.h / 2) * zoom }, 900);
  };
  const which = camera.pitch >= 85 ? "top" : camera.pitch <= 8 ? "side" : "perspective";

  const focusActivity = () => {
    const event = selectedEvent ?? mainshock ?? latest;
    if (!event) return;
    revealStage();
    const base = home();
    const projection = makeProjection(scene, base, size.w, size.h, exaggeration);
    const [lng, lat, depth] = event.geometry.coordinates;
    const p = projection.project(projection.at(lng, lat, depth ?? 0));
    // Con el sismo principal se encuadra toda la ruptura (el rectángulo de la falla y el hipocentro), para que llene la vista;
    // con cualquier otro sismo, un acercamiento fijo centrado en él.
    const points = fault && event.id === mainshock?.id
      ? [p, ...faultOutline(fault, fault.strike ?? 288).map(([x, y, d]) => projection.project(projection.at(x, y, d)))]
      : null;
    if (!points) {
      const zoom = 3;
      goTo({ ...base, zoom, px: -(p.sx - projection.originX) * zoom, py: -(p.sy - size.h / 2) * zoom }, 900);
      return;
    }
    const [minX, maxX] = [Math.min(...points.map(q => q.sx)), Math.max(...points.map(q => q.sx))];
    const [minY, maxY] = [Math.min(...points.map(q => q.sy)), Math.max(...points.map(q => q.sy))];
    const [marginL, marginR, marginV] = marginsFor(size.w);
    const zoom = clamp(0.8 * Math.min((size.w - marginL - marginR) / Math.max(maxX - minX, 1), (size.h - 2 * marginV) / Math.max(maxY - minY, 1)), 2, 5);
    goTo({ ...base, zoom, px: -((minX + maxX) / 2 - projection.originX) * zoom, py: -((minY + maxY) / 2 - size.h / 2) * zoom }, 900);
  };
  // Al cambiar los filtros de la página, la cámara enmarca los sismos que dejan pasar; sin filtros vuelve a todo el país.
  const frameFiltered = () => {
    const base = home();
    if (!filtersKey || !baseEvents.length) {
      goTo(base, 900);
      return;
    }
    const projection = makeProjection(scene, base, size.w, size.h, exaggeration);
    const points = baseEvents.map(event => {
      const [lng, lat, depth] = event.geometry.coordinates;
      return projection.project(projection.at(lng, lat, depth ?? 0));
    });
    const [minX, maxX] = [Math.min(...points.map(q => q.sx)), Math.max(...points.map(q => q.sx))];
    const [minY, maxY] = [Math.min(...points.map(q => q.sy)), Math.max(...points.map(q => q.sy))];
    const [marginL, marginR, marginV] = marginsFor(size.w);
    // Con uno o pocos sismos la caja sería diminuta: se le da un tamaño mínimo para no acercar de más.
    const zoom = clamp(0.8 * Math.min((size.w - marginL - marginR) / Math.max(maxX - minX, 140), (size.h - 2 * marginV) / Math.max(maxY - minY, 100)), 1, 4);
    goTo({ ...base, zoom, px: -((minX + maxX) / 2 - projection.originX) * zoom, py: -((minY + maxY) / 2 - size.h / 2) * zoom }, 900);
  };
  useEffect(() => {
    frameRef.current = frameFiltered;
  });
  useEffect(() => {
    const first = framedKey.current === null;
    if (framedKey.current === filtersKey || (first && filtersKey === "")) {
      framedKey.current = filtersKey;
      return;
    }
    framedKey.current = filtersKey;
    // Al abrir el 3D con filtros ya puestos se espera a que termine la animación de entrada.
    const timer = window.setTimeout(() => frameRef.current(), first ? 1700 : 150);
    return () => window.clearTimeout(timer);
  }, [filtersKey]);

  return (
    <div ref={root} className={`q3${isExpanded ? " q3-expanded" : ""}${overlay ? " q3-overlay" : ""}`}>
      <div className="q3-heading">
        <div className="q3-heading-title"><SceneIcon name="Box" size={24} /><div><span>EXPLORADOR SÍSMICO / PANAMÁ</span><h3>La actividad sísmica, en profundidad.</h3></div></div>
        <button className="q3-expand" type="button" aria-label={isExpanded ? "Salir de vista ampliada" : "Pantalla completa del mapa 3D"} aria-pressed={isExpanded} onClick={toggleExpanded}>
          {isExpanded ? <SceneIcon name="Minimize2" size={16} /> : <SceneIcon name="Maximize2" size={16} />}<span>{isExpanded ? "Salir" : "Pantalla completa"}</span>
        </button>
      </div>
      <div className="q3-stage" ref={box}>
        <div className="q3-scene-meta"><span><i />{facts.count} {facts.count === 1 ? "evento" : "eventos"}</span><span className="q3-meta-depth">Profundidad máx. <strong>{facts.deepest === null ? "—" : km(facts.deepest)}</strong></span><span>Escala vertical <strong>×{exaggeration}</strong></span>{ground && <span title={`Movimiento horizontal del terreno en el centro de la vista${ground.town ? `, cerca de ${ground.town}` : ""}, calculado con el modelo de deslizamiento del USGS (Okada, 1985). No es una medición y no está exagerado.`}>Terreno <strong>{moveText(ground.meters)}</strong>{ground.meters >= 0.01 && ` al ${ground.short}`}</span>}{ruptureTime !== null && <span className="q3-live"><i />Segundo <strong>{ruptureTime.toFixed(0)}</strong></span>}</div>
        <div className="q3-navigation" role="group" aria-label="Navegación de la escena">
          <button type="button" onClick={() => zoomBy(1.3)} aria-label="Acercar" title="Acercar"><SceneIcon name="Plus" size={17} /></button>
          <span aria-label={`Zoom ${Math.round(camera.zoom * 100)} por ciento`}>{camera.zoom.toFixed(1)}×</span>
          <button type="button" onClick={() => zoomBy(1 / 1.3)} aria-label="Alejar" title="Alejar"><SceneIcon name="Minus" size={17} /></button>
          <button type="button" onClick={() => goTo(home())} aria-label="Restablecer vista 3D" title="Restablecer vista"><SceneIcon name="Focus" size={17} /></button>
          <button type="button" onClick={() => goTo({ ...cameraRef.current, yaw: cameraRef.current.yaw + 45 })} aria-label="Girar 45 grados" title="Girar 45°"><SceneIcon name="RotateCcw" size={17} /></button>
        </div>
        <canvas
          ref={canvas}
          className="q3-canvas"
          style={{ width: size.w, height: size.h }}
          tabIndex={0}
          role="application"
          aria-roledescription="vista tridimensional"
          aria-label={`Vista 3D de ${facts.count} ${facts.count === 1 ? "sismo" : "sismos"} según su profundidad${facts.deepest !== null ? `; el más profundo, a ${facts.deepest} km` : ""}. La lista de eventos está más abajo.`}
          aria-describedby="q3-help"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDoubleClick={() => goTo(home())}
          onContextMenu={event => event.preventDefault()}
          onKeyDown={onKey}
        />
        <p id="q3-help" className="sr-only">
          Arrastra o usa las flechas del teclado para girar; con Alt y las flechas, o con dos dedos, se mueve la escena; más y menos acercan o alejan, y cero vuelve a la vista inicial. Pulsa un punto para ver ese sismo.
        </p>
      </div>
      <div className="q3-panel">
        <div className="q3-panel-heading"><span><SceneIcon name="Compass" size={14} aria-hidden="true" /> EXPLORAR LA ESCENA</span><span>Arrastra para girar · Pellizca para acercar</span></div>
        {selectedEvent && (
          <p className="q3-selected" role="status">
            <strong>M {selectedEvent.properties.mag === null ? "—" : selectedEvent.properties.mag.toFixed(1)}</strong>{" "}
            {selectedEvent.properties.place ?? "lugar no especificado"} · {clock.format(new Date(selectedEvent.properties.time))} ·{" "}
            {depthOf(selectedEvent) === undefined ? "profundidad no disponible" : `${km(depthOf(selectedEvent) as number)} de profundidad${isRoundDepth(depthOf(selectedEvent)) ? " (asignada)" : ""}`}
          </p>
        )}
        {fault && ruptureDuration !== null && (
          <div className="q3-anim" role="group" aria-label="Animación de la ruptura">
            <button type="button" className="q3-play" onClick={() => (isPlaying ? setPlaying(false) : ruptureTime === null ? startRupture() : setPlaying(true))}>
              <span aria-hidden="true">{isPlaying ? "❚❚" : "▶"}</span>
              {isPlaying ? "Pausar" : ruptureTime === null ? (waveField ? "Ver la ruptura y la onda" : "Ver cómo se rompió") : "Continuar"}
            </button>
            <input
              type="range" min={0} max={ruptureDuration} step={0.1} value={ruptureTime ?? ruptureDuration} className="q3-scrub"
              aria-label="Instante de la ruptura, en segundos"
              aria-valuetext={`Segundo ${(ruptureTime ?? ruptureDuration).toFixed(0)} de ${ruptureDuration.toFixed(0)}`}
              onChange={event => {
                const value = Number(event.target.value);
                setPlaying(false);
                clockRef.current = value;
                setRuptureTime(value >= ruptureDuration ? null : value);
              }}
            />
            <span className="q3-anim-readout">
              {ruptureTime === null
                ? `Ruptura completa: ${fault.durationS?.toFixed(0)} s, deslizamiento máx. ${fault.maxSlipM.toFixed(1)} m${waveField ? `. La sacudida cubre el país unos ${waveField.end} s después de empezar` : ""}`
                : `Segundo ${ruptureTime.toFixed(0)} de ${ruptureDuration.toFixed(0)} · deslizamiento máx. hasta ahora ${fault.subfaults.reduce((m, sub) => Math.max(m, sub.t === null ? 0 : sub.slip * clamp((ruptureTime - sub.t) / Math.max(sub.rise ?? 1, 1), 0, 1)), 0).toFixed(1)} m${waveField ? ` · la sacudida ya llegó a unos ${reachedKm(ruptureTime)} km del epicentro` : ""}`}
            </span>
            <div className="q3-anim-note">
              <p>La animación va {playSpeed} veces más rápida que la realidad.{waveField && " La onda y el terreno son cálculos con datos del USGS, no registros de sismógrafos."}</p>
              <details>
                <summary>Qué es real y qué es calculado</summary>
                <p>
                  Cada celda de la falla se mueve en el segundo y durante el tiempo que calcula el modelo del USGS.
                  {waveField && " Onda de sacudida: el color de cada lugar es la intensidad que estima el USGS (ShakeMap); el momento en que llega se calcula con velocidades típicas de las ondas (P: 6 km/s, S: 3.5 km/s) desde cada celda de la falla cuando se rompe. No son registros de sismógrafos. La pantalla tiembla como efecto visual: su fuerza sigue la intensidad que estima el USGS en el centro de la vista."}
                  {ground && ` «Terreno» es cuánto se mueve el suelo en horizontal en el centro de la vista${ground.town ? ` (cerca de ${ground.town})` : ""}: ${moveText(ground.meters)}${ground.meters >= 0.01 ? ` hacia el ${ground.long}` : ""}. Se calcula con las ecuaciones de Okada (1985) y el deslizamiento que modela el USGS en cada celda (con el ángulo de deslizamiento de su mecanismo); no es una medición y está en metros reales, sin exagerar: a esta escala no se vería moverse.`}
                  {slipSense && ` Flechas: hacia dónde se movió cada lado de la falla según el mecanismo focal del USGS (rumbo ${slipSense.strike}°, buzamiento ${slipSense.dip}°, ángulo de deslizamiento ${slipSense.rake}°: ${slipSense.kind}); su largo no es cuánto se movió.`}
                </p>
              </details>
            </div>
          </div>
        )}
        <div className="q3-bar" role="group" aria-label="Controles de la vista 3D">
          <div className="q3-seg" role="group" aria-label="Punto de vista">
            {([["perspective", "Perspectiva", "Vista en perspectiva"], ["top", "Arriba", "Vista desde arriba"], ["side", "Lado", "Vista de lado"]] as const).map(([name, label, full]) => (
              <button key={name} type="button" aria-pressed={which === name} aria-label={full} className={which === name ? "on" : ""} onClick={() => view(name)}>{label}</button>
            ))}
            {fault && <button type="button" aria-label="Vista de frente de la ruptura de la falla" title="Mira la falla de frente, a escala real: así se ve cuánto se deslizó cada tramo" onClick={showRupture}>Ruptura</button>}
          </div>
          <button type="button" className="q3-action" onClick={focusActivity} disabled={!events.length}><SceneIcon name="Focus" size={15} />{selectedEvent ? "Centrar selección" : mainshock ? "Acercar al sismo principal" : "Acercar al último sismo"}</button>
          <button type="button" className={`q3-action q3-settings-toggle${settingsOpen ? " on" : ""}`} aria-expanded={settingsOpen} aria-controls="q3-settings" onClick={() => setSettingsOpen(value => !value)}>Ajustes y capas <span aria-hidden="true">{settingsOpen ? "−" : "+"}</span></button>
        </div>
        <div className="q3-advanced" id="q3-settings" hidden={!settingsOpen}>
          <div className="q3-seg" role="group" aria-label="Escala de la profundidad">
            <span className="q3-cap" aria-hidden="true">Prof.</span>
            {EXAGGERATIONS.map(value => (
              <button key={value} type="button" aria-pressed={exaggeration === value} aria-label={value === 1 ? "Profundidad real" : `Profundidad exagerada ×${value}`} className={exaggeration === value ? "on" : ""} onClick={() => setExaggeration(value)} title={value === 1 ? "Profundidad a escala real" : `Profundidad exagerada ${value} veces para que se aprecie`}>
                {value === 1 ? "Real" : `×${value}`}
              </button>
            ))}
          </div>
          <div className="q3-seg" role="group" aria-label="Fondo de la superficie">
            <button type="button" aria-pressed={satellite} className={satellite ? "on" : ""} onClick={() => setSatellite(true)}>Satélite</button>
            <button type="button" aria-pressed={!satellite} className={!satellite ? "on" : ""} onClick={() => setSatellite(false)}>Oscuro</button>
          </div>
          <div className="q3-seg" role="group" aria-label="Color de los puntos">
            <span className="q3-cap" aria-hidden="true">Color</span>
            <button type="button" aria-pressed={colorBy === "depth"} className={colorBy === "depth" ? "on" : ""} onClick={() => setColorBy("depth")}>Profundidad</button>
            <button type="button" aria-pressed={colorBy === "mag"} className={colorBy === "mag" ? "on" : ""} onClick={() => setColorBy("mag")}>Magnitud</button>
          </div>
          {mainshock && (
            <div className="q3-seg" role="group" aria-label="Réplicas del sismo principal">
              <span className="q3-cap" aria-hidden="true">Réplicas</span>
              <button type="button" aria-pressed={showAftershocks} className={showAftershocks ? "on" : ""} onClick={() => setAftershockChoice({ key: filtersKey, show: true })}>Sí</button>
              <button type="button" aria-pressed={!showAftershocks} className={!showAftershocks ? "on" : ""} onClick={() => setAftershockChoice({ key: filtersKey, show: false })}>No</button>
            </div>
          )}
          {waveField && (
            <div className="q3-seg" role="group" aria-label="Temblor de la pantalla con la onda de sacudida">
              <span className="q3-cap" aria-hidden="true">Temblor</span>
              <button type="button" aria-pressed={screenShake} className={screenShake ? "on" : ""} onClick={() => setScreenShake(true)}>Sí</button>
              <button type="button" aria-pressed={!screenShake} className={!screenShake ? "on" : ""} onClick={() => setScreenShake(false)}>No</button>
            </div>
          )}
          <label className="q3-opacity">Superficie <input type="range" min="15" max="100" step="5" value={surfaceOpacity} onChange={event => setSurfaceOpacity(Number(event.target.value))} aria-label="Opacidad de la superficie" /><span>{surfaceOpacity}%</span></label>
          {layerControls}
        </div>
        <div className="q3-legend">
          {colorBy === "depth" ? (
            <>
              <span className="q3-depthscale" title="Color según la profundidad del sismo">
                <b>0 km</b>
                <i aria-hidden="true" style={{ background: `linear-gradient(90deg, ${[0, 10, 20, 35, 50].map(depthColor).join(", ")})` }} />
                <b>50 km</b>
              </span>
              <span>Tamaño: magnitud</span>
            </>
          ) : (
            <>
              <span><i className="q3-dot" style={{ background: COLORS.low }} />Menor a 3</span>
              <span><i className="q3-dot" style={{ background: COLORS.mid }} />3 a 4.9</span>
              <span><i className="q3-dot" style={{ background: COLORS.high }} />5 o más</span>
            </>
          )}
          <span><i className="q3-dot" style={{ background: COLORS.latest }} />Último</span>
          {mainshock && <span><i className="q3-dot" style={{ background: COLORS.main }} />Principal</span>}
          {mainshock && !showAftershocks && replay === null && <span>Réplicas ocultas (se activan en «Ajustes y capas»)</span>}
          <span title="Profundidad de exactamente 10 o 5 km: el catálogo suele asignarla cuando no logra calcularla"><i className="q3-dot hollow" />Profundidad fijada{facts.fixed > 0 ? ` (${facts.fixed})` : ""}</span>
          {fault && (
            <span><i className="slip-ramp" aria-hidden="true" style={{ background: `linear-gradient(90deg, ${[0, 0.33, 0.66, 1].map(t => slipColor(t, 1)).join(", ")})` }} />Ruptura: de poco (violeta) a mucho deslizamiento (amarillo)</span>
          )}
          {shaking && (
            <span><span className="felt-scale" aria-hidden="true">{shaking.map(c => <i key={c.value} style={{ background: intensityColor(c.value) }} />)}</span>Sacudida estimada (USGS)</span>
          )}
          {felt && (
            <span><span className="felt-scale" aria-hidden="true">{[3, 4, 5, 6, 7, 8, 9].map(v => <i key={v} style={{ background: intensityColor(v) }} />)}</span>Intensidad que reportó la gente</span>
          )}
          {waveField && (
            <span><span className="felt-scale" aria-hidden="true">{[3, 4, 5, 6, 7, 8, 9].map(v => <i key={v} style={{ background: intensityColor(v) }} />)}</span>Onda de sacudida: intensidad estimada por el USGS</span>
          )}
          {slipSense && <span title="Hacia dónde se movió cada lado de la falla, según el mecanismo focal del USGS"><b aria-hidden="true">⇄</b>Flechas: sentido del deslizamiento ({slipSense.kind}), no a escala</span>}
          {plates && <PlatesLegend />}
        </div>
        <p className="q3-note">
          {exaggeration === 1 ? "Profundidad a escala real." : `Profundidad exagerada ×${exaggeration} (las marcas de km son reales).`}
          {" "}<span className="q3-hollow">Hueco: profundidad de 10 o 5 km asignada por el catálogo, aproximada.</span>
        </p>
        {satellite && tiles.total > 0 && (tiles.failed === tiles.total || tiles.loaded + tiles.failed < tiles.total) && (
          <p className="q3-note" role="status">
            {tiles.failed === tiles.total ? "No se pudo cargar la imagen satelital; se muestra la superficie sin imagen." : "Cargando la imagen satelital…"}
          </p>
        )}
        <details className="q3-more">
          <summary>Cómo leer esta vista</summary>
          <p>
            Arrastra para girar; con dos dedos (o Mayús y arrastrar) mueves la escena, y pellizcando (o Ctrl y rueda) acercas hacia donde miras: al acercar aparecen los nombres de las cabeceras de distrito. La superficie es el plano con la costa de Panamá; cada sismo está a la profundidad que reporta su catálogo, y el hilo punteado lo une con su epicentro en la superficie. Los puntos huecos tienen una profundidad de exactamente 10 o 5 km: cuando el catálogo no logra calcularla, la asigna (el USGS lo marca como «operator assigned»), así que no es una medida precisa.
            {fault && " La ruptura es el modelo de falla que publica el USGS para el sismo principal."}
            {felt && " Los cuadros de color sobre la superficie son la intensidad que reportó la gente."}
            {shaking && " Las curvas de colores sobre la superficie son la intensidad de la sacudida que estima el USGS."}
            {waveField && " La onda de sacudida colorea el país a medida que la onda S llega a cada lugar: el color es la intensidad que estima el USGS y el frente reciente se ve más claro; un tinte azul tenue anticipa la llegada de la onda P. Los tiempos se calculan con velocidades típicas, no con registros."}
            {ground && " «Terreno»: movimiento horizontal del suelo en el centro de la vista, calculado con el modelo de deslizamiento del USGS (Okada, 1985), en metros reales y sin exagerar; no es una medición."}
            {plates && " Las líneas gruesas de colores son los límites entre placas tectónicas: rojo discontinuo, subducción (una placa se hunde bajo otra); amarillo, falla transformante (se deslizan de lado); celeste, extensión (se separan); morado, convergencia (chocan). Salen del modelo PB2002 de P. Bird (2003), que no es de una agencia de gobierno; son límites aproximados y en Panamá el contacto entre placas es una zona ancha."}
            {(fault || felt || shaking) && " Fuente de estas capas: USGS."}
          </p>
        </details>
      </div>
      {replay && replay.index > 0 && <span className="sr-only" role="status">{`Sismo ${replay.index} de ${replay.total}`}</span>}
    </div>
  );
}
