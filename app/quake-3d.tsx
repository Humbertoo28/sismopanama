"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import type { Earthquake, ReplayStep } from "../lib/earthquakes";
import type { Contour, Fault, Felt } from "../lib/usgs-detail";
import { PANAMA_RINGS } from "../lib/panama";
import { PROVINCE_BY_ID } from "../lib/province-of";
import { intensityColor, slipColor } from "../lib/usgs-colors";
import { isRoundDepth } from "../lib/depth";
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

type Camera = { yaw: number; pitch: number; zoom: number };
type Point = { x: number; y: number; z: number };

const KM_PER_DEG = 111.32;
const KM_PER_LAT = 110.57;
const PRESETS = {
  perspective: { yaw: -28, pitch: 34, zoom: 1 },
  top: { yaw: 0, pitch: 90, zoom: 1 },
  side: { yaw: 0, pitch: 4, zoom: 1 },
} as const;

// Punto de vista inicial según la forma del lienzo: en uno alto y angosto (celular) se mira a lo largo de la caja, así
// llena el ancho en vez de quedar chica.
const homeFor = (w: number, h: number): Camera => {
  const aspect = w / h;
  return aspect < 1 ? { yaw: -85, pitch: 36, zoom: 1 } : aspect < 1.35 ? { yaw: -50, pitch: 34, zoom: 1 } : PRESETS.perspective;
};
const EXAGGERATIONS = [1, 4, 8] as const;
const COLORS = { low: "#f5c542", mid: "#f08a24", high: "#da121a", latest: "#1d6bff", main: "#a21caf" };
const clock = new Intl.DateTimeFormat("es-PA", { timeZone: "America/Panama", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });


const depthOf = (event: Earthquake) => event.geometry.coordinates[2];
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

