"use client";
/* eslint-disable @typescript-eslint/no-explicit-any -- Leaflet se carga como script global y no trae tipos. */

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { isAftershock, shakeFor, type Earthquake, type FocusRequest, type LiveAlert, type ReplayStep } from "../lib/earthquakes";
import { PANAMA_MAP_BOUNDS, PANAMA_RINGS } from "../lib/panama";

type Props = {
  events: Earthquake[];
  mainshock: Earthquake | null;
  focus: FocusRequest | null;
  shake: boolean;
  alert: LiveAlert | null;
  replayKey: number;
  onSelect: (id: string) => void;
  onReplay: (step: ReplayStep | null) => void;
};

const dateTime = new Intl.DateTimeFormat("es-PA", {
  timeZone: "America/Panama", day: "numeric", month: "short", year: "numeric",
  hour: "2-digit", minute: "2-digit", hour12: true,
});

const STEP_MS = 900;
const RECENT_MS = 3 * 3_600_000;
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Hace temblar el mapa con la fuerza y duración que corresponden a la magnitud (ver shakeFor).
const shakeTimers = new WeakMap<HTMLElement, number>();
function shakeElement(container: HTMLElement, mag: number | null, scale = 1) {
  const { px, ms } = shakeFor(mag);
  container.style.setProperty("--shake", `${(px * scale).toFixed(1)}px`);
  container.style.setProperty("--shake-ms", `${ms}ms`);
  container.classList.remove("quake-shake");
  container.getBoundingClientRect(); // fuerza el reflujo para reiniciar la animación si ya estaba en marcha
  container.classList.add("quake-shake");
  window.clearTimeout(shakeTimers.get(container));
  shakeTimers.set(container, window.setTimeout(() => container.classList.remove("quake-shake"), ms + 60));
}

