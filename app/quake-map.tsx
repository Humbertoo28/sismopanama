"use client";
/* eslint-disable @typescript-eslint/no-explicit-any -- Leaflet se carga como script global y no trae tipos. */

import Script from "next/script";
import { lazy, Suspense, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { isAftershock, isUnconfirmed, shakeFor, type Earthquake, type FocusRequest, type LiveAlert, type ReplayStep } from "../lib/earthquakes";
import { PANAMA_MAP_BOUNDS, PANAMA_RINGS } from "../lib/panama";
import { placeLabel } from "../lib/place-of";
import { PROVINCE_BY_ID, provinceLabel } from "../lib/province-of";
import { PROVINCE_LABELS } from "../lib/province-labels";
import { PROVINCES } from "../lib/provinces";
import { KIND_INFO, PLATE_BOUNDARIES, PLATE_LABELS, PLATE_NAMES, PLATE_SHORT } from "../lib/plates";
import { ACTIVE_FAULTS, ACTIVE_FAULTS_SOURCE, labelPoint } from "../lib/active-faults";
import PlatesLegend from "./plates-legend";
import { intensityColor } from "../lib/usgs-colors";
import { SLIP_GRADIENT, buildSlipRaster, feltRadiusM, sideOf, teethAlong } from "./map-layers";
import { loadMainshockDetail, useMainshockDetail } from "./mainshock-detail";
import { agoLabel, arrivals } from "../lib/quake-facts";
import { placeTitle } from "../lib/quake-summary";
import { frontRadiusKm } from "../lib/travel-time";
import { loadEventPhases } from "./event-phases";
import { reducedMotion, shakeElement, vibrate } from "./shake";

// La vista 3D solo se descarga cuando alguien la abre.
const Quake3D = lazy(() => import("./quake-3d"));

type Props = {
  // Identifica los filtros de la lista que están puestos ("" = ninguno): con alguno, el 3D muestra las réplicas que deja pasar.
  filtersKey: string;
  // Sube cada vez que la persona pide volver a encuadrar los sismos del filtro.
  fitKey: number;
  // Petición de «ver cómo se propagó» un sismo (la ficha la envía) y aviso de que ya terminó o se cerró.
  propagation: { event: Earthquake; key: number } | null;
  onPropagationEnd: () => void;
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
  // Sube cuando se pide ver las fallas activas (desde su ficha): se enciende la capa y el mapa las encuadra.
  faultsKey: number;
  // «Ver réplicas» de la vista 3D: arranca solo con el sismo principal y la persona decide cuándo ver las réplicas (`count` = cuántas hay).
  // El mapa plano siempre las muestra. null = no hay nada que mostrar u ocultar (sin principal, o un filtro o la reproducción ya las traen).
  aftershockToggle: { shown: boolean; count: number; onToggle: () => void } | null;
};

// Escala de Mercalli en palabras, para los reportes de «¿Lo sentiste?».
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
const INTENSITY_WORD = ["no sentido", "débil", "débil", "ligera", "moderada", "fuerte", "muy fuerte", "severa", "violenta", "extrema", "extrema", "extrema"];

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
const noSubscribe = () => () => {};

export default function QuakeMap({ events, filtersKey, fitKey, propagation, onPropagationEnd, mainshock, focus, alert, replayKey, region, place, selectedId, replay, onSelect, onReplay, faultsKey, aftershockToggle }: Props) {
  const [ready, setReady] = useState(() => typeof window !== "undefined" && !!(window as any).L);
  // El modo guardado se lee con useSyncExternalStore: el servidor (y la hidratación) usan «satélite» y, ya en el
  // navegador, pasa al guardado sin el aviso de que el HTML no coincide.
  const mapMode = useSyncExternalStore(subscribeMapMode, readMapMode, () => "satellite" as MapLayerMode);
  // Vista 3D y capas con datos del USGS (ruptura de la falla y «lo que se sintió»), compartidas por el mapa y el 3D.
  const [view3d, setView3d] = useState(false);
  // Aviso que aparece un momento si se usa la rueda sobre el mapa sin Ctrl/⌘ (la página sigue desplazándose).
  const [wheelHint, setWheelHint] = useState(false);
  // Cada vez que cambia se vuelve a animar cómo se propagó la ruptura (botón de la leyenda).
  const [ruptureRun, setRuptureRun] = useState(0);
  const modKey = useSyncExternalStore(noSubscribe, () => (/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl"), () => "Ctrl");
  // Pantalla completa del mapa (el plano y el 3D comparten el mismo marco): la del navegador si la permite y, si no (iPhone y
  // navegadores integrados), el marco se amplía sobre toda la página.
  const mapDiv = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState<"off" | "native" | "overlay">("off");
  useEffect(() => {
    const update = () => {
      const active = document.fullscreenElement !== null && document.fullscreenElement === mapDiv.current?.parentElement;
      setFullscreen(mode => (active ? "native" : mode === "native" ? "off" : mode));
    };
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);
  const toggleFullscreen = async () => {
    const frame = mapDiv.current?.parentElement;
    if (!frame) return;
    if (document.fullscreenElement === frame) {
      await document.exitFullscreen();
    } else if (fullscreen === "overlay") {
      setFullscreen("off");
    } else {
      try {
        if (!frame.requestFullscreen) throw new Error("Fullscreen unavailable");
        // Algunos navegadores integrados dejan la promesa sin resolver: se espera un instante y, si no se logró, se usa el respaldo.
        await Promise.race([frame.requestFullscreen(), new Promise((_, reject) => window.setTimeout(() => reject(new Error("timeout")), 900))]);
        if (document.fullscreenElement !== frame) throw new Error("Fullscreen not granted");
      } catch {
        setFullscreen("overlay");
      }
    }
  };
  // Con el respaldo abierto, Escape lo cierra y la página de abajo no se desplaza. Funciona como un cuadro de diálogo: los
  // lectores de pantalla (VoiceOver en el iPad) no leen lo que queda debajo, y al cerrarlo el foco vuelve al botón que lo abrió.
  useEffect(() => {
    if (fullscreen !== "overlay") return;
    const frame = mapDiv.current?.parentElement;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    frame?.setAttribute("role", "dialog");
    frame?.setAttribute("aria-modal", "true");
    frame?.setAttribute("aria-label", "Mapa en pantalla completa");
    const onKeyDown = (event: KeyboardEvent) => event.key === "Escape" && setFullscreen("off");
    const previous = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.documentElement.style.overflow = previous;
      document.removeEventListener("keydown", onKeyDown);
      frame?.removeAttribute("role");
      frame?.removeAttribute("aria-modal");
      frame?.removeAttribute("aria-label");
      if ((document.activeElement === document.body || document.activeElement === null) && opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [fullscreen]);
  const [layers, setLayers] = useState({ rupture: false, felt: false, shaking: false, plates: false, wave: false, faults: false });
  const usgs = useMainshockDetail();
  const usgsLayerRef = useRef<any>(null);
  // Cuadro (sur, oeste, norte, este) de la ruptura dibujada: «Ver cómo se rompió» lleva el mapa hasta ahí antes de animarla.
  const ruptureBounds = useRef<[[number, number], [number, number]] | null>(null);
  const platesLayerRef = useRef<any>(null);
  const faultsLayerRef = useRef<any>(null);
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
  const latest = useRef({ events, mainshock, onSelect, onReplay, onPropagationEnd });
  useEffect(() => {
    latest.current = { events, mainshock, onSelect, onReplay, onPropagationEnd };
  });

  // Al entrar o salir de la pantalla completa el marco cambia de tamaño: Leaflet lo mide de nuevo.
  useEffect(() => {
    const timer = window.setTimeout(() => mapRef.current?.invalidateSize({ animate: false }), 250);
    return () => window.clearTimeout(timer);
  }, [fullscreen]);

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
    // Con zoom (10 o más) los puntos de más de un día se dibujan casi sólidos: son pocos en pantalla y, tan tenues, parecían manchas sobre el satélite.
    map.on("zoomend", () => map.getContainer().toggleAttribute("data-zoomed", map.getZoom() >= 10));
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

    // Ctrl/⌘ + rueda (y el pellizco del trackpad, que el navegador entrega igual) acerca o aleja el mapa alrededor del puntero en
    // vez de agrandar la página. Sin esas teclas la rueda sigue desplazando la página, como en el 3D. Un clic de la rueda mueve
    // ~100 px y el trackpad unos pocos por evento: se acumula y se cambia de nivel cada ~100 px para que ambos se sientan igual.
    let wheelPx = 0;
    let hintTimer = 0;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) {
        if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
          setWheelHint(true);
          window.clearTimeout(hintTimer);
          hintTimer = window.setTimeout(() => setWheelHint(false), 1400);
        }
        return;
      }
      event.preventDefault();
      setWheelHint(false);
      wheelPx += event.deltaMode === 1 ? event.deltaY * 33 : event.deltaY;
      if (Math.abs(wheelPx) < 100) return;
      const step = wheelPx > 0 ? -1 : 1;
      wheelPx = 0;
      const zoom = Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), map.getZoom() + step));
      if (zoom !== map.getZoom()) map.setZoomAround(map.mouseEventToContainerPoint(event), zoom);
    };
    container.addEventListener("wheel", onWheel, { passive: false });

    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);
    const markers = markersRef.current;
    return () => {
      container.removeEventListener("wheel", onWheel);
      window.clearTimeout(hintTimer);
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
    // Al cargar, los puntos entran en orden cronológico pero todos en medio segundo. Antes cada uno esperaba 80 ms más que el
    // anterior: con 400 sismos tardaban más de 30 s en aparecer y parecía una reproducción que nadie había pedido.
    const chronological = [...events].sort((a, b) => a.properties.time - b.properties.time).map(event => event.id);
    const popDelay = new Map(chronological.map((id, index) => [id, Math.round((index / Math.max(1, chronological.length - 1)) * 500)]));
    const latestEvent = events.reduce<Earthquake | null>(
      (newest, e) => (!newest || e.properties.time > newest.properties.time ? e : newest),
      null,
    );
    const pop = popIn.current && !reducedMotion();
    const canHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
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

      // Los sismos de los alrededores («Incluir alrededores») no son réplicas aunque sean posteriores al principal.
      const after = !event.properties.nearby && !!mainshock && isAftershock(event, mainshock);
      const kind = isLatest ? " latest" : isMain ? " main" : after ? " after" : "";
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
        html: `<span class="quake-marker${m >= 5 ? " high" : m >= 3 ? " m-mid" : " m-low"}${kind}${recent}${ageClass}${highlight}${hiddenByReplay}${pop ? " pop" : ""}" style="width:${size}px;height:${size}px;--d:${popDelay.get(event.id) ?? 0}ms">${hasRipples ? "<i></i><i></i>" : ""}</span>`,
        iconSize: [size, size], iconAnchor: [size / 2, size / 2],
      });
      const role = isMain ? "Sismo principal" : isLatest
        ? (after ? "Última réplica" : "Último sismo")
        : after ? "Réplica" : event.properties.nearby ? "Sismo fuera de Panamá" : "Sismo";
      const magLabel = mag === null ? "—" : mag.toFixed(1);
      const marker = L.marker([lat, lng], { icon, zIndexOffset: zIndex }).addTo(layer);
      // Nombre para lectores de pantalla (antes era un `title`, que además mostraba un recuadro nativo lento y en inglés).
      marker.getElement()?.setAttribute("aria-label", `${role}, magnitud ${magLabel}: ${placeTitle(event)}`);
      // Con ratón: ficha corta al pasar por encima, sin tener que hacer clic. Se arma al abrirse para que «hace…» esté al día.
      // En pantallas táctiles no hace falta: tocar abre la ficha completa.
      if (canHover) {
        marker.bindTooltip(() => {
          const tip = document.createElement("div");
          const head = document.createElement("div");
          head.className = "quake-tip-head";
          const badge = document.createElement("span");
          badge.className = `quake-tip-mag${m >= 6 ? " high" : m >= 4 ? " mid" : ""}`;
          badge.textContent = magLabel;
          const text = document.createElement("div");
          const place = document.createElement("strong");
          place.textContent = placeTitle(event);
          const when = document.createElement("small");
          when.textContent = `${role} · ${agoLabel(event.properties.time)}`;
          text.appendChild(place);
          text.appendChild(when);
          head.appendChild(badge);
          head.appendChild(text);
          const meta = document.createElement("div");
          meta.className = "quake-tip-meta";
          meta.textContent = `${dateTime.format(new Date(event.properties.time))} · ${Number.isFinite(depth) ? `${Math.round(depth!)} km de profundidad` : "profundidad no disponible"} · ${provinceLabel(event)}`;
          const hint = document.createElement("div");
          hint.className = "quake-tip-hint";
          hint.textContent = "Clic para ver la ficha completa";
          tip.appendChild(head);
          tip.appendChild(meta);
          tip.appendChild(hint);
          return tip;
        }, { direction: "top", offset: [0, -size / 2 - 4], className: "quake-tip", opacity: 1 });
      }
      const popup = document.createElement("div");
      if (isLatest) {
        const badge = document.createElement("div");
        badge.className = "popup-badge-latest";
        badge.textContent = after
          ? "Última réplica"
          : "Último sismo registrado";
        popup.appendChild(badge);
      } else if (isMain) {
        const badge = document.createElement("div");
        badge.className = "popup-badge-main";
        badge.textContent = "Sismo principal";
        popup.appendChild(badge);
      } else if (after) {
        const badge = document.createElement("div");
        badge.className = "popup-badge-after";
        badge.textContent = "Réplica";
        popup.appendChild(badge);
      }
      if (isUnconfirmed(event)) {
        const badge = document.createElement("div");
        badge.className = "popup-badge-unconfirmed";
        badge.textContent = "Sin confirmar · solo EMSC";
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
      // Al tocar un sismo se abre su ficha completa, no el globo: el globo solo se abre cuando la página lleva el mapa a un sismo
      // (por ejemplo desde «Ver en el mapa»). Enter, con el teclado, hace lo mismo que tocar.
      marker.off("click", (marker as any)._openPopup, marker);
      marker.off("keypress", (marker as any)._onKeyPress, marker);
      marker.on("click", () => latest.current.onSelect(event.id));
      marker.on("keypress", (key: any) => {
        if (key.originalEvent?.keyCode === 13) latest.current.onSelect(event.id);
      });
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
    map.getContainer().classList.toggle("layers-on", Boolean(usgsDetail && (layers.rupture || layers.felt || layers.shaking)));
    if (!usgsDetail || (!layers.rupture && !layers.felt && !layers.shaking)) return;
    const group = L.layerGroup();
    let frame = 0;
    if (layers.felt && usgsDetail.felt) {
      // Un círculo por zona de 10 km con respuestas: el color es la intensidad que reportaron y el tamaño, cuántas personas
      // respondieron (una zona con un solo reporte es un dato menos firme y se ve pequeña). Los grandes primero, debajo.
      const cells = [...usgsDetail.felt.cells].sort((a, b) => b[5] - a[5]);
      for (const [south, west, north, east, cdi, count] of cells) {
        const level = Math.min(12, Math.max(1, Math.round(cdi)));
        L.circle([(south + north) / 2, (west + east) / 2], {
          pane: "felt", radius: feltRadiusM(count), color: "#ffffff", weight: 1, opacity: 0.85, fillColor: intensityColor(cdi, 1), fillOpacity: 0.82,
        }).bindTooltip(`Intensidad ${ROMAN[level - 1]} (${INTENSITY_WORD[level - 1]}) · ${count.toLocaleString("es-PA")} ${count === 1 ? "reporte" : "reportes"} de personas`, { sticky: true }).addTo(group);
      }
    }
    if (layers.rupture && usgsDetail.fault) {
      const raster = buildSlipRaster(usgsDetail.fault);
      if (raster) {
        // El deslizamiento interpolado se pinta en un lienzo y se pone sobre el mapa como imagen: una mancha continua, más
        // intensa donde más se movió la falla. El contorno es el plano de falla del modelo proyectado en la superficie.
        const [[south, west], [north, east]] = raster.bounds;
        ruptureBounds.current = raster.bounds;
        const canvas = document.createElement("canvas");
        canvas.width = 520;
        canvas.height = Math.max(60, Math.round(520 * ((north - south) / ((east - west) * Math.cos(((south + north) / 2) * Math.PI / 180)))));
        raster.render(canvas);
        const overlay = L.imageOverlay(canvas.toDataURL(), raster.bounds, { pane: "rupture", className: "slip-raster", interactive: false }).addTo(group);
        L.polygon(raster.outline, { pane: "rupture", interactive: false, color: "#ffffff", weight: 1.2, opacity: 0.75, dashArray: "4 5", fill: false }).addTo(group);
        L.polyline(raster.topEdge, { pane: "rupture", color: "#ffffff", weight: 3.5, opacity: 0.95, lineCap: "round" })
          .bindTooltip(`Borde superior de la falla que se rompió (a unos ${Math.round(raster.topDepthKm)} km de profundidad). La falla baja desde aquí hacia el norte.`, { sticky: true })
          .addTo(group);
        // Al encender la capa (o con «Ver cómo se rompió») la ruptura crece con los tiempos del modelo, comprimidos a ~5 s.
        if (raster.durationS && !reducedMotion()) {
          const total = raster.durationS;
          const started = performance.now();
          let last = 0;
          const tick = (now: number) => {
            const second = ((now - started) / 5000) * total;
            if (now - last > 60 || second >= total) {
              last = now;
              raster.render(canvas, Math.min(total, second));
              overlay.setUrl(canvas.toDataURL());
            }
            if (second < total) frame = requestAnimationFrame(tick);
          };
          raster.render(canvas, 0);
          overlay.setUrl(canvas.toDataURL());
          frame = requestAnimationFrame(tick);
        }
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
    return () => cancelAnimationFrame(frame);
  }, [layers, usgsDetail, ready, ruptureRun]);

  // «Ver cómo se rompió»: la ruptura está mar adentro y, con el mapa acercado a otra zona, la animación pasaba fuera de pantalla y parecía que
  // el botón no hacía nada. Primero se lleva el mapa hasta la ruptura (dejando libre lo que tapan las capas, que en el celular ocupan media
  // pantalla) y al llegar se anima.
  const playRupture = () => {
    const map = mapRef.current;
    const L = (window as any).L;
    const bounds = ruptureBounds.current;
    if (!map || !L || !bounds) { setRuptureRun(run => run + 1); return; }
    const box = L.latLngBounds(bounds);
    const mapRect = map.getContainer().getBoundingClientRect();
    let right = 0;
    for (const panel of document.querySelectorAll(".map-layers, .map-layers-legend")) {
      const rect = panel.getBoundingClientRect();
      // En el celular fuera de la pantalla completa las capas van en filas bajo el mapa (el contenedor no genera caja): no tapan nada.
      const parent = getComputedStyle(panel.parentElement ?? panel);
      const floating = getComputedStyle(panel).position !== "static" || (parent.display !== "contents" && parent.position !== "static");
      if (floating && rect.width > 0 && rect.left < mapRect.right && rect.bottom > mapRect.top && rect.top < mapRect.bottom) right = Math.max(right, mapRect.right - rect.left + 12);
    }
    right = Math.min(right, mapRect.width * 0.6);
    // La ruptura ya se ve entera en la parte del mapa que no tapan las capas: solo se repite la animación.
    const free = L.latLngBounds(map.containerPointToLatLng([0, 70]), map.containerPointToLatLng([mapRect.width - right, mapRect.height - 40]));
    if (free.contains(box)) { setRuptureRun(run => run + 1); return; }
    map.once("moveend", () => setRuptureRun(run => run + 1));
    map.flyToBounds(box, { paddingTopLeft: [40, 70], paddingBottomRight: [right + 20, 40], maxZoom: 9, duration: reducedMotion() ? 0 : 1.1 });
  };

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
      const latlngs = boundary.points.map(([lng, lat]) => [lat, lng]);
      // Un borde oscuro debajo separa la línea de la imagen satelital.
      L.polyline(latlngs, { pane: "plates", interactive: false, color: "#0b1a33", weight: 6.5, opacity: 0.55, lineCap: "round", lineJoin: "round" }).addTo(group);
      L.polyline(latlngs, { pane: "plates", color: info.color, weight: 3, opacity: 1, lineCap: "round", lineJoin: "round" })
        .bindTooltip(`${PLATE_NAMES[boundary.a] ?? boundary.a} – ${PLATE_NAMES[boundary.b] ?? boundary.b} · ${info.name.toLowerCase()}: ${info.meaning}${boundary.over ? `. Los triángulos señalan la placa que queda encima (${PLATE_SHORT[boundary.over] ?? boundary.over}).` : ""}`, { sticky: true })
        .addTo(group);
    }
    // Triángulos de subducción y convergencia, del lado de la placa que queda encima (simbología de los mapas geológicos). Se
    // calculan en píxeles para que tengan el mismo tamaño y separación a cualquier zoom.
    const teeth = L.layerGroup().addTo(group);
    const drawTeeth = () => {
      teeth.clearLayers();
      for (const boundary of PLATE_BOUNDARIES) {
        const label = boundary.over && PLATE_LABELS.find(item => item.code === boundary.over);
        if (!label) continue;
        const points = boundary.points.map(([lng, lat]) => map.latLngToLayerPoint([lat, lng]));
        const side = sideOf(points, map.latLngToLayerPoint([label.lat, label.lng]));
        for (const tooth of teethAlong(points, side, 24, 7)) {
          L.polygon(tooth.map(point => map.layerPointToLatLng([point.x, point.y])), {
            pane: "plates", interactive: false, stroke: true, color: "#0b1a33", weight: 0.8, opacity: 0.6,
            fillColor: KIND_INFO[boundary.kind].color, fillOpacity: 1,
          }).addTo(teeth);
        }
      }
    };
    drawTeeth();
    map.on("zoomend", drawTeeth);
    for (const label of PLATE_LABELS) {
      L.marker([label.lat, label.lng], {
        pane: "plates", interactive: false, keyboard: false,
        icon: L.divIcon({ className: "plate-label-wrap", html: `<span class="plate-label" aria-hidden="true">${PLATE_NAMES[label.code]}</span>`, iconSize: [0, 0] }),
      }).addTo(group);
    }
    group.addTo(map);
    platesLayerRef.current = group;
    return () => { map.off("zoomend", drawTeeth); };
  }, [layers.plates, ready]);

  // Fallas activas en tierra (Pedro Miguel y Limón): trazo blanco con borde rojo, distinto de los límites de placas, y su nombre.
  useEffect(() => {
    const map = mapRef.current;
    const L = (window as any).L;
    if (!ready || !map || !L) return;
    if (faultsLayerRef.current) {
      map.removeLayer(faultsLayerRef.current);
      faultsLayerRef.current = null;
    }
    if (!layers.faults) return;
    const group = L.layerGroup();
    for (const fault of ACTIVE_FAULTS) {
      const latlngs = fault.lines.map(line => line.map(([lng, lat]) => [lat, lng]));
      L.polyline(latlngs, { pane: "plates", interactive: false, color: "#b8102b", weight: 7, opacity: 0.9, lineCap: "round", lineJoin: "round" }).addTo(group);
      L.polyline(latlngs, { pane: "plates", color: "#ffffff", weight: 3, opacity: 1, lineCap: "round", lineJoin: "round" })
        .bindTooltip(`${fault.name}: falla activa, ${fault.kind}. ${fault.facts[0]}`, { sticky: true, className: "fault-tip" })
        .addTo(group);
      const [lng, lat] = labelPoint(fault);
      L.marker([lat, lng], {
        pane: "plates", interactive: false, keyboard: false,
        icon: L.divIcon({ className: "plate-label-wrap", html: `<span class="fault-label" aria-hidden="true">${fault.name}</span>`, iconSize: [0, 0] }),
      }).addTo(group);
    }
    group.addTo(map);
    faultsLayerRef.current = group;
  }, [layers.faults, ready]);

  // «Ver las fallas en el mapa» (desde su ficha): se enciende la capa, se vuelve al mapa plano y se encuadran las fallas.
  const faultsSeen = useRef(faultsKey);
  useEffect(() => {
    const map = mapRef.current;
    const L = (window as any).L;
    if (faultsSeen.current === faultsKey || !ready || !map || !L) return;
    faultsSeen.current = faultsKey;
    setLayers(current => ({ ...current, faults: true }));
    setView3d(false);
    const bounds = L.latLngBounds(ACTIVE_FAULTS.flatMap(fault => fault.lines.flat().map(([lng, lat]) => [lat, lng])));
    map.flyToBounds(bounds.pad(0.35), { duration: reducedMotion() ? 0 : 1.2, maxZoom: 11 });
  }, [faultsKey, ready]);

  // La primera vez que se abre el 3D se enciende la ruptura de la falla; la onda de sacudida queda como opción (tapaba medio país
  // al abrir). Luego manda lo que elija la persona.
  const autoRupture = useRef(true);
  const openView3d = () => {
    setView3d(true);
    if (autoRupture.current) {
      autoRupture.current = false;
      loadMainshockDetail();
      setLayers(current => ({ ...current, rupture: true }));
    }
  };
  // «Ver cómo se propagó»: para el sismo principal se reinicia la animación de la vista 3D (ruptura y onda); para cualquier otro,
  // en el mapa plano se abren dos anillos desde el epicentro (onda P y onda S, con el modelo ak135) y se ve cuándo llega la
  // sacudida a las capitales (modelo) y cuándo la registró cada estación (llegadas reales que publica el USGS).
  const [restart3d, setRestart3d] = useState(0);
  const [waveHud, setWaveHud] = useState<{
    t: number; done: boolean; cities: { name: string; seconds: number }[]; citiesTotal: number;
    stations: { code: string; p: number | null; s: number | null }[]; stationsTotal: number; real: boolean;
  } | null>(null);
  const view3dNow = useRef(view3d);
  useEffect(() => {
    view3dNow.current = view3d;
  });
  useEffect(() => {
    if (!propagation || !ready) return;
    const { event } = propagation;
    if (latest.current.mainshock && event.id === latest.current.mainshock.id) {
      if (!view3dNow.current) openView3d();
      // Aquí sí se pidió ver la propagación: ruptura y onda de sacudida.
      setLayers(current => ({ ...current, rupture: true, wave: true }));
      setRestart3d(count => count + 1);
      latest.current.onPropagationEnd();
      return;
    }
    const map = mapRef.current;
    const L = (window as any).L;
    if (!map || !L) return;
    const wasIn3d = view3dNow.current;
    setView3d(false);
    let cancelled = false;
    let raf = 0;
    let group: any = null;
    const timers: number[] = [];
    const [lng, lat, depthRaw] = event.geometry.coordinates;
    const depth = Number.isFinite(depthRaw) ? depthRaw! : 10;
    // Las llegadas a estaciones llegan del servidor; si tardan más de 3 s se anima solo con el modelo.
    const phasesReady = Promise.race([loadEventPhases(event.id), new Promise<null>(resolve => timers.push(window.setTimeout(() => resolve(null), 3000)))]);
    phasesReady.then(phases => {
      if (cancelled) return;
      timers.push(window.setTimeout(() => {
        if (cancelled) return;
        map.invalidateSize({ animate: false });
        map.closePopup();
        const { list } = arrivals(event);
        // Estaciones reales: las más cercanas (hasta 900 km), con su posición calculada con la distancia y el rumbo que publica el USGS.
        const stations = (phases?.stations ?? []).filter(station => station.distanceKm <= 900).slice(0, 5).map(station => {
          const [from, bearing, arc] = [(lat * Math.PI) / 180, (station.azimuth * Math.PI) / 180, station.distanceKm / 6371];
          const toLat = Math.asin(Math.sin(from) * Math.cos(arc) + Math.cos(from) * Math.sin(arc) * Math.cos(bearing));
          const toLng = (lng * Math.PI) / 180 + Math.atan2(Math.sin(bearing) * Math.sin(arc) * Math.cos(from), Math.cos(arc) - Math.sin(from) * Math.sin(toLat));
          return { ...station, lat: (toLat * 180) / Math.PI, lng: (toLng * 180) / Math.PI };
        });
        const lastObserved = Math.max(0, ...stations.flatMap(station => [station.p ?? 0, station.s ?? 0]));
        const end = Math.max(...list.map(city => city.seconds), lastObserved, 5) + 4;
        group = L.layerGroup().addTo(map);
        const ring = (color: string, dash: string | undefined, fill: number) =>
          L.circle([lat, lng], { radius: 1, color, weight: 2.5, dashArray: dash, fillColor: color, fillOpacity: fill, interactive: false }).addTo(group);
        const pRing = ring("#5aa9ff", "6 6", 0.05);
        const sRing = ring("#ff8a24", undefined, 0.12);
        L.circleMarker([lat, lng], { radius: 7, color: "#ffffff", weight: 2.5, fillColor: "#da121a", fillOpacity: 1, interactive: false })
          .bindTooltip("Epicentro", { permanent: true, direction: "left", offset: [-9, 0], className: "place-label" }).addTo(group);
        const dots = list.map(city =>
          L.circleMarker([city.lat, city.lng], { radius: 6, color: "#ffffff", weight: 2, fillColor: "#6b7685", fillOpacity: 1, interactive: false })
            .bindTooltip(city.name, { permanent: true, direction: "right", offset: [9, 0], className: "place-label" }).addTo(group),
        );
        const posts = stations.map(station =>
          L.circleMarker([station.lat, station.lng], { radius: 5, color: "#ffffff", weight: 2, fillColor: "#6b7685", fillOpacity: 1, interactive: false })
            .bindTooltip(`Estación ${station.code.split(".")[1]}`, { permanent: true, direction: "top", offset: [0, -7], className: "place-label" }).addTo(group),
        );
        map.flyToBounds(L.latLngBounds([[lat, lng], ...list.map(city => [city.lat, city.lng]), ...stations.slice(0, 3).map(station => [station.lat, station.lng])]), {
          padding: [60, 60], maxZoom: 9, duration: reducedMotion() ? 0 : 1,
        });
        let lastHud = -1;
        const paint = (t: number, hud: boolean) => {
          pRing.setRadius(frontRadiusKm(t, depth, "p") * 1000);
          sRing.setRadius(frontRadiusKm(t, depth, "s") * 1000);
          const cities = list.flatMap((city, index) => {
            const hit = city.seconds <= t;
            dots[index].setStyle({ fillColor: hit ? "#ff8a24" : "#6b7685" });
            dots[index].setTooltipContent(hit ? `${city.name} · ${Math.max(1, Math.round(city.seconds))} s` : city.name);
            return hit ? [{ name: city.name, seconds: Math.max(1, Math.round(city.seconds)) }] : [];
          });
          const seen = stations.flatMap((station, index) => {
            const [gotP, gotS] = [station.p !== null && station.p <= t, station.s !== null && station.s <= t];
            posts[index].setStyle({ fillColor: gotS ? "#ff8a24" : gotP ? "#5aa9ff" : "#6b7685" });
            const name = station.code.split(".")[1];
            posts[index].setTooltipContent(gotP || gotS ? `Estación ${name} · ${gotP ? `P ${Math.round(station.p!)} s` : ""}${gotP && gotS ? " · " : ""}${gotS ? `S ${Math.round(station.s!)} s` : ""}` : `Estación ${name}`);
            return gotP || gotS ? [{ code: station.code, p: gotP ? station.p : null, s: gotS ? station.s : null }] : [];
          });
          if (hud) setWaveHud({ t, done: t >= end, cities, citiesTotal: list.length, stations: seen, stationsTotal: stations.length, real: stations.length > 0 });
        };
        if (reducedMotion()) {
          paint(end, true);
          return;
        }
        // El recorrido real dura un par de minutos; se acelera para que dure unos 20 s.
        const speed = Math.max(1, end / 20);
        const begin = performance.now() + 1100;
        const tick = (now: number) => {
          if (cancelled) return;
          const t = Math.min(end, Math.max(0, ((now - begin) / 1000) * speed));
          const hud = now - lastHud > 120 || t >= end;
          if (hud) lastHud = now;
          paint(t, hud);
          if (t < end) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      }, wasIn3d ? 300 : 0));
    });
    return () => {
      cancelled = true;
      timers.forEach(timer => window.clearTimeout(timer));
      cancelAnimationFrame(raf);
      if (group) map.removeLayer(group);
    };
  }, [propagation, ready]);
  const toggleLayer = (name: "rupture" | "felt" | "shaking" | "plates" | "wave" | "faults") => {
    if (name !== "plates" && name !== "faults") loadMainshockDetail();
    setLayers(current => ({ ...current, [name]: !current[name] }));
  };
  const detailReady = usgs.status === "ready" && usgsDetail !== null;
  const fault = detailReady ? usgsDetail.fault : null;
  const felt = detailReady ? usgsDetail.felt : null;
  const shaking = detailReady ? usgsDetail.shaking : null;
  const anyLayer = layers.rupture || layers.felt || layers.shaking;

  // Al elegir una provincia o comarca se dibuja su borde; al elegir además una ciudad se marca con su nombre.
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
    if (province) {
      const rings = province.rings.map(ring => ring.map(([lng, lat]) => [lat, lng]));
      regionLayerRef.current = L.polygon(rings, {
        className: "province-outline", color: "#ffffff", weight: 2.5, dashArray: "8 6",
        fillColor: "#ffffff", fillOpacity: 0.09, interactive: false,
      }).addTo(map);
    }
    if (placeLat !== null && placeLng !== null) {
      placeLayerRef.current = L.circleMarker([placeLat, placeLng], {
        radius: 6, color: "#ffffff", weight: 2.5, fillColor: "#072357", fillOpacity: 1, interactive: false,
      }).bindTooltip(placeName, { permanent: true, direction: "right", offset: [9, 0], className: "place-label" }).addTo(map);
    }
  }, [region, placeLat, placeLng, placeName, ready]);

  // Encuadra en el mapa lo que dice el filtro: los sismos que deja pasar (más la provincia o la ciudad elegida), para que lo que
  // cuenta la lista se vea siempre, también si antes se movió o acercó el mapa. Sin filtros, regresa a la vista general.
  const fitRef = useRef<(animated: boolean) => void>(() => {});
  useEffect(() => {
    fitRef.current = (animated: boolean) => {
      const map = mapRef.current;
      const L = (window as any).L;
      if (!map || !L) return;
      const still = reducedMotion() || !animated;
      const province = region ? PROVINCE_BY_ID.get(region) : undefined;
      if (!province && placeLat === null && filtersKey === "") {
        if (hadRegion.current) {
          hadRegion.current = false;
          const zoom = window.innerWidth < 760 ? 6 : 7;
          map.invalidateSize({ animate: false });
          if (still) map.setView([8.46, -80.4], zoom, { animate: false });
          else map.flyTo([8.46, -80.4], zoom, { duration: 1 });
        }
        return;
      }
      const points = latest.current.events.map(event => [event.geometry.coordinates[1], event.geometry.coordinates[0]] as [number, number]);
      let bounds = null;
      if (placeLat !== null && placeLng !== null) bounds = L.latLngBounds([[placeLat, placeLng], ...points]);
      else if (province) {
        bounds = L.latLngBounds(province.bounds);
        for (const point of points) bounds.extend(point);
      } else if (points.length) bounds = L.latLngBounds(points);
      // Sin sismos ni provincia que mostrar no hay nada que encuadrar: la vista se queda como está.
      if (!bounds) return;
      hadRegion.current = true;
      map.closePopup();
      // El mapa pudo cambiar de tamaño mientras estaba oculto (vista 3D): se mide de nuevo antes de encuadrar.
      map.invalidateSize({ animate: false });
      const maxZoom = placeLat !== null ? 11 : 10;
      if (still) map.fitBounds(bounds, { padding: [40, 40], maxZoom, animate: false });
      else map.flyToBounds(bounds, { padding: [40, 40], maxZoom, duration: 1.1 });
    };
  });
  useEffect(() => {
    if (ready && (!focus || focusedRef.current === focus)) fitRef.current(true);
  }, [filtersKey, region, placeLat, placeLng, ready]);
  useEffect(() => {
    if (ready && fitKey > 0) fitRef.current(true);
  }, [fitKey, ready]);
  // Al volver del 3D al mapa plano el contenedor recupera su tamaño: se mide de nuevo y se encuadra el filtro.
  useEffect(() => {
    if (view3d || !ready) return;
    const timer = window.setTimeout(() => {
      mapRef.current?.invalidateSize({ animate: false });
      if (!focus || focusedRef.current === focus) fitRef.current(false);
    }, 80);
    return () => window.clearTimeout(timer);
  }, [view3d, ready]);

  useEffect(() => {
    if (!focus || focusedRef.current === focus || !mapRef.current) return;
    const marker = markersRef.current.get(focus.id);
    if (!marker) return;
    focusedRef.current = focus;
    if (!focus.quiet && view3dNow.current) setView3d(false);
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

  // Marca en el mapa 2D el círculo del sismo seleccionado actualmente.
  useEffect(() => {
    for (const [id, marker] of markersRef.current.entries()) {
      const span = marker.getElement()?.firstElementChild as HTMLElement | undefined;
      span?.classList.toggle("selected", id === selectedId);
    }
  }, [selectedId, events, ready]);

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
      <button
        type="button" className={`layer-chip${layers.faults ? " on" : ""}`} aria-pressed={layers.faults} onClick={() => toggleLayer("faults")}
        title="Fallas activas en tierra en el centro del país: Pedro Miguel, Limón y Gatún (CCAF-DB/GEM; Rockwell et al., 2010; Gath et al.)"
      ><span className="chip-long">Fallas activas</span><span className="chip-short" aria-hidden="true">Fallas</span></button>
    </>
  );
  // La onda de sacudida solo existe en la vista 3D.
  const waveChip = (
    <button
      type="button" className={`layer-chip${layers.wave ? " on" : ""}`} aria-pressed={layers.wave} onClick={() => toggleLayer("wave")}
      title="Cómo se propagó la sacudida por el país: color = intensidad estimada por el USGS; el frente avanza con el modelo de velocidades ak135"
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
      <div id="leaflet-map" ref={mapDiv} role="group" aria-label="Mapa interactivo de sismos en Panamá" data-filtered={filtersKey !== "" ? "true" : undefined} />
      <div className={`map-wheel-hint${wheelHint && !view3d ? " show" : ""}`} aria-hidden="true">
        Mantén <kbd>{modKey}</kbd> y usa la rueda para acercar el mapa
      </div>
      {fullscreen === "overlay" && <span className="map-overlay-flag" hidden />}
      {propagation && waveHud && !view3d && (
        <div className="wave-hud" role="status">
          <div className="wave-hud-top">
            <strong>Así se propagó el temblor</strong>
            <button type="button" onClick={() => { setWaveHud(null); onPropagationEnd(); }} aria-label="Cerrar la animación de propagación">Cerrar</button>
          </div>
          <p>
            {waveHud.done ? "La sacudida ya pasó por todas las ciudades." : `Segundo ${Math.floor(waveHud.t)}`}
            {waveHud.cities.length > 0 && ` · Llegó a ${waveHud.cities.map(city => `${city.name} (${city.seconds} s)`).join(", ")}`}
          </p>
          {waveHud.real && (
            <p>
              {waveHud.stations.length === 0 ? "Aún ninguna estación lo ha registrado." : `Registrado por ${waveHud.stations.map(station => `${station.code.split(".")[1]}${station.p !== null ? ` (P ${Math.round(station.p)} s${station.s !== null ? `, S ${Math.round(station.s)} s` : ""})` : ""}`).join(", ")}`}
            </p>
          )}
          <small>
            Anillos y ciudades: modelo ak135 (IASPEI), onda P en azul y onda S en naranja.
            {waveHud.real ? " Estaciones: llegadas medidas y publicadas por el USGS." : " Este sismo no tiene llegadas a estaciones publicadas por el USGS: solo modelo."}
          </small>
        </div>
      )}
      {view3d && (
        <Suspense fallback={<div className="q3-loading" role="status">Cargando la vista 3D…</div>}>
          <Quake3D
            events={events} aftershockToggle={false} aftershockReveal={aftershockToggle} filtersKey={filtersKey} fitKey={fitKey} restartKey={restart3d} expanded={fullscreen !== "off"} overlay={fullscreen === "overlay"} onToggleExpanded={toggleFullscreen} mainshock={mainshock} selectedId={selectedId} replay={replay} region={region}
            fault={layers.rupture ? fault : null} felt={layers.felt ? felt : null} shaking={layers.shaking ? shaking : null} plates={layers.plates} activeFaults={layers.faults} wave={layers.wave} shakeGrid={detailReady ? usgsDetail.shakeGrid : null} mechanism={detailReady ? usgsDetail.mechanism : null} onSelect={onSelect}
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
        <button
          type="button"
          className={`layer-btn map-fullscreen-btn${fullscreen !== "off" ? " active" : ""}`}
          aria-pressed={fullscreen !== "off"}
          onClick={toggleFullscreen}
          aria-label={fullscreen !== "off" ? "Salir de la pantalla completa del mapa" : "Pantalla completa del mapa"}
          title={fullscreen !== "off" ? "Salir de la pantalla completa" : "Ver el mapa en pantalla completa"}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={fullscreen !== "off" ? "M21 3l-7 7m0-6v6h6M3 21l7-7m-6 0h6v6" : "M15 3h6v6m0-6-7 7M9 21H3v-6m0 6 7-7"} />
          </svg>
          <span className="layer-text-full">{fullscreen !== "off" ? "Salir" : "Pantalla completa"}</span>
        </button>
      </div>
      {/* Los botones de capas y su leyenda van en una misma columna: la leyenda crece hacia abajo y nunca tapa los botones. */}
      <div className="map-layers-dock">
      {!view3d && (
        <div className="map-layers" role="group" aria-label="Capas del mapa: datos del USGS y placas tectónicas">
          <span className="map-layers-title" aria-hidden="true">Capas del mapa</span>
          {layerChips}
          {layerNote}
        </div>
      )}
      {((detailReady && anyLayer) || layers.plates || layers.faults) && (
        <div className="map-layers-legend" role="group" aria-label="Leyenda de las capas del mapa">
          {detailReady && layers.rupture && (
            fault ? (
              <div>
                <i className="slip-ramp" aria-hidden="true" style={{ background: SLIP_GRADIENT }} />
                <span>Ruptura de la falla: cuánto se deslizó, de poco (amarillo) a {fault.maxSlipM.toFixed(1)} m (rojo oscuro). Las curvas van cada 2 m; la línea blanca gruesa es el borde superior de la falla.</span>
                {fault.durationS && (
                  <button type="button" className="legend-action" onClick={playRupture}>
                    ▶ Ver cómo se rompió ({Math.round(fault.durationS)} s)
                  </button>
                )}
              </div>
            ) : <div><span>El USGS no publica el modelo de ruptura de este sismo.</span></div>
          )}
          {detailReady && layers.felt && (
            felt ? (
              <div>
                <span className="felt-scale" aria-hidden="true">{[3, 4, 5, 6, 7, 8, 9].map(v => <i key={v} style={{ background: intensityColor(v) }} />)}</span>
                <span>Lo que sintió la gente: cada círculo es una zona de 10 km. El color es la intensidad que reportaron y el tamaño, cuántas personas respondieron ({felt.responses.toLocaleString("es-PA")} respuestas al USGS).</span>
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
          {layers.faults && (
            <div className="faults-legend">
              <span><i className="fault-swatch" aria-hidden="true" />Fallas activas en tierra: Pedro Miguel, Limón y Gatún. Trazado aproximado (escalas de 1:75 000 a 1:300 000).</span>
              <span className="plate-note">{ACTIVE_FAULTS_SOURCE}.</span>
            </div>
          )}
          {detailReady && anyLayer && <div className="map-layers-source"><span>Fuente de los datos sísmicos: USGS (earthquake.usgs.gov)</span></div>}
        </div>
      )}
      </div>
      {!ready && <div className="map-fallback">Cargando mapa satelital…</div>}
    </>
  );
}
