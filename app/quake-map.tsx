"use client";
/* eslint-disable @typescript-eslint/no-explicit-any -- Leaflet se carga como script global y no trae tipos. */

import Script from "next/script";
import { lazy, Suspense, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { isAftershock, shakeFor, type Earthquake, type FocusRequest, type LiveAlert, type ReplayStep } from "../lib/earthquakes";
import { PANAMA_MAP_BOUNDS, PANAMA_RINGS } from "../lib/panama";
import { placeLabel } from "../lib/place-of";
import { PROVINCE_BY_ID, provinceLabel } from "../lib/province-of";
import { PROVINCE_LABELS } from "../lib/province-labels";
import { PROVINCES } from "../lib/provinces";
import { KIND_INFO, PLATE_BOUNDARIES, PLATE_LABELS, PLATE_NAMES } from "../lib/plates";
import PlatesLegend from "./plates-legend";
import { intensityColor, slipColor } from "../lib/usgs-colors";
import { loadMainshockDetail, useMainshockDetail } from "./mainshock-detail";
import { reducedMotion, shakeElement, vibrate } from "./shake";

// La vista 3D solo se descarga cuando alguien la abre.
const Quake3D = lazy(() => import("./quake-3d"));

type Props = {
  events: Earthquake[];
  mainshock: Earthquake | null;
  focus: FocusRequest | null;
  alert: LiveAlert | null;
  replayKey: number;
  // Provincia o comarca (id de lib/provinces.ts) que se está mirando: se dibuja su borde y el mapa se acerca a ella.
  region: string | null;
  // Ciudad o localidad elegida: se marca con su nombre y el mapa se acerca a ella y a sus sismos.
  place: { name: string; lat: number; lng: number } | null;
  selectedId: string | null;
  replay: ReplayStep | null;
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
const MAP_MODE_KEY = "sismo_map_mode";
const MAP_MODE_EVENT = "sismo-map-mode";
const subscribeMapMode = (notify: () => void) => {
  window.addEventListener("storage", notify);
  window.addEventListener(MAP_MODE_EVENT, notify);
  return () => {
    window.removeEventListener("storage", notify);
    window.removeEventListener(MAP_MODE_EVENT, notify);
  };
};
// Lo elegido en esta visita manda aunque el navegador no deje guardar (modo privado).
let chosenMapMode: MapLayerMode | null = null;
const readMapMode = (): MapLayerMode => {
  if (chosenMapMode) return chosenMapMode;
  try {
    const saved = localStorage.getItem(MAP_MODE_KEY);
    return saved === "esri" || saved === "streets" || saved === "satellite" ? saved : "satellite";
  } catch {
    return "satellite";
  }
};
export default function QuakeMap({ events, mainshock, focus, alert, replayKey, region, place, selectedId, replay, onSelect, onReplay }: Props) {
  const [ready, setReady] = useState(() => typeof window !== "undefined" && !!(window as any).L);
  // El modo guardado se lee con useSyncExternalStore: el servidor (y la hidratación) usan «satélite» y, ya en el
  // navegador, pasa al guardado sin el aviso de que el HTML no coincide.
  const mapMode = useSyncExternalStore(subscribeMapMode, readMapMode, () => "satellite" as MapLayerMode);
  // Vista 3D y capas con datos del USGS (ruptura de la falla y «lo que se sintió»), compartidas por el mapa y el 3D.
  const [view3d, setView3d] = useState(false);
  const [layers, setLayers] = useState({ rupture: false, felt: false, shaking: false, plates: false, wave: false });
  const usgs = useMainshockDetail();
  const usgsLayerRef = useRef<any>(null);
  const platesLayerRef = useRef<any>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const tileLayerRef = useRef<any>(null);
  const overlayLayerRef = useRef<any>(null);
  const regionLayerRef = useRef<any>(null);
  const placeLayerRef = useRef<any>(null);
  const hadRegion = useRef(false);
  const markersRef = useRef<Map<string, any>>(new Map());
  const focusedRef = useRef<Props["focus"]>(null);
  const popIn = useRef(true);
  // Huella de lo último que se dibujó: si los datos no cambiaron, los marcadores no se tocan.
  const builtKey = useRef("");
  // Durante una reproducción: sismos que aún no les toca aparecer. Sobrevive si el mapa rehace los marcadores.
  const replayHidden = useRef<Set<string> | null>(null);
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
    setView3d(false);
    chosenMapMode = mode;
    try {
      localStorage.setItem(MAP_MODE_KEY, mode);
    } catch {
      // Sin almacenamiento, la elección vale solo hasta recargar.
    }
    window.dispatchEvent(new Event(MAP_MODE_EVENT));
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
    // Los datos del USGS van por debajo de los marcadores pero sobre el sombreado de fuera de Panamá.
    map.createPane("felt").style.zIndex = "405";
    map.createPane("rupture").style.zIndex = "410";
    map.createPane("plates").style.zIndex = "415";
    // Límites y nombres de provincias y comarcas: aparecen al acercar (zoom 7 a 10) y no estorban al tocar los sismos.
    const provincePane = map.createPane("provinces");
    provincePane.style.zIndex = "420";
    provincePane.style.pointerEvents = "none";
    for (const division of PROVINCES) {
      L.polygon(division.rings.map(ring => ring.map(([lng, lat]) => [lat, lng])), {
        pane: "provinces", className: "province-line", interactive: false, color: "#ffffff", weight: 1, opacity: 0.5, fill: false,
      }).addTo(map);
    }
    for (const label of PROVINCE_LABELS) {
      const name = label.name.replace(/[&<>"]/g, "");
      L.marker([label.lat, label.lng], {
        pane: "provinces", interactive: false, keyboard: false,
        icon: L.divIcon({ className: "province-label-wrap", html: `<span class="province-label" aria-hidden="true">${name}</span>`, iconSize: [0, 0] }),
      }).addTo(map);
    }
    const syncProvinces = () => {
      const zoom = map.getZoom();
      map.getContainer().classList.toggle("show-provinces", zoom >= 7 && zoom <= 10);
    };
    map.on("zoomend", syncProvinces);
    syncProvinces();

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
      map.off("zoomend", syncProvinces);
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      tileLayerRef.current = null;
      overlayLayerRef.current = null;
      regionLayerRef.current = null;
      placeLayerRef.current = null;
      usgsLayerRef.current = null;
      platesLayerRef.current = null;
      hadRegion.current = false;
      builtKey.current = "";
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
    const now = Date.now();
    // Cada consulta (cada ~25 s) trae una lista nueva aunque no haya nada nuevo. Rehacer entonces todos los
    // marcadores cerraba el popup abierto y, en plena reproducción de la secuencia, los mostraba todos de golpe.
    const key = `${mainshock?.id ?? ""}|${events
      .map(event => `${event.id}:${event.properties.mag}:${event.properties.time}${event.id !== mainshock?.id && now - event.properties.time < RECENT_MS ? "r" : ""}`)
      .join(",")}`;
    if (key === builtKey.current) return;
    builtKey.current = key;
    layer.clearLayers();
    markersRef.current.clear();
    const chronological = [...events].sort((a, b) => a.properties.time - b.properties.time).map(event => event.id);
    const latestEvent = events.reduce<Earthquake | null>(
      (newest, e) => (!newest || e.properties.time > newest.properties.time ? e : newest),
      null,
    );
    const pop = popIn.current && !reducedMotion();
    for (const event of events) {
      const [lng, lat, depth] = event.geometry.coordinates;
      const mag = event.properties.mag;
      const isLatest = event.id === latestEvent?.id;
      const isMain = event.id === mainshock?.id;

      const ageHours = (now - event.properties.time) / 3_600_000;
      const isVeryRecent = ageHours <= 3;
      const isRecent12h = ageHours <= 12;
      const isAged = ageHours > 24;

      // Escala de tamaños balanceada: las réplicas viejas son pequeños puntos sutiles
      let baseSize = 8;
      const m = mag ?? 0;
      if (m >= 6.0) baseSize = 22;
      else if (m >= 5.0) baseSize = 16;
      else if (m >= 4.0) baseSize = 12;
      else if (m >= 3.0) baseSize = 9;
      else baseSize = 7;

      const size = isLatest
        ? 30
        : isMain
        ? 32
        : isVeryRecent
        ? baseSize + 3
        : baseSize;

      const kind = isLatest ? " latest" : isMain ? " main" : mainshock && isAftershock(event, mainshock) ? " after" : "";
      const ageClass = isVeryRecent ? " recent-3h" : isRecent12h ? " recent-12h" : isAged ? " aged" : "";
      const recent = !isMain && !isLatest && isVeryRecent ? " recent" : "";
      const highlight = fresh.current?.id === event.id && now < fresh.current.until ? " fresh" : "";
      const hiddenByReplay = replayHidden.current?.has(event.id) ? " replay-hidden" : "";
      const hasRipples = isLatest || (isMain && !latestEvent);

      const zIndex = isLatest
        ? 1500
        : isMain
        ? 1400
        : isVeryRecent
        ? 800 + Math.round(m * 20)
        : isRecent12h
        ? 400 + Math.round(m * 10)
        : 50 + Math.round(m * 5);

      const icon = L.divIcon({
        className: "",
        html: `<span class="quake-marker${m >= 5 ? " high" : m >= 3 ? " m-mid" : " m-low"}${kind}${recent}${ageClass}${highlight}${hiddenByReplay}${pop ? " pop" : ""}" style="width:${size}px;height:${size}px;--i:${chronological.indexOf(event.id)}">${hasRipples ? "<i></i><i></i>" : ""}</span>`,
        iconSize: [size, size], iconAnchor: [size / 2, size / 2],
      });
      const marker = L.marker([lat, lng], {
        icon,
        zIndexOffset: zIndex,
        title: `${isLatest ? (mainshock && isAftershock(event, mainshock) ? "Última réplica - " : "Último sismo - ") : isMain ? "Sismo principal - " : ""}M ${mag === null ? "—" : mag.toFixed(1)}: ${event.properties.place || "Ubicación no especificada"}`,
      }).addTo(layer);
      const popup = document.createElement("div");
      if (isLatest) {
        const badge = document.createElement("div");
        badge.className = "popup-badge-latest";
        badge.textContent = mainshock && isAftershock(event, mainshock)
          ? "📍 ÚLTIMA RÉPLICA · SISMO M 7.7"
          : "📍 ÚLTIMO SISMO REGISTRADO";
        popup.appendChild(badge);
      } else if (isMain) {
        const badge = document.createElement("div");
        badge.className = "popup-badge-main";
        badge.textContent = "⭐ SISMO PRINCIPAL · M 7.7";
        popup.appendChild(badge);
      } else if (mainshock && isAftershock(event, mainshock)) {
        const badge = document.createElement("div");
        badge.className = "popup-badge-after";
        badge.textContent = "🔄 RÉPLICA DEL SISMO M 7.7";
        popup.appendChild(badge);
      }
      const title = document.createElement("div");
      title.className = "popup-title";
      title.textContent = `M ${mag === null ? "—" : mag.toFixed(1)} · ${event.properties.place || "Ubicación no especificada"}`;
      const meta = document.createElement("div");
      meta.className = "popup-meta";
      meta.textContent = `${dateTime.format(new Date(event.properties.time))} · ${Number.isFinite(depth) ? `${Math.round(depth!)} km` : "Profundidad no disponible"} · ${provinceLabel(event)} · cerca de ${placeLabel(event)}${event.properties.source === "emsc" ? " · Fuente: EMSC" : event.properties.source === "igc" ? " · Fuente: IGC" : ""}`;
      // appendChild y no append: los tipos de workers-types pisan Element.append.
      popup.appendChild(title);
      popup.appendChild(meta);
      // Al abrirse el globo, Leaflet mueve el mapa para que quepa; se le reserva el espacio de los botones que lo
      // cubren (marca y selector de capas arriba, leyenda y atribución abajo) para que no lo tapen.
      const narrow = window.innerWidth <= 700;
      marker.bindPopup(popup, { autoPanPaddingTopLeft: [12, narrow ? 100 : 64], autoPanPaddingBottomRight: [56, 16] });
      marker.on("click", () => latest.current.onSelect(event.id));
      markersRef.current.set(event.id, marker);
    }
    if (events.length) popIn.current = false;
  }, [events, mainshock, ready]);

  // Capas con datos publicados por el USGS para el sismo principal: la ruptura de la falla (cuánto se deslizó cada
  // tramo) y los reportes de personas («¿Lo sentiste?», cuadros de 10 km). No se calcula nada aquí: se dibuja lo recibido.
  const usgsDetail = usgs.detail;
  useEffect(() => {
    const map = mapRef.current;
    const L = (window as any).L;
    if (!ready || !map || !L) return;
    if (usgsLayerRef.current) {
      map.removeLayer(usgsLayerRef.current);
      usgsLayerRef.current = null;
    }
    if (!usgsDetail || (!layers.rupture && !layers.felt && !layers.shaking)) return;
    const group = L.layerGroup();
    if (layers.felt && usgsDetail.felt) {
      for (const [south, west, north, east, cdi, count] of usgsDetail.felt.cells) {
        L.rectangle([[south, west], [north, east]], {
          pane: "felt", color: "#ffffff", weight: 0.6, opacity: 0.55, fillColor: intensityColor(cdi, 1), fillOpacity: 0.62,
        }).bindTooltip(`Intensidad ${cdi.toFixed(1)} según ${count} ${count === 1 ? "reporte" : "reportes"} de personas`, { sticky: true }).addTo(group);
      }
    }
    if (layers.rupture && usgsDetail.fault) {
      const { subfaults, maxSlipM } = usgsDetail.fault;
      for (const sub of subfaults) {
        L.polygon(sub.ring.map(([lng, lat]) => [lat, lng]), {
          pane: "rupture", interactive: false, stroke: false, fillColor: slipColor(sub.slip, maxSlipM, 1), fillOpacity: 0.55,
        }).addTo(group);
      }
    }
    if (layers.shaking && usgsDetail.shaking) {
      for (const { value, lines } of usgsDetail.shaking) {
        L.polyline(lines.map(line => line.map(([lng, lat]) => [lat, lng])), {
          pane: "felt", color: intensityColor(value, 1), weight: Number.isInteger(value) ? 3 : 2, opacity: 0.95, lineJoin: "round",
        }).bindTooltip(`Intensidad ${value.toFixed(1)} (estimada por el USGS)`, { sticky: true }).addTo(group);
      }
    }
    group.addTo(map);
    usgsLayerRef.current = group;
  }, [layers, usgsDetail, ready]);

  // Placas tectónicas: límites del modelo PB2002 (datos estáticos, no pasan por el servidor).
  useEffect(() => {
    const map = mapRef.current;
    const L = (window as any).L;
    if (!ready || !map || !L) return;
    if (platesLayerRef.current) {
      map.removeLayer(platesLayerRef.current);
      platesLayerRef.current = null;
    }
    if (!layers.plates) return;
    const group = L.layerGroup();
    for (const boundary of PLATE_BOUNDARIES) {
      const info = KIND_INFO[boundary.kind];
      L.polyline(boundary.points.map(([lng, lat]) => [lat, lng]), {
        pane: "plates", color: info.color, weight: 3.2, opacity: 0.95, lineCap: "round", dashArray: boundary.kind === "subduction" ? "10 6" : undefined,
      }).bindTooltip(`${PLATE_NAMES[boundary.a] ?? boundary.a} – ${PLATE_NAMES[boundary.b] ?? boundary.b} · ${info.name.toLowerCase()}: ${info.meaning}`, { sticky: true }).addTo(group);
    }
    for (const label of PLATE_LABELS) {
      L.marker([label.lat, label.lng], {
        pane: "plates", interactive: false, keyboard: false,
        icon: L.divIcon({ className: "plate-label-wrap", html: `<span class="plate-label" aria-hidden="true">${PLATE_NAMES[label.code]}</span>`, iconSize: [0, 0] }),
      }).addTo(group);
    }
    group.addTo(map);
    platesLayerRef.current = group;
  }, [layers.plates, ready]);

  // La primera vez que se abre el 3D se enciende la ruptura de la falla (es lo que más se luce); luego manda lo que elija la persona.
  const autoRupture = useRef(true);
  const openView3d = () => {
    setView3d(true);
    if (autoRupture.current) {
      autoRupture.current = false;
      loadMainshockDetail();
      setLayers(current => ({ ...current, rupture: true, wave: true }));
    }
  };
  const toggleLayer = (name: "rupture" | "felt" | "shaking" | "plates" | "wave") => {
    if (name !== "plates") loadMainshockDetail();
    setLayers(current => ({ ...current, [name]: !current[name] }));
  };
  const detailReady = usgs.status === "ready" && usgsDetail !== null;
  const fault = detailReady ? usgsDetail.fault : null;
  const felt = detailReady ? usgsDetail.felt : null;
  const shaking = detailReady ? usgsDetail.shaking : null;
  const anyLayer = layers.rupture || layers.felt || layers.shaking;

  // Al elegir una provincia o comarca se dibuja su borde y el mapa se acerca; al elegir además una ciudad se marca con su
  // nombre y el mapa se acerca a ella y a sus sismos. Al volver a "Todas", regresa a la vista general.
  const placeLat = place?.lat ?? null;
  const placeLng = place?.lng ?? null;
  const placeName = place?.name ?? null;
  useEffect(() => {
    const map = mapRef.current;
    const L = (window as any).L;
    if (!ready || !map || !L) return;
    for (const layerRef of [regionLayerRef, placeLayerRef]) {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    }
    const province = region ? PROVINCE_BY_ID.get(region) : undefined;
    const still = reducedMotion();
    if (!province && placeLat === null) {
      if (hadRegion.current) {
        hadRegion.current = false;
        const zoom = window.innerWidth < 760 ? 6 : 7;
        if (still) map.setView([8.46, -80.4], zoom, { animate: false });
        else map.flyTo([8.46, -80.4], zoom, { duration: 1 });
      }
      return;
    }
    hadRegion.current = true;
    if (province) {
      const rings = province.rings.map(ring => ring.map(([lng, lat]) => [lat, lng]));
      regionLayerRef.current = L.polygon(rings, {
        className: "province-outline", color: "#ffffff", weight: 2.5, dashArray: "8 6",
        fillColor: "#ffffff", fillOpacity: 0.09, interactive: false,
      }).addTo(map);
    }
    let bounds = province ? L.latLngBounds(province.bounds) : null;
    if (placeLat !== null && placeLng !== null) {
      placeLayerRef.current = L.circleMarker([placeLat, placeLng], {
        radius: 6, color: "#ffffff", weight: 2.5, fillColor: "#072357", fillOpacity: 1, interactive: false,
      }).bindTooltip(placeName, { permanent: true, direction: "right", offset: [9, 0], className: "place-label" }).addTo(map);
      // Se enmarca la ciudad junto con los sismos que se están viendo (ya filtrados por esa ciudad).
      bounds = L.latLngBounds([[placeLat, placeLng], ...latest.current.events.map(event => [event.geometry.coordinates[1], event.geometry.coordinates[0]])]);
    }
    map.closePopup();
    const maxZoom = placeLat !== null ? 11 : 10;
    if (still) map.fitBounds(bounds, { padding: [40, 40], maxZoom, animate: false });
    else map.flyToBounds(bounds, { padding: [40, 40], maxZoom, duration: 1.1 });
  }, [region, placeLat, placeLng, placeName, ready]);

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
    // Un aviso en silencio (sismo de hace un rato) no hace temblar el mapa.
    if (!alert || !map) return;
    const span = markersRef.current.get(alert.event.id)?.getElement()?.firstElementChild as HTMLElement | undefined;
    fresh.current = { id: alert.event.id, until: Date.now() + 8000 };
    span?.classList.add("fresh");
    if (!alert.quiet && !reducedMotion()) shakeElement(map.getContainer(), alert.event.properties.mag);
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
    const markers = markersRef.current;
    // Los marcadores se buscan por id en cada paso y no se guardan: si llegan datos nuevos y el mapa los
    // rehace a mitad de la reproducción, los que aún no tocan siguen ocultos en vez de aparecer de golpe.
    const spanOf = (id: string) => markers.get(id)?.getElement()?.firstElementChild as HTMLElement | undefined;
    const hidden = new Set(markers.keys());
    replayHidden.current = hidden;
    for (const id of hidden) {
      const span = spanOf(id);
      span?.classList.remove("pop");
      span?.classList.add("replay-hidden");
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
        hidden.delete(event.id);
        const span = spanOf(event.id);
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
      hidden.clear();
      for (const id of markers.keys()) spanOf(id)?.classList.remove("replay-hidden");
      latest.current.onReplay(null);
    }, start + total * STEP_MS + 600));

    return () => {
      timers.forEach(timer => window.clearTimeout(timer));
      container.classList.remove("quake-shake");
      hidden.clear();
      replayHidden.current = null;
      for (const id of markers.keys()) spanOf(id)?.classList.remove("replay-hidden", "replay-pop");
      latest.current.onReplay(null);
    };
  }, [replayKey]);

  const layerChips = (
    <>
      <button
        type="button" className={`layer-chip${layers.rupture ? " on" : ""}`} aria-pressed={layers.rupture} onClick={() => toggleLayer("rupture")}
        title="Tramo de la falla que se rompió en el sismo principal, según el modelo del USGS: más claro, más deslizamiento"
      ><span className="chip-long">Ruptura de la falla</span><span className="chip-short" aria-hidden="true">Ruptura</span></button>
      <button
        type="button" className={`layer-chip${layers.felt ? " on" : ""}`} aria-pressed={layers.felt} onClick={() => toggleLayer("felt")}
        title="Intensidad que reportó la gente al USGS («¿Lo sentiste?»), en cuadros de 10 km"
      ><span className="chip-long">Lo que sintió la gente</span><span className="chip-short" aria-hidden="true">Lo que sintió</span></button>
      <button
        type="button" className={`layer-chip${layers.shaking ? " on" : ""}`} aria-pressed={layers.shaking} onClick={() => toggleLayer("shaking")}
        title="Intensidad de la sacudida estimada por el USGS (ShakeMap): curvas de igual intensidad"
      ><span className="chip-long">Sacudida estimada</span><span className="chip-short" aria-hidden="true">Sacudida</span></button>
      <button
        type="button" className={`layer-chip${layers.plates ? " on" : ""}`} aria-pressed={layers.plates} onClick={() => toggleLayer("plates")}
        title="Límites entre las placas tectónicas (modelo PB2002, P. Bird 2003): aproximados"
      ><span className="chip-long">Placas tectónicas</span><span className="chip-short" aria-hidden="true">Placas</span></button>
    </>
  );
  // La onda de sacudida solo existe en la vista 3D.
  const waveChip = (
    <button
      type="button" className={`layer-chip${layers.wave ? " on" : ""}`} aria-pressed={layers.wave} onClick={() => toggleLayer("wave")}
      title="Cómo se propagó la sacudida por el país: color = intensidad estimada por el USGS; el frente avanza a velocidades típicas de las ondas"
    ><span className="chip-long">Onda de sacudida</span><span className="chip-short" aria-hidden="true">Onda</span></button>
  );
  const layerNote = usgs.status === "loading" && (anyLayer || layers.wave)
    ? <span className="map-layers-note" role="status">Cargando datos del USGS…</span>
    : usgs.status === "error"
    ? <span className="map-layers-note" role="alert">No se pudieron cargar los datos del USGS. <button type="button" onClick={loadMainshockDetail}>Reintentar</button></span>
    : null;

  return (
    <>
      <Script
        src="/leaflet.js"
        strategy="afterInteractive"
        onLoad={() => setReady(true)}
        onReady={() => setReady(true)}
      />
      <div id="leaflet-map" role="group" aria-label="Mapa interactivo de sismos en Panamá" />
      {view3d && (
        <Suspense fallback={<div className="q3-loading" role="status">Cargando la vista 3D…</div>}>
          <Quake3D
            events={events} mainshock={mainshock} selectedId={selectedId} replay={replay} region={region}
            fault={layers.rupture ? fault : null} felt={layers.felt ? felt : null} shaking={layers.shaking ? shaking : null} plates={layers.plates} wave={layers.wave} shakeGrid={detailReady ? usgsDetail.shakeGrid : null} mechanism={detailReady ? usgsDetail.mechanism : null} onSelect={onSelect}
            layerControls={<><div className="q3-seg q3-layers" role="group" aria-label="Capas con datos del USGS">{layerChips}{waveChip}</div>{layerNote}</>}
          />
        </Suspense>
      )}
      <div className="map-layer-selector" role="group" aria-label="Modo de visualización del mapa">
        <button
          type="button"
          className={`layer-btn${!view3d && mapMode === "satellite" ? " active" : ""}`}
          aria-pressed={!view3d && mapMode === "satellite"}
          onClick={() => handleModeChange("satellite")}
          title="Vista satelital híbrida (imágenes + nombres y rutas)"
        >
          <span aria-hidden="true">🛰️</span>
          <span className="layer-text-full">Satélite</span>
          <span className="layer-text-short">Sat</span>
        </button>
        <button
          type="button"
          className={`layer-btn${!view3d && mapMode === "esri" ? " active" : ""}`}
          aria-pressed={!view3d && mapMode === "esri"}
          onClick={() => handleModeChange("esri")}
          title="Vista satelital pura Esri ArcGIS"
        >
          <span aria-hidden="true">🌍</span>
          <span className="layer-text-full">Esri Sat</span>
          <span className="layer-text-short">Esri</span>
        </button>
        <button
          type="button"
          className={`layer-btn${!view3d && mapMode === "streets" ? " active" : ""}`}
          aria-pressed={!view3d && mapMode === "streets"}
          onClick={() => handleModeChange("streets")}
          title="Mapa callejero y relieve"
        >
          <span aria-hidden="true">🗺️</span>
          <span className="layer-text-full">Callejero</span>
          <span className="layer-text-short">Calles</span>
        </button>
        <button
          type="button"
          className={`layer-btn${view3d ? " active" : ""}`}
          aria-pressed={view3d}
          onClick={openView3d}
          title="Vista 3D: cada sismo a su profundidad bajo la superficie"
        >
          <span aria-hidden="true">🧊</span>
          <span className="layer-text-full">3D</span>
          <span className="layer-text-short">3D</span>
        </button>
      </div>
      {!view3d && (
        <div className="map-layers" role="group" aria-label="Capas del mapa: datos del USGS y placas tectónicas">
          <span className="map-layers-title" aria-hidden="true">CAPAS DEL MAPA</span>
          {layerChips}
          {layerNote}
        </div>
      )}
      {((detailReady && anyLayer) || layers.plates) && (
        <div className="map-layers-legend" role="group" aria-label="Leyenda de las capas del mapa">
          {detailReady && layers.rupture && (
            fault ? (
              <div>
                <i className="slip-ramp" aria-hidden="true" style={{ background: `linear-gradient(90deg, ${[0, 0.33, 0.66, 1].map(t => slipColor(t, 1)).join(", ")})` }} />
                <span>Ruptura: más claro, más deslizamiento (máx. {fault.maxSlipM.toFixed(1)} m)</span>
              </div>
            ) : <div><span>El USGS no publica el modelo de ruptura de este sismo.</span></div>
          )}
          {detailReady && layers.felt && (
            felt ? (
              <div>
                <span className="felt-scale" aria-hidden="true">{[3, 4, 5, 6, 7, 8, 9].map(v => <i key={v} style={{ background: intensityColor(v) }} />)}</span>
                <span>Lo que sintió la gente: el color es la intensidad que reportaron ({felt.responses.toLocaleString("es-PA")} respuestas al USGS)</span>
              </div>
            ) : <div><span>El USGS no publica reportes de personas para este sismo.</span></div>
          )}
          {detailReady && layers.shaking && (
            shaking ? (
              <div>
                <span className="felt-scale" aria-hidden="true">{shaking.map(c => <i key={c.value} style={{ background: intensityColor(c.value) }} />)}</span>
                <span>Sacudida estimada por el USGS (ShakeMap): cada curva une lugares con la misma intensidad, de {shaking[0].value.toFixed(1)} a {shaking[shaking.length - 1].value.toFixed(1)}</span>
              </div>
            ) : <div><span>El USGS no publica el mapa de sacudida de este sismo.</span></div>
          )}
          {layers.plates && <div className="plates-legend"><PlatesLegend detailed /></div>}
          {detailReady && anyLayer && <div className="map-layers-source"><span>Fuente de los datos sísmicos: USGS (earthquake.usgs.gov)</span></div>}
        </div>
      )}
      {!ready && <div className="map-fallback">Cargando mapa satelital…</div>}
    </>
  );
}
