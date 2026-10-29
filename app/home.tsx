"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { Bell, BellRing, ExternalLink, House, Info, LayoutGrid, List, Map as MapIcon, Phone, ShieldCheck } from "lucide-react";
import MainshockUsgs from "./mainshock-usgs";
import PlatesExplainer from "./plates-explainer";
import FaultsExplainer from "./faults-explainer";
import QuakeMap from "./quake-map";
import SafetyGuide from "./safety-guide";
import Checklists from "./checklists";
import Sources from "./sources";
import OjoMark from "./ojo-mark";
import StatusNow from "./status-now";
import MoreSheet from "./more-sheet";
import ThemeToggle from "./theme-toggle";
import { placeTitle } from "../lib/quake-summary";
import SequenceChart from "./sequence-chart";
import AlertModal from "./alert-modal";
import PwaInstall, { InstallCard } from "./pwa-install";
import InAppBrowserNotice from "./in-app-browser-notice";
import {
  ALARM_MAX_AGE_MS,
  broadcastEarthquakeAlert,
  earthquakeFromPush,
  getNotificationPermissionStatus,
  getWhatsAppShareUrl,
  hasActivePush,
  isSeenQuake,
  PUSH_CHANGE_EVENT,
  loadAlertPreferences,
  loadSeenQuakes,
  rememberQuakes,
  saveSeenQuakes,
  syncPushSubscription,
  stopAlarmSound,
  type SeenQuake,
} from "../lib/alert-system";
import { PLACE_BY_ID, cityMatches, placeKey, placeLabel, placeName, whereText } from "../lib/place-of";
import { DISTRICTS } from "../lib/places";
import { setLatestQuake } from "../lib/latest-quake";
import { INSTAGRAM_URL } from "../lib/site";
import { SOURCE_NAMES, reportUrl } from "../lib/quake-facts";
import QuakeSheet, { QuakeDetails } from "./quake-sheet";
import FeltReport from "./felt-report";
import Link from "next/link";
import { createPortal } from "react-dom";
import { FAR_OFFSHORE, OUTSIDE, PROVINCE_BY_ID, provinceKey, provinceLabel } from "../lib/province-of";
import { PROVINCES } from "../lib/provinces";
import { MAINSHOCK_ID, awaitsConfirmation, isAftershock, isBeforeMainshock, isUnconfirmed, sameEvent, type Earthquake, type EarthquakeResponse, type FocusRequest, type LiveAlert, type MainshockResponse, type ReplayStep } from "../lib/earthquakes";

// La lista de sismos en tiempo real se consulta cada 35 s.
// El sismo principal histórico y conteo de réplicas se consulta cada 5 min (300 s) para proteger cuotas del servidor.
const POLL_MS = 35_000;
const SLOW_POLL_MS = 300_000;

const date = new Intl.DateTimeFormat("es-PA", {
  timeZone: "America/Panama", day: "numeric", month: "short", year: "numeric",
});
const dateTime = new Intl.DateTimeFormat("es-PA", {
  timeZone: "America/Panama", day: "numeric", month: "short", year: "numeric",
  hour: "2-digit", minute: "2-digit", hour12: true,
});
const clockFormat = new Intl.DateTimeFormat("es-PA", {
  timeZone: "America/Panama", hour: "numeric", minute: "2-digit", hour12: true,
});

function magText(event: Earthquake) {
  return event.properties.mag === null ? "—" : event.properties.mag.toFixed(1);
}
function placeText(event: Earthquake) {
  return event.properties.place || "Ubicación no especificada";
}
function depthText(event: Earthquake) {
  const depth = event.geometry.coordinates[2];
  return Number.isFinite(depth) ? `${Math.round(depth!)} km` : "No disponible";
}
const NAV = [
  ["inicio", House, "Inicio"], ["mapa", MapIcon, "Mapa"], ["eventos", List, "Sismos"],
  ["recomendaciones", ShieldCheck, "Qué hacer"], ["fuentes", Info, "Fuentes"],
] as const;
const SPIED = ["inicio", "mapa", "eventos", "recomendaciones", "fuentes"];

