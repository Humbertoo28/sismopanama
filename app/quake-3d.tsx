"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import type { Earthquake, ReplayStep } from "../lib/earthquakes";
import type { Contour, Fault, Felt } from "../lib/usgs-detail";
import { PANAMA_RINGS } from "../lib/panama";
import { PROVINCE_BY_ID } from "../lib/province-of";
import { PROVINCE_LABELS, TOWN_LABELS } from "../lib/province-labels";
import { PROVINCES } from "../lib/provinces";
import { intensityColor, slipColor } from "../lib/usgs-colors";
import { depthColor, isRoundDepth } from "../lib/depth";
import { loadMosaic, paintMosaic, planTiles, type Mosaic } from "./satellite-tiles";
import { reducedMotion, shakeElement } from "./shake";

type Props = {
  events: Earthquake[];
  mainshock: Earthquake | null;
  selectedId: string | null;
  replay: ReplayStep | null;
  region: string | null;
  fault: Fault | null;
  felt: Felt | null;
  shaking: Contour[] | null;
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
  perspective: { yaw: 16, pitch: 36, zoom: 1, px: 0, py: 0 },
  top: { yaw: 0, pitch: 90, zoom: 1, px: 0, py: 0 },
  side: { yaw: 0, pitch: 4, zoom: 1, px: 0, py: 0 },
} as const;

// Punto de vista inicial según la forma del lienzo: en uno alto y angosto (celular) se mira a lo largo de la caja, así
// llena el ancho en vez de quedar chica.
const homeFor = (w: number, h: number): Camera => {
  const aspect = w / h;
  // Se mira desde el sur-suroeste, hacia donde buza la falla: así la ruptura se ve de frente y no de canto.
  return aspect < 1 ? { yaw: 70, pitch: 38, zoom: 1, px: 0, py: 0 } : aspect < 1.35 ? { yaw: 40, pitch: 36, zoom: 1, px: 0, py: 0 } : { yaw: 16, pitch: 36, zoom: 1, px: 0, py: 0 };
};
const EXAGGERATIONS = [1, 4, 8] as const;
// Opacidad de la imagen satelital (algo translúcida para que se integre con el fondo).
const SAT_ALPHA = 0.82;
const SAT_KEY = "sismo_3d_satellite";
const COLORS = { low: "#f5c542", mid: "#f08a24", high: "#da121a", latest: "#1d6bff", main: "#a21caf" };
const clock = new Intl.DateTimeFormat("es-PA", { timeZone: "America/Panama", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });


const depthOf = (event: Earthquake) => event.geometry.coordinates[2];
// Profundidad con un decimal como máximo (12.647 → 12.6).
// Márgenes del encuadre (izquierda, derecha, vertical): a la izquierda van los kilómetros de profundidad.
const marginsFor = (w: number) => [w < 480 ? 44 : 56, 18, 26] as const;
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