// Vista tridimensional: la superficie (costa de Panamá) arriba y cada sismo a su profundidad. Se dibuja con un
// lienzo y proyección propia: son unos cientos de puntos y evita cargar una librería 3D para esto.
export default function Quake3D({ events, mainshock, selectedId, replay, region, fault, felt, shaking, layerControls, onSelect }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 640, h: 420 });
  const [exaggeration, setExaggeration] = useState<number>(4);
  const [camera, setCamera] = useState<Camera>(() => (typeof window !== "undefined" ? homeFor(Math.min(window.innerWidth, 700) - 36, window.innerWidth < 700 ? 400 : 420) : PRESETS.perspective));
  const cameraRef = useRef(camera);
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
    const yaw = (camera.yaw * Math.PI) / 180;
    const pitch = (camera.pitch * Math.PI) / 180;
    const [cy, sy, cp, sp] = [Math.cos(yaw), Math.sin(yaw), Math.cos(pitch), Math.sin(pitch)];
    const radius = Math.hypot(scene.halfW, scene.halfH, (scene.floorKm * exaggeration) / 2);
    const dist = radius * 3.2;
    const midZ = -(scene.floorKm * exaggeration) / 2;
    const at = (lng: number, lat: number, depthKm: number): Point => ({ ...scene.toKm(lng, lat), z: -depthKm * exaggeration });
    // Km (este, norte, arriba) → plano de la vista, con un poco de perspectiva. `depth` crece hacia quien mira, para
    // ordenar de lejos a cerca.
    const raw = (p: Point) => {
      const x1 = p.x * cy - p.y * sy;
      const y1 = p.x * sy + p.y * cy;
      const z1 = p.z - midZ;
      const toward = -y1 * cp + z1 * sp;
      const k = dist / (dist - toward);
      return { rx: x1 * k, ry: (y1 * sp + z1 * cp) * k, depth: toward, k };
    };
    // La caja entera (superficie y suelo de profundidad) se encuadra en el lienzo desde cualquier ángulo.
    const box8 = ([scene.south, scene.north] as const).flatMap(lat => ([scene.west, scene.east] as const).flatMap(lng => [at(lng, lat, 0), at(lng, lat, scene.floorKm)])).map(raw);
    const [minX, maxX] = [Math.min(...box8.map(r => r.rx)), Math.max(...box8.map(r => r.rx))];
    const [minY, maxY] = [Math.min(...box8.map(r => r.ry)), Math.max(...box8.map(r => r.ry))];
    // Más margen a la izquierda: ahí van los kilómetros de profundidad.
    const [marginL, marginR, marginV] = [w < 480 ? 44 : 56, 18, 26];
    const scale = Math.min((w - marginL - marginR) / (maxX - minX), (h - 2 * marginV) / (maxY - minY)) * camera.zoom;
    const originX = marginL + (w - marginL - marginR) / 2;
    const project = (p: Point) => {
      const r = raw(p);
      return { sx: originX + (r.rx - (minX + maxX) / 2) * scale, sy: h / 2 - (r.ry - (minY + maxY) / 2) * scale, depth: r.depth, k: r.k };
    };
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

    // Todo lo que está bajo tierra se ordena de lejos a cerca.
    type Drawable = { depth: number; draw: () => void };
    const drawables: Drawable[] = [];
    const items: Item[] = events.map(event => {
      const [lng, lat, depthRaw] = event.geometry.coordinates;
      const depth = depthRaw ?? 0;
      const mag = event.properties.mag;
      const m = mag ?? 0;
      const tier: Item["tier"] = m >= 5 ? "high" : m >= 3 ? "mid" : "low";
      const base = tier === "high" ? 7.5 + (m - 5) * 2.4 : tier === "mid" ? 4 + (m - 3) * 1.4 : 3;
      return { event, mag, depth, fixed: isRoundDepth(depthRaw), tier, radius: base, p: at(lng, lat, depth), top: at(lng, lat, 0) };
    });

    if (fault) {
      for (const sub of fault.subfaults) {
        const pts = sub.ring.map(([lng, lat, d]) => at(lng, lat, d));
        const projected = pts.map(project);
        const depth = projected.reduce((s, q) => s + q.depth, 0) / 4;
        drawables.push({
          depth,
          draw: () => {
            ctx.beginPath();
            projected.forEach((q, i) => (i ? ctx.lineTo(q.sx, q.sy) : ctx.moveTo(q.sx, q.sy)));
            ctx.closePath();
            ctx.fillStyle = slipColor(sub.slip, fault.maxSlipM, 0.62);
            ctx.fill();
            ctx.strokeStyle = "rgba(255,255,255,.14)";
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
      const color = isMain ? COLORS.main : isLatest ? COLORS.latest : COLORS[item.tier];
      const r = (isMain ? 11 : item.radius) * Math.min(1.35, Math.max(0.75, q.k));
      drawables.push({
        depth: q.depth,
        draw: () => {
          // Hilo vertical desde el epicentro (en la superficie) hasta el hipocentro.
          ctx.strokeStyle = selected ? "rgba(255,255,255,.7)" : "rgba(190,210,240,.28)";
          ctx.lineWidth = selected ? 1.4 : 0.8;
          ctx.setLineDash([2, 3]);
          ctx.beginPath();
          ctx.moveTo(top.sx, top.sy);
          ctx.lineTo(q.sx, q.sy);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.arc(q.sx, q.sy, r, 0, Math.PI * 2);
          if (item.fixed && !isMain) {
            ctx.fillStyle = `${color}33`;
            ctx.fill();
            ctx.lineWidth = 1.6;
            ctx.strokeStyle = color;
            ctx.stroke();
          } else {
            ctx.fillStyle = color;
            ctx.globalAlpha = item.tier === "low" ? 0.85 : 0.95;
            ctx.fill();
            ctx.globalAlpha = 1;
            ctx.lineWidth = isMain || item.tier === "high" ? 1.8 : item.tier === "mid" ? 1 : 0.7;
            ctx.strokeStyle = item.tier === "low" ? "rgba(7,21,43,.7)" : "rgba(255,255,255,.85)";
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
      if (isMain || (item.mag ?? 0) >= 6 || selected) labeled.push({ sx: q.sx, sy: q.sy - r - 7, text: `M ${item.mag === null ? "—" : item.mag.toFixed(1)}${selected ? ` · ${item.depth} km` : ""}`, rank: selected ? 99 : item.mag ?? 0 });
    }

    // Fondo: lo más lejano primero. El suelo (superficie) se pinta entre lo profundo y los epicentros.
    drawables.sort((a, b) => a.depth - b.depth);
    drawables.forEach(d => d.draw());

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
    // De lado la superficie se ve de canto: sin cuadrícula ni grados, que solo se amontonarían.
    const edgeOn = sp < 0.25;
    for (let lat = Math.ceil(scene.south); lat <= scene.north && !edgeOn; lat++) {
      line(at(scene.west, lat, 0), at(scene.east, lat, 0));
      const q = project(at(scene.west, lat, 0));
      ctx.fillText(`${lat}° N`, q.sx - 18, q.sy - 5);
    }
    for (let lng = Math.ceil(scene.west); lng <= scene.east && !edgeOn; lng++) {
      line(at(lng, scene.south, 0), at(lng, scene.north, 0));
      const q = project(at(lng, scene.south, 0));
      ctx.fillText(`${Math.abs(lng)}° O`, q.sx, q.sy + 6);
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

    ctx.lineJoin = "round";
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(255,255,255,.88)";
    ctx.fillStyle = "rgba(255,255,255,.05)";
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

    // Epicentros: un punto sobre la superficie, justo encima de cada sismo.
    for (const item of items) {
      if (pending(item.event)) continue;
      const q = project(item.top);
      ctx.beginPath();
      ctx.arc(q.sx, q.sy, 1.8, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,.7)";
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
  }, [camera, size, scene, events, exaggeration, mainshock, latest, selectedId, replay, region, fault, felt, shaking]);

  // Cambia de cámara con una transición corta (o de golpe si la persona pidió menos movimiento).
  const goTo = (target: Camera) => {
    cancelAnimationFrame(frame.current);
    if (reducedMotion()) {
      setCamera(target);
      return;
    }
    const from = cameraRef.current;
    let begin = -1;
    const step = (now: number) => {
      if (begin < 0) begin = now;
      const t = Math.min(1, (now - begin) / 650);
      const e = 1 - Math.pow(1 - t, 3);
      setCamera({ yaw: from.yaw + (target.yaw - from.yaw) * e, pitch: from.pitch + (target.pitch - from.pitch) * e, zoom: from.zoom + (target.zoom - from.zoom) * e });
      if (t < 1) frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
  };
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const drag = useRef<{ pointers: Map<number, { x: number; y: number }>; moved: number; pinch: number | null } | null>(null);
  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    cancelAnimationFrame(frame.current);
    event.currentTarget.setPointerCapture(event.pointerId);
    const state = drag.current ?? { pointers: new Map(), moved: 0, pinch: null };
    state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (state.pointers.size === 1) state.moved = 0;
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
      const [a, b] = [...state.pointers.values()];
      const gap = Math.hypot(a.x - b.x, a.y - b.y);
      if (state.pinch) setCamera(c => ({ ...c, zoom: clamp(c.zoom * (gap / state.pinch!), 0.5, 5) }));
      state.pinch = gap;
      return;
    }
    setCamera(c => ({ ...c, yaw: c.yaw + dx * 0.4, pitch: clamp(c.pitch - dy * 0.3, 3, 90) }));
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const state = drag.current;
    if (!state) return;
    const wasClick = state.pointers.size === 1 && state.moved < 6;
    state.pointers.delete(event.pointerId);
    state.pinch = null;
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
      setCamera(c => ({ ...c, zoom: clamp(c.zoom * Math.exp(-event.deltaY * 0.0025), 0.5, 5) }));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const onKey = (event: ReactKeyboardEvent) => {
    const step = event.shiftKey ? 15 : 6;
    const handled = {
      ArrowLeft: () => setCamera(c => ({ ...c, yaw: c.yaw - step })),
      ArrowRight: () => setCamera(c => ({ ...c, yaw: c.yaw + step })),
      ArrowUp: () => setCamera(c => ({ ...c, pitch: clamp(c.pitch + step, 3, 90) })),
      ArrowDown: () => setCamera(c => ({ ...c, pitch: clamp(c.pitch - step, 3, 90) })),
      "+": () => setCamera(c => ({ ...c, zoom: clamp(c.zoom * 1.2, 0.5, 5) })),
      "=": () => setCamera(c => ({ ...c, zoom: clamp(c.zoom * 1.2, 0.5, 5) })),
      "-": () => setCamera(c => ({ ...c, zoom: clamp(c.zoom / 1.2, 0.5, 5) })),
      "0": () => goTo(home()),
    }[event.key];
    if (!handled) return;
    event.preventDefault();
    handled();
  };

  const zoomBy = (factor: number) => setCamera(c => ({ ...c, zoom: clamp(c.zoom * factor, 0.5, 5) }));
  const home = (): Camera => homeFor(size.w, size.h);
  const view = (name: "perspective" | "top" | "side") => goTo({ ...(name === "perspective" ? home() : PRESETS[name]), zoom: cameraRef.current.zoom });
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
          onKeyDown={onKey}
        />
        <p id="q3-help" className="sr-only">
          Arrastra o usa las flechas del teclado para girar, más y menos para acercar o alejar, y cero para volver a la vista inicial. Pulsa un punto para ver ese sismo.
        </p>
      </div>
      <div className="q3-panel">
        {selectedEvent && (
          <p className="q3-selected" role="status">
            <strong>M {selectedEvent.properties.mag === null ? "—" : selectedEvent.properties.mag.toFixed(1)}</strong>{" "}
            {selectedEvent.properties.place ?? "lugar no especificado"} · {clock.format(new Date(selectedEvent.properties.time))} ·{" "}
            {depthOf(selectedEvent) === undefined ? "profundidad no disponible" : `${depthOf(selectedEvent)} km de profundidad${isRoundDepth(depthOf(selectedEvent)) ? " (asignada)" : ""}`}
          </p>
        )}
        <div className="q3-bar" role="group" aria-label="Controles de la vista 3D">
          <div className="q3-seg" role="group" aria-label="Punto de vista">
            {([["perspective", "Perspectiva"], ["top", "Desde arriba"], ["side", "De lado"]] as const).map(([name, label]) => (
              <button key={name} type="button" aria-pressed={which === name} className={which === name ? "on" : ""} onClick={() => view(name)}>{label}</button>
            ))}
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
          {layerControls}
        </div>
        <div className="q3-legend">
          <span><i className="q3-dot" style={{ background: COLORS.low }} />Menor a 3</span>
          <span><i className="q3-dot" style={{ background: COLORS.mid }} />3 a 4.9</span>
          <span><i className="q3-dot" style={{ background: COLORS.high }} />5 o más</span>
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
        <details className="q3-more">
          <summary>Cómo leer esta vista</summary>
          <p>
            La superficie es el plano con la costa de Panamá; cada sismo está a la profundidad que reporta su catálogo, y el hilo punteado lo une con su epicentro en la superficie. Los puntos huecos tienen una profundidad de exactamente 10 o 5 km: cuando el catálogo no logra calcularla, la asigna (el USGS lo marca como «operator assigned»), así que no es una medida precisa.
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