export default function QuakeMap({ events, mainshock, focus, shake, alert, replayKey, onSelect, onReplay }: Props) {
  const [ready, setReady] = useState(false);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const focusedRef = useRef<Props["focus"]>(null);
  const popIn = useRef(true);
  const fresh = useRef<{ id: string; until: number } | null>(null);
  const latest = useRef({ events, mainshock, shake, onSelect, onReplay });
  useEffect(() => {
    latest.current = { events, mainshock, shake, onSelect, onReplay };
  });

  useEffect(() => {
    if (!ready || mapRef.current) return;
    const L = (window as any).L;
    if (!L) return;
    const map = L.map("leaflet-map", {
      scrollWheelZoom: false, zoomControl: false,
      minZoom: 6, maxBounds: PANAMA_MAP_BOUNDS, maxBoundsViscosity: 0.9,
    }).setView([8.46, -80.4], window.innerWidth < 760 ? 6 : 7);
    L.control.zoom({ position: "topright" }).addTo(map);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
    }).addTo(map);

    // Panamá resaltado: se atenúa todo lo que queda fuera de su contorno y se dibuja el borde.
    const rings = PANAMA_RINGS.map(ring => ring.map(([lng, lat]) => [lat, lng]));
    const world = [[-85, -200], [-85, 200], [85, 200], [85, -200]];
    L.polygon([world, ...rings], { className: "panama-mask", stroke: false, fillColor: "#072357", fillOpacity: 0.5, interactive: false }).addTo(map);
    const outline = L.polygon(rings, { className: "panama-outline", color: "#ffffff", weight: 2.5, fill: false, interactive: false }).addTo(map);
    outline.getElement()?.setAttribute("pathLength", "1");

    // De cerca el contorno simplificado ya no coincide con la costa del mapa: se desvanece.
    const container = map.getContainer();
    const markDetail = () => container.classList.toggle("map-detail", map.getZoom() >= 9);
    map.on("zoomend", markDetail);

    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);
    const markers = markersRef.current;
    return () => {
      map.off("zoomend", markDetail);
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      markers.clear();
    };
  }, [ready]);

  useEffect(() => {
    const L = (window as any).L;
    const layer = layerRef.current;
    if (!ready || !L || !layer) return;
    layer.clearLayers();
    markersRef.current.clear();
    const chronological = [...events].sort((a, b) => a.properties.time - b.properties.time).map(event => event.id);
    const pop = popIn.current && !reducedMotion();
    const now = Date.now();
    for (const event of events) {
      const [lng, lat, depth] = event.geometry.coordinates;
      const mag = event.properties.mag;
      const isMain = event.id === mainshock?.id;
      const size = isMain ? 40 : Math.max(12, Math.min(34, 11 + (mag ?? 0) * 3.4));
      const kind = isMain ? " main" : mainshock && isAftershock(event, mainshock) ? " after" : "";
      const recent = !isMain && now - event.properties.time < RECENT_MS ? " recent" : "";
      const highlight = fresh.current?.id === event.id && now < fresh.current.until ? " fresh" : "";
      const icon = L.divIcon({
        className: "",
        html: `<span class="quake-marker${(mag ?? 0) >= 5 ? " high" : ""}${kind}${recent}${highlight}${pop ? " pop" : ""}" style="width:${size}px;height:${size}px;--i:${chronological.indexOf(event.id)}">${isMain ? "<i></i><i></i>" : ""}</span>`,
        iconSize: [size, size], iconAnchor: [size / 2, size / 2],
      });
      const marker = L.marker([lat, lng], {
        icon,
        zIndexOffset: isMain ? 1000 : 0,
        title: `Sismo M ${mag === null ? "—" : mag.toFixed(1)}: ${event.properties.place || "Ubicación no especificada"}`,
      }).addTo(layer);
      const popup = document.createElement("div");
      const title = document.createElement("div");
      title.className = "popup-title";
      title.textContent = `M ${mag === null ? "—" : mag.toFixed(1)} · ${event.properties.place || "Ubicación no especificada"}`;
      const meta = document.createElement("div");
      meta.className = "popup-meta";
      meta.textContent = `${dateTime.format(new Date(event.properties.time))} · ${Number.isFinite(depth) ? `${Math.round(depth!)} km` : "Profundidad no disponible"}`;
      // appendChild y no append: los tipos de workers-types pisan Element.append.
      popup.appendChild(title);
      popup.appendChild(meta);
      marker.bindPopup(popup);
      marker.on("click", () => latest.current.onSelect(event.id));
      markersRef.current.set(event.id, marker);
    }
    if (events.length) popIn.current = false;
  }, [events, mainshock, ready]);

  useEffect(() => {
    if (!focus || focusedRef.current === focus || !mapRef.current) return;
    const marker = markersRef.current.get(focus.id);
    if (!marker) return;
    focusedRef.current = focus;
    const map = mapRef.current;
    // Abrir el popup antes de que termine el movimiento animado lo cancela.
    map.once("moveend", () => {
      markersRef.current.get(focus.id)?.openPopup();
      const target = latest.current.events.find(event => event.id === focus.id);
      if (!focus.quiet && target && latest.current.shake && !reducedMotion()) shakeElement(map.getContainer(), target.properties.mag, 0.7);
    });
    const zoom = Math.max(map.getZoom(), 9);
    if (reducedMotion()) map.setView(marker.getLatLng(), zoom, { animate: false });
    else map.flyTo(marker.getLatLng(), zoom, { duration: 1.4 });
  }, [focus, events, ready]);

  // Sismo nuevo mientras la página está abierta: su marcador destaca y el mapa tiembla según su magnitud.
  useEffect(() => {
    const map = mapRef.current;
    if (!alert || !map) return;
    const span = markersRef.current.get(alert.event.id)?.getElement()?.firstElementChild as HTMLElement | undefined;
    fresh.current = { id: alert.event.id, until: Date.now() + 8000 };
    span?.classList.add("fresh");
    if (latest.current.shake && !reducedMotion()) shakeElement(map.getContainer(), alert.event.properties.mag);
    const timer = window.setTimeout(() => {
      fresh.current = null;
      markersRef.current.get(alert.event.id)?.getElement()?.firstElementChild?.classList.remove("fresh");
    }, 8000);
    return () => window.clearTimeout(timer);
  }, [alert]);

  // Reproduce la secuencia: el sismo principal y sus réplicas aparecen en orden cronológico.
  useEffect(() => {
    const map = mapRef.current;
    if (!replayKey || !map) return;
    const { events: all, mainshock: main } = latest.current;
    const sequence = (main ? all.filter(event => event.id === main.id || isAftershock(event, main)) : all)
      .slice()
      .sort((a, b) => a.properties.time - b.properties.time);
    if (sequence.length < 2) return;

    const L = (window as any).L;
    const container = map.getContainer() as HTMLElement;
    const still = reducedMotion();
    const spans: HTMLElement[] = [];
    const byId = new Map<string, HTMLElement>();
    for (const [id, marker] of markersRef.current) {
      const span = marker.getElement()?.firstElementChild as HTMLElement | undefined;
      if (!span) continue;
      span.classList.remove("pop");
      span.classList.add("replay-hidden");
      spans.push(span);
      byId.set(id, span);
    }

    map.closePopup();
    const area = L.latLngBounds(sequence.map(event => [event.geometry.coordinates[1], event.geometry.coordinates[0]]));
    map.flyToBounds(area, { padding: [70, 70], maxZoom: 9, animate: !still, duration: 1.2 });

    const total = sequence.length;
    const start = still ? 0 : 1300;
    const timers: number[] = [];
    latest.current.onReplay({ index: 0, total, time: sequence[0].properties.time, mag: null });
    sequence.forEach((event, i) => {
      timers.push(window.setTimeout(() => {
        const span = byId.get(event.id);
        span?.classList.remove("replay-hidden");
        span?.classList.add("replay-pop");
        if (!still && latest.current.shake) {
          shakeElement(container, event.properties.mag);
          navigator.vibrate?.(Math.round(shakeFor(event.properties.mag).ms * 0.6));
        }
        latest.current.onReplay({ index: i + 1, total, time: event.properties.time, mag: event.properties.mag });
      }, start + i * STEP_MS));
    });
    timers.push(window.setTimeout(() => {
      for (const span of spans) span.classList.remove("replay-hidden");
      latest.current.onReplay(null);
    }, start + total * STEP_MS + 600));

    return () => {
      timers.forEach(timer => window.clearTimeout(timer));
      container.classList.remove("quake-shake");
      for (const span of spans) span.classList.remove("replay-hidden", "replay-pop");
      latest.current.onReplay(null);
    };
  }, [replayKey]);

  return (
    <>
      <Script src="/leaflet.js" strategy="afterInteractive" onReady={() => setReady(true)} />
      <div id="leaflet-map" role="img" aria-label="Mapa interactivo de sismos en Panamá" />
      {!ready && <div className="map-fallback">Cargando mapa…</div>}
    </>
  );
}