type SceneInfo = {
  south: number; north: number; west: number; east: number;
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

// Vista tridimensional: la superficie (costa de Panamá) arriba y cada sismo a su profundidad. Se dibuja con un
// lienzo y proyección propia: son unos cientos de puntos y evita cargar una librería 3D para esto.
export default function Quake3D({ events, mainshock, selectedId, replay, region, fault, felt, shaking, layerControls, onSelect }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 640, h: 420 });
  const [exaggeration, setExaggeration] = useState<number>(8);
  // Por defecto los puntos se colorean por profundidad: es lo que esta vista enseña mejor.
  const [colorBy, setColorBy] = useState<"depth" | "mag">("depth");
  // Al abrir, la cámara baja desde una vista casi cenital hasta el punto de vista inicial (salvo que se pidan menos animaciones).
  const [camera, setCamera] = useState<Camera>(() => {
    if (typeof window === "undefined") return PRESETS.perspective;
    const start = homeFor(Math.min(window.innerWidth, 700) - 36, window.innerWidth < 700 ? 400 : 420);
    return reducedMotion() ? start : { ...start, yaw: start.yaw + 30, pitch: 74, zoom: 0.8 };
  });
  const introRef = useRef<() => void>(() => {});
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
  const hits = useRef<{ id: string; x: number; y: number; r: number; depth: number }[]>([]);
  const frame = useRef(0);

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

  const scene = useMemo(() => {
    const coords = events.map(event => event.geometry.coordinates);
    const lats = coords.map(c => c[1]);
    const lngs = coords.map(c => c[0]);
    if (fault) for (const sub of fault.subfaults) for (const [lng, lat] of sub.ring) { lats.push(lat); lngs.push(lng); }
    // Si no hay nada que mostrar, se enmarca Panamá.
    if (!lats.length) { lats.push(7, 9.5); lngs.push(-82.5, -78); }
    const pad = 0.35;
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
  }, [events, fault]);

  // Imagen satelital de la superficie: se piden los mosaicos de la zona que se está viendo (el navegador los guarda un día).
  const [south, north, west, east] = [scene.south, scene.north, scene.west, scene.east].map(value => Math.round(value * 100) / 100);
  const maxTiles = size.w < 520 ? 16 : 24;
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

  const facts = useMemo(() => {
    const depths = events.map(depthOf).filter((d): d is number => typeof d === "number");
    const fixed = depths.filter(isRoundDepth).length;
    return { count: events.length, withDepth: depths.length, fixed, deepest: depths.length ? Math.max(...depths) : null };
  }, [events]);

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
    const ts = parseFloat(getComputedStyle(el).getPropertyValue("--ts")) || 1;
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

    // Caja de profundidad: suelo y cuatro aristas hasta la profundidad máxima.
    const [sw, se, ne, nw] = [at(scene.west, scene.south, 0), at(scene.east, scene.south, 0), at(scene.east, scene.north, 0), at(scene.west, scene.north, 0)];
    const floor = [sw, se, ne, nw].map(p => ({ ...p, z: -scene.floorKm * exaggeration }));
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(160,190,230,.22)";
    ctx.setLineDash([]);
    ctx.beginPath();
    floor.forEach((p, i) => { const q = project(p); pathTo(i, q.sx, q.sy); });
    ctx.closePath();
    ctx.fillStyle = "rgba(20,50,95,.35)";
    ctx.fill();
    ctx.stroke();
    [sw, se, ne, nw].forEach((p, i) => line(p, floor[i]));

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
      // La imagen es una foto suave: se pinta a resolución de pantalla (sin la escala del dispositivo) y se amplía,
      // lo que cuesta una fracción y mantiene fluido el giro en celulares.
      const buffer = (bufferRef.current ??= document.createElement("canvas"));
      if (buffer.width !== w || buffer.height !== h) {
        buffer.width = w;
        buffer.height = h;
      }
      const bctx = buffer.getContext("2d");
      if (bctx) {
        bctx.setTransform(1, 0, 0, 1, 0, 0);
        bctx.clearRect(0, 0, w, h);
        const cols = clamp(Math.round(w / 46), 8, 18);
        const rows = clamp(Math.round((cols * scene.halfH) / scene.halfW), 6, 14);
        paintMosaic(bctx, mosaic, scene, (lng, lat) => {
          const q = project(at(lng, lat, 0));
          return { sx: q.sx, sy: q.sy };
        }, cols, rows);
        ctx.save();
        ctx.globalAlpha = SAT_ALPHA;
        ctx.imageSmoothingQuality = "medium";
        ctx.drawImage(buffer, 0, 0, w, h);
        ctx.restore();
      }
    }

    // Planos de referencia cada 10 km bajo la superficie: así se lee a qué nivel está cada sismo, también de lado.
    ctx.setLineDash([]);
    ctx.lineWidth = 0.9;
    ctx.strokeStyle = "rgba(200,222,255,.2)";
    for (let level = 10; level < scene.floorKm; level += 10) {
      ctx.beginPath();
      [sw, se, ne, nw].forEach((c, i) => { const q = project({ ...c, z: -level * exaggeration }); pathTo(i, q.sx, q.sy); });
      ctx.closePath();
      ctx.stroke();
    }

    // Todo lo que está bajo tierra se ordena de lejos a cerca.
    type Drawable = { depth: number; draw: () => void };
    const drawables: Drawable[] = [];
    const items: Item[] = events.map(event => {
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
        faultCells.push({
          depth: projected.reduce((sum, q) => sum + q.depth, 0) / 4,
          draw: () => {
            ctx.beginPath();
            projected.forEach((q, i) => pathTo(i, q.sx, q.sy));
            ctx.closePath();
            ctx.fillStyle = slipColor(sub.slip, fault.maxSlipM, 0.78);
            ctx.fill();
            ctx.strokeStyle = "rgba(20,8,40,.3)";
            ctx.lineWidth = 0.5;
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
      const r = (isMain ? 10 : item.radius) * Math.min(1.35, Math.max(0.75, q.k));
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
            ctx.fillStyle = color;
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
    ctx.fillStyle = "rgba(120,170,235,.13)";
    ctx.fill();
    ctx.strokeStyle = "rgba(190,215,250,.55)";
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.lineWidth = 0.7;
    ctx.strokeStyle = "rgba(190,215,250,.16)";
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
    ctx.strokeStyle = "rgba(255,255,255,.32)";
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
    ctx.strokeStyle = mosaic && tiles.loaded > 0 ? "rgba(255,255,255,.7)" : "rgba(255,255,255,.88)";
    ctx.fillStyle = mosaic && tiles.loaded > 0 ? "rgba(255,255,255,0)" : "rgba(255,255,255,.05)";
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

    ctx.restore();

    // Nombres de las provincias y, al acercar, de las cabeceras de distrito. Cada uno se omite si choca con otro ya
    // puesto; de canto (sin ver la superficie) no se escriben.
    if (!edgeOn) {
      // Primero se reserva el sitio de las etiquetas de magnitud ("M 7.7"), que mandan sobre los nombres.
      const placed: { x0: number; y0: number; x1: number; y1: number }[] = labeled.map(l => ({ x0: l.sx - 32, x1: l.sx + 32, y0: l.sy - 14, y1: l.sy + 5 }));
      const inside = (lng: number, lat: number) => lng >= scene.west && lng <= scene.east && lat >= scene.south && lat <= scene.north;
      const put = (text: string, lng: number, lat: number, px: number, weight: number, alpha: number, town: boolean) => {
        if (!inside(lng, lat)) return;
        const q = project(at(lng, lat, 0));
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
        ctx.fillStyle = "#ffffff";
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
      if (camera.zoom >= 1.5) {
        const count = clamp(Math.round((camera.zoom - 1.2) * 16), 8, TOWN_LABELS.length);
        for (const town of TOWN_LABELS.slice(0, count)) put(town.name, town.lng, town.lat, 9.5 * boost, 700, 0.92, true);
      }
    }

    // Rótulo de la ruptura sobre su borde superior.
    if (fault && faultEdge && !edgeOn) {
      // Bajo el borde inferior de la falla: arriba suele estar el enjambre de réplicas.
      const mid = { sx: (faultEdge[2].p.sx + faultEdge[3].p.sx) / 2, sy: Math.max(faultEdge[2].p.sy, faultEdge[3].p.sy) + 22 };
      const size1 = fault.lengthKm !== null && fault.widthKm !== null ? ` · ${Math.round(fault.lengthKm)} × ${Math.round(fault.widthKm)} km` : "";
      const text = `Ruptura${size1} · máx. ${fault.maxSlipM.toFixed(1)} m`;
      ctx.save();
      ctx.font = font(10.5, 800);
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      const x = clamp(mid.sx, ctx.measureText(text).width / 2 + 6, w - ctx.measureText(text).width / 2 - 6);
      ctx.lineJoin = "round";
      ctx.lineWidth = 3.4;
      ctx.strokeStyle = "rgba(20,8,40,.92)";
      ctx.strokeText(text, x, mid.sy - 9);
      ctx.fillStyle = "#fff4be";
      ctx.fillText(text, x, mid.sy - 9);
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
      if (placedLabels.some(other => Math.abs(other.sx - label.sx) < 52 && Math.abs(other.sy - label.sy) < 15)) continue;
      placedLabels.push(label);
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = "rgba(7,21,43,.9)";
      ctx.strokeText(label.text, label.sx, label.sy);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(label.text, label.sx, label.sy);
    }

    // Brújula: hacia dónde queda el norte en pantalla (la vista de frente de la falla deja el mapa «al revés»).
    {
      const [cx, cy, r] = [38, 38, 14];
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

    // Atribución de la imagen satelital, siempre a la vista.
    if (mosaic && tiles.loaded > 0) {
      ctx.font = font(9.5, 600);
      ctx.textAlign = "right";
      ctx.textBaseline = "alphabetic";
      ctx.lineWidth = 3;
      ctx.lineJoin = "round";
      ctx.strokeStyle = "rgba(7,21,43,.85)";
      ctx.fillStyle = "rgba(235,242,252,.9)";
      ctx.strokeText("Imagen © Esri, Maxar, Earthstar Geographics", w - 8, h - 7);
      ctx.fillText("Imagen © Esri, Maxar, Earthstar Geographics", w - 8, h - 7);
    }
  }, [camera, size, scene, events, exaggeration, mainshock, latest, selectedId, replay, region, fault, felt, shaking, satellite, tiles, colorBy]);

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
  const home = (): Camera => homeFor(size.w, size.h);
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
      const rect = el.getBoundingClientRect();
      zoomRef.current(Math.exp(-event.deltaY * 0.0025), event.clientX - rect.left, event.clientY - rect.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const onKey = (event: ReactKeyboardEvent) => {
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

  const zoomBy = (factor: number) => zoomAt(factor, size.w / 2, size.h / 2);
  const view = (name: "perspective" | "top" | "side") => goTo({ ...(name === "perspective" ? home() : PRESETS[name]), zoom: cameraRef.current.zoom });
  // Mira la falla de frente (perpendicular al plano) a escala real y centrada: así se ve el
  // reparto del deslizamiento como en las figuras de los sismólogos. Usa el rumbo y el buzamiento que publica el USGS.
  const showRupture = () => {
    if (!fault) return;
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

  return (
    <div className="q3">
      <div className="q3-stage" ref={box}>
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
        {selectedEvent && (
          <p className="q3-selected" role="status">
            <strong>M {selectedEvent.properties.mag === null ? "—" : selectedEvent.properties.mag.toFixed(1)}</strong>{" "}
            {selectedEvent.properties.place ?? "lugar no especificado"} · {clock.format(new Date(selectedEvent.properties.time))} ·{" "}
            {depthOf(selectedEvent) === undefined ? "profundidad no disponible" : `${km(depthOf(selectedEvent) as number)} de profundidad${isRoundDepth(depthOf(selectedEvent)) ? " (asignada)" : ""}`}
          </p>
        )}
        <div className="q3-bar" role="group" aria-label="Controles de la vista 3D">
          <div className="q3-seg" role="group" aria-label="Punto de vista">
            {([["perspective", "Perspectiva", "Vista en perspectiva"], ["top", "Arriba", "Vista desde arriba"], ["side", "Lado", "Vista de lado"]] as const).map(([name, label, full]) => (
              <button key={name} type="button" aria-pressed={which === name} aria-label={full} className={which === name ? "on" : ""} onClick={() => view(name)}>{label}</button>
            ))}
            {fault && <button type="button" aria-label="Vista de frente de la ruptura de la falla" title="Mira la falla de frente, a escala real: así se ve cuánto se deslizó cada tramo" onClick={showRupture}>Ruptura</button>}
          </div>
          <div className="q3-seg" role="group" aria-label="Acercar o alejar">
            <button type="button" onClick={() => zoomBy(1 / 1.3)} aria-label="Alejar">−</button>
            <button type="button" onClick={() => zoomBy(1.3)} aria-label="Acercar">+</button>
          </div>
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
          <span title="Profundidad de exactamente 10 o 5 km: el catálogo suele asignarla cuando no logra calcularla"><i className="q3-dot hollow" />Profundidad fijada{facts.fixed > 0 ? ` (${facts.fixed})` : ""}</span>
          {fault && (
            <span><i className="slip-ramp" aria-hidden="true" style={{ background: `linear-gradient(90deg, ${[0, 0.33, 0.66, 1].map(t => slipColor(t, 1)).join(", ")})` }} />Ruptura: más claro, más deslizamiento</span>
          )}
          {shaking && (
            <span><span className="felt-scale" aria-hidden="true">{shaking.map(c => <i key={c.value} style={{ background: intensityColor(c.value) }} />)}</span>Sacudida estimada (USGS)</span>
          )}
          {felt && (
            <span><span className="felt-scale" aria-hidden="true">{[3, 4, 5, 6, 7, 8, 9].map(v => <i key={v} style={{ background: intensityColor(v) }} />)}</span>Intensidad que reportó la gente</span>
          )}
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
            {(fault || felt || shaking) && " Fuente de estas capas: USGS."}
          </p>
        </details>
      </div>
      {replay && replay.index > 0 && <span className="sr-only" role="status">{`Sismo ${replay.index} de ${replay.total}`}</span>}
    </div>
  );
}
