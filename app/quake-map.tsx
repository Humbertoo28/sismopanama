"use client";
/* eslint-disable @typescript-eslint/no-explicit-any -- Leaflet se carga como script global y no trae tipos. */

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { isAftershock, shakeFor, type Earthquake, type FocusRequest, type LiveAlert, type ReplayStep } from "../lib/earthquakes";
import { PANAMA_MAP_BOUNDS, PANAMA_RINGS } from "../lib/panama";
import { reducedMotion, shakeElement, vibrate } from "./shake";

type Props = {
  events: Earthquake[];
  mainshock: Earthquake | null;
  focus: FocusRequest | null;
  alert: LiveAlert | null;
  replayKey: number;
  onSelect: (id: string) => void;
  onReplay: (step: ReplayStep | null) => void;
};

const dateTime = new Intl.DateTimeFormat("es-PA", {
  timeZone: "America/Panama", day: "numeric", month: "short", year: "numeric",
  hour: "2-digit", minute: "2-digit", hour12: true,
});

export type MapLayerMode = "satellite" | "esri" | "streets";

const TILE_CONFIG: Record<
  MapLayerMode,
  {
    url: string;
    options: {
      subdomains?: string[];
      maxZoom: number;
      attribution: string;
    };
    overlayUrl?: string;
  }
> = {
  satellite: {
    // Google Híbrido: fotos satelitales nítidas + nombres de ciudades, carreteras y límites de Panamá
    url: "https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
    options: {
      subdomains: ["0", "1", "2", "3"],
      maxZoom: 20,
      attribution: "Imágenes satelitales &copy; Google",
    },
  },
  esri: {
    // Esri World Imagery (satelital puro de alta resolución) con límites de referencia
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    options: {
      maxZoom: 19,
      attribution: "Tiles &copy; Esri &mdash; Maxar, Earthstar Geographics",
    },
    overlayUrl:
      "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
  },
  streets: {
    // Esri World Street Map (mapa callejero y relieve topográfico)
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
    options: {
      maxZoom: 19,
      attribution: "Tiles &copy; Esri",
    },
  },
};

const STEP_MS = 900;
const RECENT_MS = 3 * 3_600_000;
export default function QuakeMap({ events, mainshock, focus, alert, replayKey, onSelect, onReplay }: Props) {
  const [ready, setReady] = useState(() => typeof window !== "undefined" && !!(window as any).L);
  const [mapMode, setMapMode] = useState<MapLayerMode>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("sismo_map_mode") as MapLayerMode | null;
      if (saved && (saved === "satellite" || saved === "esri" || saved === "streets")) {
        return saved;
      }
    }
    return "satellite";
  });
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const tileLayerRef = useRef<any>(null);
  const overlayLayerRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const focusedRef = useRef<Props["focus"]>(null);
  const popIn = useRef(true);
  const fresh = useRef<{ id: string; until: number } | null>(null);
  const latest = useRef({ events, mainshock, onSelect, onReplay });
  useEffect(() => {
    latest.current = { events, mainshock, onSelect, onReplay };
  });

  // Respaldo de detección de Leaflet si onReady ya ocurrió antes
  useEffect(() => {
    if (ready || typeof window === "undefined") return;
    const interval = window.setInterval(() => {
      if ((window as any).L) {
        setReady(true);
        window.clearInterval(interval);
      }
    }, 150);
    return () => window.clearInterval(interval);
  }, [ready]);

  const handleModeChange = (mode: MapLayerMode) => {
    setMapMode(mode);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("sismo_map_mode", mode);
      } catch {
        // Ignorar si localStorage está bloqueado
      }
    }
  };

  useEffect(() => {
    if (!ready || mapRef.current) return;
    const L = (window as any).L;
    if (!L) return;
    const map = L.map("leaflet-map", {
      scrollWheelZoom: false, zoomControl: false,
      minZoom: 6, maxBounds: PANAMA_MAP_BOUNDS, maxBoundsViscosity: 0.9,
    }).setView([8.46, -80.4], window.innerWidth < 760 ? 6 : 7);
    L.control.zoom({ position: "topright" }).addTo(map);

    // Panamá resaltado: se atenúa suavemente lo que queda fuera de su contorno y se dibuja el borde.
    const rings = PANAMA_RINGS.map(ring => ring.map(([lng, lat]) => [lat, lng]));
    const world = [[-85, -200], [-85, 200], [85, 200], [85, -200]];
    L.polygon([world, ...rings], { className: "panama-mask", stroke: false, fillColor: "#072357", fillOpacity: 0.35, interactive: false }).addTo(map);
    const outline = L.polygon(rings, { className: "panama-outline", color: "#ffffff", weight: 2.2, fill: false, interactive: false }).addTo(map);
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
      tileLayerRef.current = null;
      overlayLayerRef.current = null;
      markers.clear();
    };
  }, [ready]);

  // Actualización dinámica de la capa satelital o callejera
  useEffect(() => {
    const map = mapRef.current;
    const L = (window as any).L;
    if (!ready || !map || !L) return;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
      tileLayerRef.current = null;
    }
    if (overlayLayerRef.current) {
      map.removeLayer(overlayLayerRef.current);
      overlayLayerRef.current = null;
    }

    const cfg = TILE_CONFIG[mapMode];
    const baseTile = L.tileLayer(cfg.url, cfg.options).addTo(map);
    if (baseTile.bringToBack) {
      baseTile.bringToBack();
    }
    tileLayerRef.current = baseTile;

    if (cfg.overlayUrl) {
      const overlayTile = L.tileLayer(cfg.overlayUrl, { maxZoom: 19 }).addTo(map);
      overlayLayerRef.current = overlayTile;
    }
  }, [mapMode, ready]);

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
      meta.textContent = `${dateTime.format(new Date(event.properties.time))} · ${Number.isFinite(depth) ? `${Math.round(depth!)} km` : "Profundidad no disponible"}${event.properties.source === "emsc" ? " · Fuente: EMSC" : event.properties.source === "igc" ? " · Fuente: IGC" : ""}`;
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
      if (!focus.quiet && target && !reducedMotion()) shakeElement(map.getContainer(), target.properties.mag, 0.7);
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
    if (!reducedMotion()) shakeElement(map.getContainer(), alert.event.properties.mag);
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
        if (!still) {
          shakeElement(container, event.properties.mag);
          vibrate(Math.round(shakeFor(event.properties.mag).ms * 0.6));
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
      <Script
        src="/leaflet.js"
        strategy="afterInteractive"
        onLoad={() => setReady(true)}
        onReady={() => setReady(true)}
      />
      <div id="leaflet-map" role="img" aria-label="Mapa interactivo de sismos en Panamá" />
      <div className="map-layer-selector" role="group" aria-label="Modo de visualización del mapa">
        <button
          type="button"
          className={`layer-btn${mapMode === "satellite" ? " active" : ""}`}
          onClick={() => handleModeChange("satellite")}
          title="Vista satelital híbrida (imágenes + nombres y rutas)"
        >
          🛰️ Satélite
        </button>
        <button
          type="button"
          className={`layer-btn${mapMode === "esri" ? " active" : ""}`}
          onClick={() => handleModeChange("esri")}
          title="Vista satelital pura Esri ArcGIS"
        >
          🌍 Esri Sat
        </button>
        <button
          type="button"
          className={`layer-btn${mapMode === "streets" ? " active" : ""}`}
          onClick={() => handleModeChange("streets")}
          title="Mapa callejero y relieve"
        >
          🗺️ Callejero
        </button>
      </div>
      {!ready && <div className="map-fallback">Cargando mapa satelital…</div>}
    </>
  );
}