// "35 min" o "1 h 5 min".
function agoText(minutes: number) {
  const m = Math.max(0, minutes);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`;
}

// «Incluir alrededores»: se recuerda en el equipo. Se lee con useSyncExternalStore para que el servidor (sin preferencia) y el
// navegador no dibujen cosas distintas al cargar.
const NEARBY_KEY = "sismo_panama_nearby_v1";
const NEARBY_EVENT = "sismo-panama-nearby";
const readNearby = () => {
  try {
    return localStorage.getItem(NEARBY_KEY) === "1";
  } catch {
    return false;
  }
};
const subscribeNearby = (changed: () => void) => {
  window.addEventListener(NEARBY_EVENT, changed);
  window.addEventListener("storage", changed);
  return () => {
    window.removeEventListener(NEARBY_EVENT, changed);
    window.removeEventListener("storage", changed);
  };
};
const setIncludeNearby = (on: boolean) => {
  try {
    localStorage.setItem(NEARBY_KEY, on ? "1" : "0");
  } catch {
    // Sin almacenamiento (navegación privada estricta) la elección no se puede guardar ni aplicar.
  }
  window.dispatchEvent(new Event(NEARBY_EVENT));
};

// Cambios en el permiso o la suscripción de alertas (los anuncia lib/alert-system.ts; también al volver a la pestaña, por si se
// cambiaron en los ajustes del navegador).
const subscribePushChange = (changed: () => void) => {
  window.addEventListener(PUSH_CHANGE_EVENT, changed);
  window.addEventListener("focus", changed);
  return () => {
    window.removeEventListener(PUSH_CHANGE_EVENT, changed);
    window.removeEventListener("focus", changed);
  };
};

const ROW_PAGE = 60;

// `latestFallback`: el último sismo ya dibujado en el servidor (ver page.tsx). Ocupa la tarjeta de «Último sismo» mientras el navegador
// consulta los datos, para que la página llegue (y la lea Google) con el sismo real y no con un esqueleto vacío.
export default function Home({ latestFallback }: { latestFallback?: ReactNode }) {
  const [minimum, setMinimum] = useState(0);
  const [timeRange, setTimeRange] = useState<"all" | "24h" | "6h">("all");
  // "all", el id de una provincia o comarca (ver lib/provinces.ts) o "mar" (lejos de toda costa).
  const [province, setProvince] = useState("all");
  // "all" o el id de GeoNames de una ciudad o localidad (lib/places.ts); depende de la provincia elegida.
  const [city, setCity] = useState("all");
  const [allEvents, setAllEvents] = useState<Earthquake[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [catalogs, setCatalogs] = useState<EarthquakeResponse["catalogs"]>();
  const [clock, setClock] = useState<string>("--:--");
  const [refreshKey, setRefreshKey] = useState(0);
  const [slowKey, setSlowKey] = useState(0);
  const lastBump = useRef(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focus, setFocus] = useState<FocusRequest | null>(null);
  const [mainshock, setMainshock] = useState<MainshockResponse | null>(null);
  const [onlyAftershocks, setOnlyAftershocks] = useState(false);
  const [sort, setSort] = useState<"recent" | "magnitude">("recent");
  // La lista tiene cientos de sismos (y crece con las réplicas): dibujarlos todos tardaba entre 0.3 y 1.2 s en cada cambio de orden
  // en una computadora rápida, varios segundos en un celular (la página parecía colgada). Se dibujan los primeros y el resto con «Mostrar más».
  const [rowLimit, setRowLimit] = useState(ROW_PAGE);
  const [shared, setShared] = useState(false);
  const [section, setSection] = useState("inicio");
  const [replayKey, setReplayKey] = useState(0);
  const [replay, setReplay] = useState<ReplayStep | null>(null);
  // La clave 0 significa "sin reproducción": al volver a ella el mapa corta la secuencia y muestra todos los sismos.
  const stopReplay = () => setReplayKey(0);
  // La vista 3D arranca solo con el sismo principal; las réplicas aparecen con «Ver réplicas». La reproducción las necesita todas, así que las enciende.
  // El mapa plano (satélite, Esri, callejero) siempre muestra todo.
  const [showAftershocks, setShowAftershocks] = useState(false);
  const startReplay = () => { setShowAftershocks(true); setReplayKey(key => key + 1); };
  // Cambiar un filtro detiene la reproducción: lo que se reproduce es exactamente lo que el filtro deja ver.
  useEffect(() => { setReplayKey(0); }, [province, city, minimum, timeRange, onlyAftershocks]);
  const navLock = useRef(0);
  const [alert, setAlert] = useState<LiveAlert | null>(null);
  const [dismissedKey, setDismissedKey] = useState(0);
  const [alertModalOpen, setAlertModalOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  // ¿Llegan las alertas con la app cerrada? (permiso + suscripción push). Es lo que dice el botón del encabezado.
  const [pushActive, setPushActive] = useState(false);
  useEffect(() => {
    const update = () => { hasActivePush().then(setPushActive).catch(() => setPushActive(false)); };
    window.addEventListener(PUSH_CHANGE_EVENT, update);
    update();
    return () => window.removeEventListener(PUSH_CHANGE_EVENT, update);
  }, []);
  // El permiso se lee con useSyncExternalStore: el servidor no lo conoce y leerlo al dibujar daba un error de hidratación.
  const permStatus = useSyncExternalStore(subscribePushChange, getNotificationPermissionStatus, () => "default" as const);
  const seen = useRef<SeenQuake[] | null>(null);
  const previousEvents = useRef<Earthquake[]>([]);
  const introFocused = useRef(false);

  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js")
        .then(() => syncPushSubscription(loadAlertPreferences().minMagnitude))
        .catch(e => {
          console.warn("No se pudo registrar Service Worker:", e);
        });
    }
  }, []);

  // Un push que llega con la app abierta (o en memoria): el service worker no puede sonar, así que le avisa a la
  // página y esta hace sonar sirena y voz en ese instante. Si la página ya conocía el sismo, no repite nada.
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    const onMessage = (message: MessageEvent) => {
      if (message.data?.type !== "quake-push") return;
      const event = earthquakeFromPush(message.data.quake ?? {});
      if (!event) return;
      const known = loadSeenQuakes();
      if (isSeenQuake(event, known) || previousEvents.current.some(old => sameEvent(old, event))) return;
      const remembered = rememberQuakes(known, [event]);
      seen.current = remembered;
      saveSeenQuakes(remembered);
      const prefs = loadAlertPreferences();
      if (event.properties.mag !== null && event.properties.mag < prefs.minMagnitude) return;
      const now = Date.now();
      const quiet = now - event.properties.time > ALARM_MAX_AGE_MS;
      setAlert({ key: now, event, count: 1, quiet });
      if (!quiet) broadcastEarthquakeAlert(event, 1, prefs, false, true);
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    const tick = () => setClock(clockFormat.format(new Date()));
    tick();
    const timer = window.setInterval(tick, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setStatus("loading");
      const timeout = window.setTimeout(() => controller.abort(), 35_000);
      try {
        const response = await fetch("/api/earthquakes", {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Error ${response.status}`);
        const data: EarthquakeResponse = await response.json();
        if (!Array.isArray(data.features)) throw new Error("Respuesta no válida");

        // Se lee de localStorage en cada consulta: así otra pestaña (o la app instalada) que ya dio la alerta
        // de un sismo también cuenta, y este dispositivo no la repite.
        const stored = loadSeenQuakes();
        const known = stored.length > 0 ? stored : (seen.current ?? []);
        const isFirstRun = !seen.current && stored.length === 0;

        // Un sismo que solo trae el EMSC (y es menor de M 5) no suena ni avisa hasta que el IGC o el USGS lo confirmen. Tampoco se
        // anota como visto: así, cuando lo confirmen, cuenta como nuevo y avisa entonces (ver awaitsConfirmation).
        const igcUp = data.catalogs?.igc ?? true;
        const held = (event: Earthquake) => awaitsConfirmation(event, igcUp);
        const reliable = data.features.filter(event => !held(event));

        // Un sismo es "nuevo" si no estaba registrado y ocurrió hace menos de 2 horas
        const fresh = reliable.filter(
          event => !event.properties.noAlert && !isSeenQuake(event, known) && !previousEvents.current.some(old => sameEvent(old, event)) && Date.now() - event.properties.time < 2 * 3_600_000,
        );

        // Con un sismo nuevo se actualizan ya los contadores de réplicas y el contraste entre agencias.
        if (!isFirstRun && fresh.length > 0) setSlowKey(key => key + 1);

        const prefs = loadAlertPreferences();
        const qualifying = fresh.filter(
          event => event.properties.mag === null || event.properties.mag >= prefs.minMagnitude,
        );

        // Se anota como visto antes de avisar, para que otra pestaña que consulte ahora no avise también.
        const remembered = rememberQuakes(known, reliable);
        seen.current = remembered;
        previousEvents.current = reliable;
        saveSeenQuakes(remembered);

        if (!isFirstRun && qualifying.length > 0) {
          const strongestOf = (list: Earthquake[]) =>
            list.reduce<Earthquake | null>(
              (best, event) => (!best || (event.properties.mag ?? -10) > (best.properties.mag ?? -10) ? event : best),
              null,
            );
          // Sirena y voz solo para lo que acaba de ocurrir. Un sismo de hace un rato (se reabrió la app o el
          // equipo despertó) se muestra en pantalla y en silencio: una alarma por algo viejo confunde.
          const now = Date.now();
          const recent = qualifying.filter(event => now - event.properties.time <= ALARM_MAX_AGE_MS);
          const quiet = recent.length === 0;
          const strongest = strongestOf(quiet ? qualifying : recent);
          if (strongest) {
            setAlert({ key: now, event: strongest, count: qualifying.length, quiet });
            if (!quiet) broadcastEarthquakeAlert(strongest, qualifying.length, prefs);
          }
        }

        setAllEvents(data.features);
        setLastUpdate(data.fetchedAt);
        setCatalogs(data.catalogs);
        setStatus("ready");
        if (!introFocused.current && data.features.length > 0) {
          introFocused.current = true;
          // Al tocar una notificación push la dirección trae ?focus=<id> del sismo avisado: se enfoca ese y no el
          // último. El id puede ser el de otro catálogo (alias) si el sismo se fusionó después.
          const wanted = new URLSearchParams(window.location.search).get("focus");
          const target = wanted ? data.features.find(event => event.id === wanted || event.properties.aliases?.includes(wanted)) : undefined;
          if (wanted) window.history.replaceState(null, "", window.location.pathname + window.location.hash);
          if (target) {
            setSelectedId(target.id);
            window.setTimeout(() => document.getElementById("mapa")?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
          }
          setFocus({ id: (target ?? data.features[0]).id, quiet: true });
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("No se pudo cargar el catálogo sísmico:", error);
        setStatus(prev => (allEvents.length > 0 ? "ready" : "error"));
      } finally {
        window.clearTimeout(timeout);
      }
    };
    load();
    return () => controller.abort();
  }, [refreshKey]);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch("/api/earthquakes/mainshock", {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Error ${response.status}`);
        const data: MainshockResponse = await response.json();
        if (!data.mainshock) throw new Error("Respuesta no válida");
        setMainshock(data);
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("No se pudo cargar el sismo principal:", error);
      }
    };
    load();
    return () => controller.abort();
  }, [slowKey]);

  useEffect(() => {
    if (!alert) return;
    const timer = window.setTimeout(() => {
      stopAlarmSound();
      setDismissedKey(alert.key);
    }, 18_000);
    return () => window.clearTimeout(timer);
  }, [alert]);

  // Marca en el menú la sección que se está leyendo. Tras pulsar un enlace se congela un momento,
  // para que el scroll animado no recorra las secciones intermedias.
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      if (performance.now() < navLock.current) return;
      const line = window.innerHeight * 0.35;
      let active = SPIED[0];
      for (const id of SPIED) {
        const element = document.getElementById(id);
        if (element && element.getBoundingClientRect().top <= line) active = id;
      }
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) active = SPIED[SPIED.length - 1];
      setSection(active);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    frame = requestAnimationFrame(update);
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!document.hidden) setRefreshKey(key => key + 1);
    }, POLL_MS);
    const slowTimer = window.setInterval(() => {
      if (!document.hidden) setSlowKey(key => key + 1);
    }, SLOW_POLL_MS);

    // Al volver a la pestaña se consulta todo de inmediato. visibilitychange, focus y pageshow suelen dispararse
    // juntos: se atienden como una sola consulta.
    const onVisible = () => {
      if (document.hidden) return;
      const at = Date.now();
      if (at - lastBump.current < 2_000) return;
      lastBump.current = at;
      setRefreshKey(key => key + 1);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("pageshow", onVisible);

    return () => {
      window.clearInterval(timer);
      window.clearInterval(slowTimer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("pageshow", onVisible);
    };
  }, []);

  // Sismos de los alrededores (Costa Rica, Colombia, mar abierto): solo con «Incluir alrededores». Se suman a la lista y al mapa,
  // pero no a las alertas, los conteos de réplicas ni la secuencia.
  const includeNearby = useSyncExternalStore(subscribeNearby, readNearby, () => false);
  const [nearbyEvents, setNearbyEvents] = useState<Earthquake[]>([]);
  useEffect(() => {
    if (!includeNearby) return;
    const controller = new AbortController();
    fetch("/api/earthquakes/nearby", { signal: controller.signal })
      .then(response => (response.ok ? (response.json() as Promise<EarthquakeResponse>) : null))
      .then(data => { if (data && Array.isArray(data.features)) setNearbyEvents(data.features); })
      .catch(() => {
        // Si falla se conservan los que ya había: la próxima consulta lo vuelve a intentar.
      });
    return () => controller.abort();
  }, [includeNearby, refreshKey]);
  const shownEvents = useMemo(() => {
    if (!includeNearby || !nearbyEvents.length) return allEvents;
    // Un mismo sismo puede figurar en Panamá en un catálogo y en el país vecino en otro: manda el de Panamá.
    const extra = nearbyEvents.filter(near => !allEvents.some(event => sameEvent(event, near)));
    return [...allEvents, ...extra].sort((a, b) => b.properties.time - a.properties.time);
  }, [allEvents, nearbyEvents, includeNearby]);

  const outsideCount = useMemo(() => shownEvents.filter(event => event.properties.nearby).length, [shownEvents]);
  const main = mainshock?.mainshock ?? null;
  const events = useMemo(
    () => {
      const now = Date.now();
      return shownEvents.filter(event => {
        const magOk = event.properties.mag === null ? minimum === 0 : event.properties.mag >= minimum;
        const afterOk = !onlyAftershocks || !main || (!event.properties.nearby && isAftershock(event, main));
        const timeOk =
          timeRange === "all"
            ? true
            : timeRange === "24h"
            ? now - event.properties.time <= 24 * 3_600_000
            : now - event.properties.time <= 6 * 3_600_000;
        const provinceOk = province === "all" || provinceKey(event) === province;
        const cityOk = cityMatches(event, city);
        return magOk && afterOk && timeOk && provinceOk && cityOk;
      });
    },
    [shownEvents, minimum, onlyAftershocks, main, timeRange, province, city],
  );
  const listEvents = useMemo(
    () => sort === "magnitude" ? [...events].sort((a, b) => (b.properties.mag ?? -10) - (a.properties.mag ?? -10)) : events,
    [events, sort],
  );
  const latest = events[0] ?? null;
  // El último sismo registrado de todos, sin importar los filtros de magnitud o de réplicas de la lista.
  const newest = useMemo(
    () => allEvents.reduce<Earthquake | null>((best, event) => (!best || event.properties.time > best.properties.time ? event : best), null),
    [allEvents],
  );
  // Cuántos sismos hay en cada provincia o comarca (sin importar los demás filtros), para mostrarlo en el selector.
  const provinceCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const event of allEvents) counts.set(provinceKey(event), (counts.get(provinceKey(event)) ?? 0) + 1);
    return counts;
  }, [allEvents]);
  // Ciudades que tienen sismos dentro de la provincia elegida (o de todo el país), con su conteo; las de más sismos primero.
  const cityOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const event of allEvents) {
      if (province !== "all" && provinceKey(event) !== province) continue;
      const key = placeKey(event);
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()]
      .flatMap(([id, count]) => { const place = PLACE_BY_ID.get(id); return place ? [{ place, count }] : []; })
      .sort((a, b) => b.count - a.count || a.place.name.localeCompare(b.place.name, "es"));
  }, [allEvents, province]);
  // Las ciudades se agrupan por distrito (Tonosí: El Cacao, Cañas, Flores…); cada grupo tiene su opción "Todo el distrito".
  const cityGroups = useMemo(() => {
    const groups = new Map<string, { code: string; name: string; province: string; total: number; options: typeof cityOptions }>();
    for (const option of cityOptions) {
      const code = option.place.district;
      const group = groups.get(code) ?? { code, name: DISTRICTS[code]?.name ?? option.place.name, province: option.place.province, total: 0, options: [] };
      group.total += option.count;
      group.options.push(option);
      groups.set(code, group);
    }
    return [...groups.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "es"));
  }, [cityOptions]);
  // Lo que se marca en el mapa: la localidad elegida o el centro del distrito elegido.
  const selectedPlace = useMemo(() => {
    if (city === "all") return null;
    if (city.startsWith("d:")) {
      const district = DISTRICTS[city.slice(2)];
      return district ? { name: `Distrito de ${district.name}`, lat: district.lat, lng: district.lng } : null;
    }
    const place = PLACE_BY_ID.get(city);
    return place ? { name: placeName(place), lat: place.lat, lng: place.lng } : null;
  }, [city]);
  const provinceName = province === "all" ? null : province === FAR_OFFSHORE ? "Mar adentro" : PROVINCES.find(item => item.id === province)?.name ?? null;
  // El sismo principal se dibuja siempre, salvo que se esté mirando una provincia que no lo contiene.
  const mapEvents = useMemo(
    () => main && !events.some(event => event.id === main.id) && (province === "all" || provinceKey(main) === province) && cityMatches(main, city) ? [...events, main] : events,
    [events, main, province, city],
  );
  const sequenceAftershocks = useMemo(
    () => main ? allEvents.filter(event => isAftershock(event, main) && (province === "all" || provinceKey(event) === province) && cityMatches(event, city)) : [],
    [allEvents, main, province, city],
  );
  // Cuántos sismos de la lista son réplicas (posteriores al principal) y cuántos ocurrieron antes que él.
  const listCounts = useMemo(
    () => main ? {
      after: events.filter(event => !event.properties.nearby && isAftershock(event, main)).length,
      before: events.filter(event => !event.properties.nearby && isBeforeMainshock(event, main)).length,
      hasMain: events.some(event => event.id === main.id),
      outside: events.filter(event => event.properties.nearby).length,
    } : null,
    [events, main],
  );
  // La reproducción usa los sismos que el filtro deja ver (el principal y sus réplicas); hacen falta al menos dos. Los de «Incluir alrededores»
  // (Costa Rica, Colombia, mar abierto) no son réplicas ni forman parte de la secuencia: no se cuentan ni se reproducen.
  const replayCount = useMemo(
    () => main ? mapEvents.filter(event => event.id === main.id || (!event.properties.nearby && isAftershock(event, main))).length : 0,
    [mapEvents, main],
  );
  // Vista 3D: con un filtro de magnitud, período, provincia, ciudad o «solo réplicas» enseña lo que ese filtro deja pasar; sin filtros, solo el
  // principal hasta que se toque «Ver réplicas». El principal también viene en el catálogo: así el botón sabe cuántas réplicas hay sin esperar
  // a la consulta del sismo principal.
  const mainForMap = main ?? allEvents.find(event => event.id === MAINSHOCK_ID || event.properties.aliases?.includes(MAINSHOCK_ID)) ?? null;
  const filtersReveal = minimum > 0 || timeRange !== "all" || province !== "all" || city !== "all" || onlyAftershocks;
  // Cuántos de los sismos del mapa son de «Incluir alrededores»: el botón «Ver los N sismos» los suma, y la secuencia y las réplicas no.
  const nearbyOnMap = useMemo(() => mapEvents.filter(event => event.properties.nearby).length, [mapEvents]);
  const hiddenAftershocks = useMemo(
    () => mainForMap ? mapEvents.filter(event => !event.properties.nearby && isAftershock(event, mainForMap)).length : 0,
    [mapEvents, mainForMap],
  );
  const replayScope = selectedPlace?.name ?? provinceName;
  // Con una provincia elegida, la tarjeta muestra el último sismo de esa provincia y no el último de todo el país.
  // Hay algún filtro puesto (magnitud, período, provincia, ciudad o «solo réplicas»): el 3D enseña entonces lo que deja pasar.
  // Cada vez que cambia, el mapa (plano o 3D) vuelve a encuadrar los sismos que deja pasar el filtro.
  const [fitKey, setFitKey] = useState(0);
  // Sube cuando se pide ver las fallas activas en el mapa (desde su ficha).
  const [faultsKey, setFaultsKey] = useState(0);
  // Ficha completa del sismo que se tocó (en el mapa o en la lista) y petición de «ver cómo se propagó».
  const [sheet, setSheet] = useState<{ id: string; from: "list" | "map" } | null>(null);
  const [propagation, setPropagation] = useState<{ event: Earthquake; key: number } | null>(null);
  // Formulario «¿Lo sentiste?» abierto para este sismo.
  const [reportFor, setReportFor] = useState<Earthquake | null>(null);
  // En la pantalla completa del navegador solo se ve el marco del mapa y lo que esté dentro: la ficha se monta ahí.
  const [fullscreenHost, setFullscreenHost] = useState<Element | null>(null);
  useEffect(() => {
    const update = () => setFullscreenHost(document.fullscreenElement);
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);
  const filtersKey = minimum > 0 || timeRange !== "all" || province !== "all" || city !== "all" || onlyAftershocks || includeNearby ? [minimum, timeRange, province, city, onlyAftershocks, includeNearby].join("|") : "";
  const sheetEvent = sheet ? shownEvents.find(event => event.id === sheet.id) ?? null : null;
  const featured = mapEvents.find(event => event.id === selectedId) ?? (province === "all" ? newest ?? latest : latest);
  // El panel de accesibilidad lee en voz alta el último sismo registrado.
  useEffect(() => { setLatestQuake(newest); }, [newest]);
  const hero = newest ?? main;
  const mainUrl = reportUrl(main);

  const share = async (target: Earthquake | null) => {
    if (!target) return;
    const data = {
      title: `Sismo M ${magText(target)} en Panamá`,
      text: `Sismo de magnitud ${magText(target)} en ${placeText(target)}. Información en vivo y qué hacer:`,
      url: window.location.href.split("#")[0],
    };
    try {
      if (navigator.share) {
        await navigator.share(data);
        return;
      }
      await navigator.clipboard.writeText(data.url);
      setShared(true);
      window.setTimeout(() => setShared(false), 2500);
    } catch {
      // Compartir cancelado o sin permiso para copiar: no hay nada que corregir.
    }
  };
  const asideRef = useRef<HTMLDivElement>(null);
  const chooseEvent = (event: Earthquake) => {
    if (event.properties.nearby && !includeNearby) {
      setIncludeNearby(true);
    }
    // Si algún filtro (provincia, magnitud, período, solo réplicas) deja fuera ese sismo, el mapa no tiene su marcador y
    // "Ver en el mapa" no haría nada: se quitan los filtros para poder llevarte a él.
    if (!mapEvents.some(item => item.id === event.id)) {
      setProvince("all");
      setCity("all");
      setMinimum(0);
      setTimeRange("all");
      setOnlyAftershocks(false);
    }
    setSheet(null);
    setSelectedId(event.id);
    setFocus({ id: event.id });
    asideRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    document.getElementById("mapa")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="app-shell">

      {alert && alert.key !== dismissedKey && (
        <div className="live-toast" role="alert">
          <span className="live-toast-icon" aria-hidden="true">🚨</span>
          <div className="live-toast-content">
            <div className="live-toast-head">
              <strong>{alert.quiet ? "Sismo reciente en Panamá" : "¡ALERTA SÍSMICA EN PANAMÁ!"}</strong>
              <span className="live-toast-badge">M {magText(alert.event)}</span>
            </div>
            <div className="live-toast-desc">
              {placeText(alert.event)} · {clockFormat.format(new Date(alert.event.properties.time))}
              {alert.quiet && ` · hace ${agoText(Math.round((alert.key - alert.event.properties.time) / 60_000))}`}
              {alert.event.properties.tsunami === 1 && " · Riesgo potencial de tsunami (tsunami.gov)"}
            </div>
            <div className="live-toast-where"><span aria-hidden="true">📍</span> {whereText(alert.event)}</div>
          </div>
          <div className="live-toast-actions">
            <button
              type="button"
              onClick={() => {
                chooseEvent(alert.event);
                stopAlarmSound();
                setDismissedKey(alert.key);
              }}
            >
              <span aria-hidden="true">🗺️</span> Ver en el mapa
            </button>
            <a
              href={getWhatsAppShareUrl(alert.event, typeof window !== "undefined" ? window.location.href : "")}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-toast-wa"
            >
              <span aria-hidden="true">📲</span> Mandar a todos por WhatsApp
            </a>
            {!alert.quiet && (
              <button
                type="button"
                className="btn-toast-mute"
                onClick={() => stopAlarmSound()}
                title="Silenciar sonido de alarma"
              >
                <span aria-hidden="true">🔇</span> Silenciar
              </button>
            )}
          </div>
          <button
            type="button"
            className="toast-close"
            aria-label="Cerrar aviso"
            onClick={() => {
              stopAlarmSound();
              setDismissedKey(alert.key);
            }}
          >
            ×
          </button>
        </div>
      )}

      <header className="site-header">
        <div className="site-header-bar">
          <a className="site-brand" href="#inicio" aria-label="Ojo Panamá, inicio">
            <span className="brand-mark" aria-hidden="true"><OjoMark /></span>
            <span>Ojo Panamá</span>
          </a>
          <div className="site-header-tools">
            <span className="site-clock">Hora de Panamá: {clock}</span>
            <span className="site-install"><PwaInstall /></span>
            <ThemeToggle />
            <button
              type="button"
              className={`alerts-button${pushActive ? " on" : ""}`}
              onClick={() => setAlertModalOpen(true)}
            >
              {pushActive ? <BellRing aria-hidden="true" size={20} /> : <Bell aria-hidden="true" size={20} />}
              <span className="alerts-button-long">{pushActive ? "Alertas activadas" : permStatus === "granted" ? "Completar alertas" : "Recibir alertas"}</span>
              <span className="alerts-button-short">Alertas</span>
            </button>
          </div>
        </div>
        <nav className="site-nav" aria-label="Secciones de la página">
          {NAV.map(([id, Icon, label]) => (
            <a key={id} href={`#${id}`} className={`${section === id ? "active" : ""}${id === "fuentes" ? " nav-fuentes" : ""}`} aria-current={section === id ? "location" : undefined}
              onClick={() => { navLock.current = performance.now() + 900; setSection(id); }}>
              <Icon aria-hidden="true" size={22} /><span>{label}</span>
            </a>
          ))}
          {/* En celular y tablet las otras páginas no caben en la barra: van en el panel «Más» (en lugar de «Fuentes»). */}
          <button type="button" className="nav-more" onClick={() => setMoreOpen(true)} aria-haspopup="dialog" aria-expanded={moreOpen}>
            <LayoutGrid aria-hidden="true" size={22} /><span>Más</span>
          </button>
          <span className="site-nav-pages">
            <a href="/reportes">Reportes</a>
            <a href="/analisis">Gráficos</a>
            <a href="/noticias">Noticias</a>
            <a href="/historia">Historia</a>
          </span>
        </nav>
      </header>

      <main id="inicio" className="main-content">
        <div className="content-wrap">
          <InAppBrowserNotice />
          <InstallCard />
          <StatusNow
            fallback={latestFallback}
            latest={hero}
            main={main}
            mainshock={mainshock}
            status={status}
            lastUpdate={lastUpdate}
            catalogs={catalogs}
            shared={shared}
            onShowOnMap={chooseEvent}
            onShare={share}
            onRefresh={() => { setRefreshKey(key => key + 1); setSlowKey(key => key + 1); }}
            onReport={setReportFor}
          />

          <section id="mapa" className="map-section" aria-labelledby="map-title">
            <div className="section-heading"><div><h2 id="map-title">Mapa de actividad</h2></div><div className="filters" aria-label="Filtros de eventos"><label className="magnitude-filter">Magnitud <select aria-label="Magnitud mínima" value={minimum} onChange={event => { setMinimum(Number(event.target.value)); setSelectedId(null); setFocus(null); }}><option value="0">Todas</option><option value="3">M 3.0+ Sentidos</option><option value="3.5">M 3.5+</option><option value="4">M 4.0+</option><option value="5">M 5.0+ Fuertes</option><option value="6">M 6.0+</option><option value="7">M 7.0+</option></select></label><label className="magnitude-filter">Período <select aria-label="Filtrar por tiempo" value={timeRange} onChange={event => { setTimeRange(event.target.value as "all" | "24h" | "6h"); setSelectedId(null); setFocus(null); }}><option value="all">Todo el evento</option><option value="24h">Últimas 24 h</option><option value="6h">Últimas 6 h</option></select></label><label className="magnitude-filter">Provincia <select aria-label="Filtrar por provincia o comarca" value={province} onChange={event => { setProvince(event.target.value); setCity("all"); setSelectedId(null); setFocus(null); }}><option value="all">Todas</option><optgroup label="Provincias">{PROVINCES.filter(item => item.kind === "provincia").map(item => <option key={item.id} value={item.id}>{item.name} · {provinceCounts.get(item.id) ?? 0}</option>)}</optgroup><optgroup label="Comarcas indígenas">{PROVINCES.filter(item => item.kind === "comarca").map(item => <option key={item.id} value={item.id}>{item.name} · {provinceCounts.get(item.id) ?? 0}</option>)}</optgroup>{(provinceCounts.get(FAR_OFFSHORE) ?? 0) > 0 && <option value={FAR_OFFSHORE}>Mar adentro · {provinceCounts.get(FAR_OFFSHORE)}</option>}{includeNearby && outsideCount > 0 && <option value={OUTSIDE}>Fuera de Panamá · {outsideCount}</option>}</select></label><label className="magnitude-filter">Ciudad <select aria-label="Filtrar por ciudad o localidad" value={city} onChange={event => { setCity(event.target.value); setSelectedId(null); setFocus(null); }}><option value="all">Todas</option>{cityGroups.map(group => <optgroup key={group.code} label={province === "all" ? `${PROVINCE_BY_ID.get(group.province)?.name ?? ""} · ${group.name}` : group.name}>{group.options.length > 1 && <option value={`d:${group.code}`}>Todo {group.name} · {group.total}</option>}{group.options.map(({ place, count }) => <option key={place.id} value={place.id}>{place.name} · {count}</option>)}</optgroup>)}</select></label>{main && <label className="aftershock-toggle"><input type="checkbox" checked={onlyAftershocks} onChange={event => { setOnlyAftershocks(event.target.checked); setSelectedId(null); setFocus(null); }} /> Solo réplicas</label>}<label className="aftershock-toggle" title="Suma los sismos de Costa Rica, Colombia y el mar abierto cercano. No cuentan como réplicas ni generan alertas."><input type="checkbox" checked={includeNearby} onChange={event => { setIncludeNearby(event.target.checked); setSelectedId(null); setFocus(null); }} /> Incluir alrededores</label>{main && (replay === null
              ? <button type="button" className="replay-button" onClick={startReplay} disabled={replayCount < 2} title={replayCount < 2 ? "Con estos filtros hay menos de 2 sismos para reproducir" : undefined}>▶ Reproducir secuencia · {replayCount}</button>
              : <div className="replay-pair"><button type="button" className="replay-button stop" onClick={stopReplay}>■ Parar</button><button type="button" className="replay-button" onClick={startReplay}>↻ Reiniciar</button></div>)}{filtersKey !== "" && mapEvents.length > 0 && <button type="button" className="replay-button" onClick={() => setFitKey(key => key + 1)} title="Acerca el mapa a los sismos que deja pasar el filtro">⌖ Ver {mapEvents.length === 1 ? "el sismo" : `los ${mapEvents.length} sismos`} en el mapa{nearbyOnMap > 0 ? ` (${nearbyOnMap} de alrededores)` : ""}</button>}</div></div>
            <a
              className="skip-link"
              href="#eventos"
              onClick={event => {
                event.preventDefault();
                document.getElementById("events-title")?.focus({ preventScroll: true });
                document.getElementById("eventos")?.scrollIntoView({ behavior: "auto", block: "start" });
              }}
            >
              Saltar el mapa e ir a la lista de sismos
            </a>
            <div className="map-card">
              <div className="map-frame"><QuakeMap events={mapEvents} aftershockToggle={mainForMap && !filtersReveal && replayKey === 0 && hiddenAftershocks > 0 ? { shown: showAftershocks, count: hiddenAftershocks, onToggle: () => setShowAftershocks(value => !value) } : null} filtersKey={filtersKey} fitKey={fitKey} propagation={propagation} onPropagationEnd={() => setPropagation(null)} mainshock={main} focus={focus} alert={alert} replayKey={replayKey} region={province === "all" || province === FAR_OFFSHORE ? null : province} place={selectedPlace} selectedId={selectedId} replay={replay} onSelect={id => { setSelectedId(id); setFocus({ id, quiet: true }); asideRef.current?.scrollTo({ top: 0, behavior: "smooth" }); if (fullscreenHost || document.querySelector(".map-frame .map-overlay-flag")) setSheet({ id, from: "map" }); }} onReplay={setReplay} faultsKey={faultsKey} /><div className="map-label"><span className="mini-dot" /> PANAMÁ</div>{replay && <div className="replay-hud" role="status"><span className="replay-live" aria-hidden="true" /><strong>Reproduciendo{replayScope ? ` · ${replayScope}` : ""}</strong><span>{replay.index} de {replay.total}</span>{replay.index > 0 && <span>M {replay.mag === null ? "—" : replay.mag.toFixed(1)} · {clockFormat.format(new Date(replay.time))}</span>}<span className="replay-actions"><button type="button" className="stop" onClick={stopReplay}>■ Parar</button><button type="button" onClick={startReplay}>↻ Reiniciar</button></span><i style={{ width: `${(replay.index / replay.total) * 100}%` }} /></div>}<div className="map-legend"><span>Magnitud</span><div><i className="legend-circle small" /> Menor a 3</div><div><i className="legend-circle medium" /> 3 a 4.9</div><div><i className="legend-circle large" /> 5 o más</div><div><i className="legend-circle latest" /> {main ? "Última réplica" : "Último sismo"}</div>{main && <div><i className="legend-circle main" /> Sismo principal</div>}</div></div>
              <div className="map-aside" ref={asideRef} aria-live="polite">
                {featured ? (
                  <QuakeDetails
                    event={featured}
                    mainshock={main}
                    headingId="aside-quake-title"
                    onPropagate={() => {
                      setPropagation({ event: featured, key: Date.now() });
                      document.getElementById("mapa")?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                    onShowOnMap={() => setFocus({ id: featured.id })}
                    onReport={featured.properties.nearby ? undefined : () => setReportFor(featured)}
                  />
                ) : (
                  <>
                    <div className="aside-top"><span>Sismo seleccionado</span></div>
                    <div className="featured-magnitude">—</div>
                    <div className="featured-place">{status === "loading" ? (main ? "Buscando la última réplica registrada…" : "Buscando el último sismo registrado…") : "No hay eventos para los filtros seleccionados."}</div>
                  </>
                )}
              </div>
            </div>
            <p className="map-caption">Los círculos representan eventos reportados, según su ubicación y magnitud. Selecciona uno para ver más información. Límites provinciales: © colaboradores de OpenStreetMap (ODbL), vía geoBoundaries. Localidades: GeoNames (CC BY 4.0).</p>
            {main && <MainshockUsgs />}
            {main && <PlatesExplainer main={main} />}
            <FaultsExplainer main={main} onShow={() => { setFaultsKey(key => key + 1); document.getElementById("mapa")?.scrollIntoView({ behavior: "smooth", block: "start" }); }} />
            {main && sequenceAftershocks.length > 0 && (
              <div className="sequence-card">
                <h3>El sismo principal y sus réplicas{(provinceName || selectedPlace) && <span className="seq-scope"> · {[provinceName, selectedPlace?.name].filter(Boolean).join(" · ")}</span>}</h3>
                <SequenceChart mainshock={main} aftershocks={sequenceAftershocks} selectedId={selectedId} replay={replay} onSelect={chooseEvent} />
              </div>
            )}
          </section>

          <div className="lower-grid">
            <section id="eventos" className="events-card" aria-labelledby="events-title"><div className="card-heading"><div><h2 id="events-title" tabIndex={-1}>Sismos registrados</h2></div><div className="events-tools"><div className="segmented" role="group" aria-label="Ordenar eventos">{([["recent", "Recientes"], ["magnitude", "Mayor magnitud"]] as const).map(([value, label]) => <button key={value} type="button" className={sort === value ? "selected" : ""} aria-pressed={sort === value} onClick={() => { setSort(value); setRowLimit(ROW_PAGE); }}>{label}</button>)}</div><span className="results-count">{listCounts ? `${listCounts.after} ${listCounts.after === 1 ? "réplica" : "réplicas"}${listCounts.hasMain ? " + 1 sismo principal" : ""}${listCounts.before ? ` + ${listCounts.before} ${listCounts.before === 1 ? "sismo anterior" : "sismos anteriores"}` : ""}${listCounts.outside ? ` + ${listCounts.outside} de los alrededores` : ""}` : `${events.length} ${events.length === 1 ? "evento" : "eventos"}`}</span></div></div><div className="events-list" aria-live="polite">{events.length ? <>{listEvents.slice(0, rowLimit).map((event, index) => <button key={event.id} type="button" className={`event-row${selectedId === event.id ? " selected" : ""}`} style={{ "--i": index } as CSSProperties} onClick={() => chooseEvent(event)}><span className={`magnitude-badge${(event.properties.mag ?? 0) >= 5 ? " high" : (event.properties.mag ?? 0) < 3 ? " low" : ""}`}>{magText(event)}</span><span className="event-text"><strong>{placeTitle(event)}</strong><small>{provinceLabel(event)} · {placeLabel(event)} · {depthText(event)} de profundidad{main && !event.properties.nearby && isAftershock(event, main) && <em className="replica-tag">Réplica</em>}{event.properties.nearby && <em className="source-tag" title="Sismo de los alrededores: no cuenta como réplica">Fuera de Panamá</em>}{main && event.id === main.id && <em className="main-tag">Sismo Principal M 7.7</em>}{isUnconfirmed(event) ? <em className="unconfirmed-tag" title={`Solo lo publica el EMSC: el IGC y el USGS no lo registran.${awaitsConfirmation(event) ? " No se avisa por alerta hasta que alguno lo confirme." : ""}`}>Sin confirmar · solo EMSC</em> : event.properties.source && event.properties.source !== "usgs" && <em className="source-tag" title="Aún sin reporte del USGS">{SOURCE_NAMES[event.properties.source]}</em>}</small></span><span className="event-time"><strong>{clockFormat.format(new Date(event.properties.time))}</strong><small>{date.format(new Date(event.properties.time))}</small></span></button>)}{listEvents.length > rowLimit && <button type="button" className="replay-button events-more" onClick={() => setRowLimit(limit => limit + ROW_PAGE * 2)}>Mostrar más sismos · quedan {listEvents.length - rowLimit}</button>}</> : status === "loading" ? <div className="event-skeletons" role="status" aria-label="Consultando eventos sísmicos">{[0, 1, 2, 3, 4].map(i => <div key={i} className="event-skeleton" style={{ animationDelay: `${i * 90}ms` }}><i /><span /><em /></div>)}</div> : <div className="empty-state">{status === "error" ? <><span>Los datos no están disponibles en este momento. Inténtalo de nuevo más tarde.</span><button type="button" className="replay-button" style={{ marginTop: 12 }} onClick={() => setRefreshKey(k => k + 1)}>Reintentar consulta</button></> : <><span>No hay sismos reportados para este período y magnitud. Prueba otro filtro.</span><button type="button" className="replay-button" style={{ marginTop: 12 }} onClick={() => { setProvince("all"); setCity("all"); setMinimum(0); setTimeRange("all"); setOnlyAftershocks(false); }}>Restablecer filtros</button></>}</div>}</div></section>
          </div>
          <section id="recomendaciones" className="guide-section" aria-labelledby="guide-title">
            <div className="section-heading"><div><h2 id="guide-title">Guía de seguridad rápida</h2></div></div>
            <div className="guide-grid">
              <SafetyGuide aftershockCount={mainshock?.aftershocks.count ?? null} strongestAftershock={mainshock?.aftershocks.strongest ? magText(mainshock.aftershocks.strongest) : null} />
              <div className="guide-side">
                <div className="emergency-card">
                  <h3>Emergencias</h3>
                  <a className="emergency-call" href="tel:911"><Phone aria-hidden="true" size={22} /> Llamar al 911</a>
                  <p>Llama solo por peligro para la vida o personas atrapadas. Para avisar a tu familia, usa mensajes de texto: dejan las líneas libres.</p>
                  <div className="emergency-links">
                    <a href="https://www.sinaproc.gob.pa/" target="_blank" rel="noopener noreferrer">SINAPROC <ExternalLink aria-hidden="true" size={15} /></a>
                    <a href="https://www.tsunami.gov/" target="_blank" rel="noopener noreferrer">Avisos de tsunami <ExternalLink aria-hidden="true" size={15} /></a>
                    {main && <a href={mainUrl} target="_blank" rel="noopener noreferrer">Informe del USGS <ExternalLink aria-hidden="true" size={15} /></a>}
                  </div>
                </div>
                <Checklists />
              </div>
            </div>
          </section>

          <section id="fuentes" className="guide-section" aria-labelledby="sources-title">
            <div className="section-heading"><div><h2 id="sources-title">De dónde salen los datos</h2></div></div>
            <Sources />
          </section>

          <footer>
            <span>
              © {new Date().getFullYear()} Ojo Panamá · Creado por{" "}
              <a href="https://www.instagram.com/humbertiex_" target="_blank" rel="noopener noreferrer">humbertiex</a>
            </span>
            <span><a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer me">Instagram @ojopanama507</a></span>
            <span>Datos: <a href="https://sismosgeociencias.up.ac.pa/" target="_blank" rel="noopener noreferrer">Instituto de Geociencias (IGC - UP)</a>, contrastado con <a href="https://earthquake.usgs.gov/fdsnws/event/1/" target="_blank" rel="noopener noreferrer">USGS</a>, <a href="https://www.emsc-csem.org/" target="_blank" rel="noopener noreferrer">EMSC</a> y <a href="https://geofon.gfz.de/" target="_blank" rel="noopener noreferrer">GFZ GEOFON</a> · No sustituye avisos oficiales de SINAPROC ni predice sismos.</span>
            <span><Link href="/sismos" prefetch={false}>Sismos por provincia</Link></span>
            <span><a href="/resumen">Resumen en texto sencillo</a></span>
            <span><a href="/acerca">Acerca de Ojo Panamá</a></span>
            <span><a href="/privacidad">Privacidad</a></span>
          </footer>
        </div>
      </main>

      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
      <AlertModal
        isOpen={alertModalOpen}
        onClose={() => {
          setAlertModalOpen(false);
          window.dispatchEvent(new Event(PUSH_CHANGE_EVENT));
        }}
        latestEvent={latest ?? main}
      />
      {sheetEvent && (() => {
        const sheetNode = (
        <QuakeSheet
          event={sheetEvent}
          mainshock={main}
          onClose={() => setSheet(null)}
          onPropagate={() => {
            setPropagation({ event: sheetEvent, key: Date.now() });
            setSheet(null);
            document.getElementById("mapa")?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
          onShowOnMap={sheet?.from === "list" ? () => { setSheet(null); chooseEvent(sheetEvent); } : undefined}
          onReport={sheetEvent.properties.nearby ? undefined : () => { setSheet(null); setReportFor(sheetEvent); }}
        />
        );
        return fullscreenHost ? createPortal(sheetNode, fullscreenHost) : sheetNode;
      })()}
      {reportFor && (fullscreenHost
        ? createPortal(<FeltReport event={reportFor} onClose={() => setReportFor(null)} />, fullscreenHost)
        : <FeltReport event={reportFor} onClose={() => setReportFor(null)} />)}
    </div>
  );
}
