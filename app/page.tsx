"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import QuakeMap from "./quake-map";
import SafetyGuide from "./safety-guide";
import Checklists from "./checklists";
import { isAftershock, type Earthquake, type EarthquakeResponse, type MainshockResponse } from "../lib/earthquakes";

const date = new Intl.DateTimeFormat("es-PA", {
  timeZone: "America/Panama", day: "numeric", month: "short", year: "numeric",
});
const dateTime = new Intl.DateTimeFormat("es-PA", {
  timeZone: "America/Panama", day: "numeric", month: "short", year: "numeric",
  hour: "2-digit", minute: "2-digit", hour12: true,
});
const clockFormat = new Intl.DateTimeFormat("es-PA", {
  timeZone: "America/Panama", hour: "2-digit", minute: "2-digit", hour12: true,
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
const PAGER: Record<string, string> = { green: "Verde", yellow: "Amarilla", orange: "Naranja", red: "Roja" };
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
const INTENSITY = ["No sentido", "Débil", "Débil", "Ligera", "Moderada", "Fuerte", "Muy fuerte", "Severa", "Violenta"];
function intensityText(mmi: number) {
  const level = Math.min(12, Math.max(1, Math.round(mmi)));
  return `${ROMAN[level - 1]} · ${INTENSITY[level - 1] ?? "Extrema"}`;
}
function elapsed(time: number) {
  const minutes = Math.max(0, Math.floor((Date.now() - time) / 60_000));
  if (minutes < 1) return ["Ahora", "mismo instante"];
  if (minutes < 60) return [String(minutes), minutes === 1 ? "minuto" : "minutos"];
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return [String(hours), hours === 1 ? "hora" : "horas"];
  const days = Math.floor(hours / 24);
  return [String(days), days === 1 ? "día" : "días"];
}

export default function Home() {
  const [days, setDays] = useState(30);
  const [minimum, setMinimum] = useState(0);
  const [allEvents, setAllEvents] = useState<Earthquake[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [clock, setClock] = useState<string>("--:--");
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ id: string } | null>(null);
  const [mainshock, setMainshock] = useState<MainshockResponse | null>(null);
  const [onlyAftershocks, setOnlyAftershocks] = useState(false);
  const [sort, setSort] = useState<"recent" | "magnitude">("recent");
  const [shared, setShared] = useState(false);
  const introFocused = useRef(false);

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
        const response = await fetch(`/api/earthquakes?days=${days}`, {
          signal: controller.signal, cache: "no-store",
        });
        if (!response.ok) throw new Error(`Error ${response.status}`);
        const data: EarthquakeResponse = await response.json();
        if (!Array.isArray(data.features)) throw new Error("Respuesta no válida");
        setAllEvents(data.features);
        setLastUpdate(data.fetchedAt);
        setStatus("ready");
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("No se pudo cargar el catálogo sísmico:", error);
        setStatus("error");
      } finally {
        window.clearTimeout(timeout);
      }
    };
    load();
    return () => controller.abort();
  }, [days, refreshKey]);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch("/api/earthquakes/mainshock", {
          signal: controller.signal, cache: "no-store",
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
  }, [refreshKey]);

  // Enfoque inicial en el epicentro, una vez que el listado también cargó: si los marcadores
  // se reconstruyen a mitad del movimiento del mapa, el desplazamiento no termina.
  useEffect(() => {
    if (!mainshock || status === "loading" || introFocused.current) return;
    introFocused.current = true;
    setSelectedId(mainshock.mainshock.id);
    setFocus({ id: mainshock.mainshock.id });
  }, [mainshock, status]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!document.hidden) setRefreshKey(key => key + 1);
    }, 300_000);
    return () => window.clearInterval(timer);
  }, []);

  const main = mainshock?.mainshock ?? null;
  const events = useMemo(
    () => allEvents.filter(event =>
      (event.properties.mag === null ? minimum === 0 : event.properties.mag >= minimum) &&
      (!onlyAftershocks || !main || isAftershock(event, main))),
    [allEvents, minimum, onlyAftershocks, main],
  );
  const listEvents = useMemo(
    () => sort === "magnitude" ? [...events].sort((a, b) => (b.properties.mag ?? -10) - (a.properties.mag ?? -10)) : events,
    [events, sort],
  );
  const strongest = useMemo(
    () => events.reduce<Earthquake | null>((best, event) =>
      !best || (event.properties.mag ?? -10) > (best.properties.mag ?? -10) ? event : best, null),
    [events],
  );
  const latest = events[0] ?? null;
  const mapEvents = useMemo(
    () => main && !events.some(event => event.id === main.id) ? [main, ...events] : events,
    [events, main],
  );
  const featured = mapEvents.find(event => event.id === selectedId) ?? latest;
  const [recentValue, recentUnit] = latest ? elapsed(latest.properties.time) : ["—", ""];
  const [mainValue, mainUnit] = main ? elapsed(main.properties.time) : ["—", ""];
  const mainMmi = main?.properties.mmi;
  const mainFelt = main?.properties.felt;
  const mainAlert = main?.properties.alert;
  const mainUrl = main?.properties.url?.startsWith("https://earthquake.usgs.gov/") ? main.properties.url : "https://earthquake.usgs.gov/earthquakes/map/";
  const tellUsUrl = mainUrl.includes("/eventpage/") ? `${mainUrl}/tellus` : null;

  const chooseDays = (value: number) => {
    if (value === days) return;
    setDays(value);
    setSelectedId(null);
    setFocus(null);
  };
  const share = async () => {
    if (!main) return;
    const data = {
      title: `Sismo M ${magText(main)} en Panamá`,
      text: `Sismo de magnitud ${magText(main)} en Panamá. Información en vivo y qué hacer:`,
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
  const chooseEvent = (event: Earthquake) => {
    setSelectedId(event.id);
    setFocus({ id: event.id });
    document.getElementById("mapa")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Navegación principal">
        <a className="brand" href="#inicio" aria-label="Sismo Panamá, inicio">
          <span className="brand-mark" aria-hidden="true"><svg viewBox="0 0 40 40" fill="none"><path d="M4 21h7l4-9 6 17 4-10h11" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
          <span><strong>SISMO</strong><small>PANAMÁ</small></span>
        </a>
        <div className="side-label">EXPLORAR</div>
        <nav className="side-nav">
          <a className="active" href="#inicio"><span className="nav-icon">◫</span> Panel general</a>
          <a href="#mapa"><span className="nav-icon">◎</span> Mapa sísmico</a>
          <a href="#eventos"><span className="nav-icon">≡</span> Últimos eventos</a>
          <a href="#recomendaciones"><span className="nav-icon">✚</span> Qué hacer ahora</a>
          <a href="#preparacion"><span className="nav-icon">✳</span> Preparación</a>
        </nav>
        <div className="side-bottom">
          <div className="source-indicator"><span className="pulse-dot" /><span>DATOS DEL USGS</span></div>
          <p>Información sísmica para Panamá y la región cercana.</p>
          <a href="https://earthquake.usgs.gov/fdsnws/event/1/" target="_blank" rel="noopener noreferrer">Conocer la fuente <span aria-hidden="true">↗</span></a>
        </div>
      </aside>

      <main id="inicio" className="main-content">
        <header className="topbar">
          <div className="breadcrumb">INICIO <span>/</span> PANEL GENERAL</div>
          <div className="topbar-right"><span className="local-time">Hora de Panamá · {clock}</span><span className="live-pill"><i /> MONITOREO ACTIVO</span></div>
        </header>

        <div className="content-wrap">
          <section className="page-intro" aria-labelledby="page-title">
            <div>
              <div className="eyebrow"><span className="eyebrow-line" /> OBSERVATORIO SÍSMICO</div>
              <h1 id="page-title">Sismo en Panamá:<br /><em>lo que necesitas saber.</em></h1>
              <p>Explora la actividad sísmica reciente en Panamá y sus alrededores. Información clara para estar al tanto, cuando más importa.</p>
            </div>
            <button className={`refresh-button${status === "loading" ? " loading" : ""}`} type="button" aria-label="Actualizar datos de sismos" disabled={status === "loading"} onClick={() => setRefreshKey(key => key + 1)}>
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 6.7M20 4v7h-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              Actualizar datos
            </button>
          </section>

          {main && mainshock && (
            <section className="mainshock" aria-labelledby="mainshock-title">
              <div className="mainshock-head">
                <div className="mainshock-mag"><strong>{magText(main)}</strong><span>MAGNITUD</span></div>
                <div className="mainshock-title">
                  <span className="mainshock-kicker"><i /> SISMO PRINCIPAL · {mainValue === "Ahora" ? "AHORA MISMO" : `HACE ${mainValue} ${mainUnit}`.toUpperCase()}</span>
                  <h2 id="mainshock-title">{placeText(main)}</h2>
                  <p>{dateTime.format(new Date(main.properties.time))} · hora de Panamá</p>
                </div>
                <div className="mainshock-actions">
                  <a className="primary" href="#recomendaciones">Qué hacer ahora</a>
                  <button type="button" onClick={() => chooseEvent(main)}>Ver en el mapa</button>
                  <button type="button" onClick={share} aria-live="polite">{shared ? "Enlace copiado" : "Compartir"}</button>
                  <a className="wide" href={mainUrl} target="_blank" rel="noopener noreferrer">Reporte del USGS <span aria-hidden="true">↗</span></a>
                </div>
              </div>
              <dl className="mainshock-stats">
                <div><dt>PROFUNDIDAD</dt><dd>{depthText(main)}</dd></div>
                {mainAlert && PAGER[mainAlert] && <div><dt>ALERTA PAGER</dt><dd><span className={`pager ${mainAlert}`}>{PAGER[mainAlert]}</span></dd><small>impacto estimado (USGS)</small></div>}
                {typeof mainMmi === "number" && <div><dt>INTENSIDAD MÁX.</dt><dd>{intensityText(mainMmi)}</dd><small>estimada por el USGS</small></div>}
                {typeof mainFelt === "number" && <div><dt>LO SINTIERON</dt><dd>{mainFelt.toLocaleString("es-PA")}</dd><small>reportes al USGS{tellUsUrl && <> · <a href={tellUsUrl} target="_blank" rel="noopener noreferrer">¿Lo sentiste?</a></>}</small></div>}
                <div><dt>RÉPLICAS</dt><dd>{mainshock.aftershocks.count.toLocaleString("es-PA")}</dd><small>{mainshock.aftershocks.strongest ? `la mayor, M ${magText(mainshock.aftershocks.strongest)}` : "hasta ahora"}</small></div>
              </dl>
              {main.properties.tsunami === 1 && <p className="mainshock-warning" role="alert">El USGS marcó este evento como posible generador de tsunami. Consulta los avisos oficiales en tsunami.gov y las indicaciones de SINAPROC.</p>}
              <p className="mainshock-note">Cifras del USGS: se actualizan y pueden cambiar a medida que se revisan. No reemplazan los avisos oficiales de SINAPROC.</p>
            </section>
          )}

          <div className={`status-strip${status === "error" ? " error" : ""}`} role="status" aria-live="polite">
            <div className="status-left"><span className="status-spark" /><strong>{status === "loading" ? "Consultando sismos recientes…" : status === "error" ? "No se pudo consultar el catálogo" : "Datos sísmicos actualizados"}</strong><span>{status === "loading" ? "Fuente: USGS Earthquake Catalog" : status === "error" ? "Revisa tu conexión e intenta actualizar de nuevo." : `${allEvents.length} ${allEvents.length === 1 ? "evento reportado" : "eventos reportados"} en la región consultada`}</span></div>
            <span>{lastUpdate ? `Última consulta: ${clockFormat.format(new Date(lastUpdate))}` : "Última consulta: --"}</span>
          </div>

          <section className="metric-grid" aria-label="Resumen de actividad sísmica">
            <article className="metric-card"><div className="metric-top"><span>EVENTOS REGISTRADOS</span><span className="metric-icon">◎</span></div><div className="metric-main"><strong>{status === "error" && !lastUpdate ? "—" : events.length.toLocaleString("es-PA")}</strong><span>en el período</span></div><p>{days === 1 ? "Últimas 24 horas" : `Últimos ${days} días`} · Panamá y alrededores</p></article>
            <article className="metric-card"><div className="metric-top"><span>MAYOR MAGNITUD</span><span className="metric-icon coral">⌁</span></div><div className="metric-main"><strong>{strongest ? magText(strongest) : "—"}</strong><span>magnitud</span></div><p>{strongest ? placeText(strongest) : "Sin eventos disponibles"}</p></article>
            <article className="metric-card"><div className="metric-top"><span>EVENTO MÁS RECIENTE</span><span className="metric-icon blue">◷</span></div><div className="metric-main"><strong>{recentValue}</strong><span>{recentUnit}</span></div><p>{latest ? dateTime.format(new Date(latest.properties.time)) : "Hora local de Panamá (UTC−5)"}</p></article>
          </section>

          <section id="mapa" className="map-section" aria-labelledby="map-title">
            <div className="section-heading"><div><span className="section-kicker">VISTA GEOGRÁFICA</span><h2 id="map-title">Mapa de actividad</h2></div><div className="filters" aria-label="Filtros de eventos"><div className="segmented" role="group" aria-label="Período">{[[1, "24 horas"], [7, "7 días"], [30, "30 días"]].map(([value, label]) => <button key={value} type="button" className={days === value ? "selected" : ""} aria-pressed={days === value} onClick={() => chooseDays(Number(value))}>{label}</button>)}</div><label className="magnitude-filter">Magnitud <select aria-label="Magnitud mínima" value={minimum} onChange={event => { setMinimum(Number(event.target.value)); setSelectedId(null); setFocus(null); }}><option value="0">Todas</option><option value="2.5">M 2.5+</option><option value="4.5">M 4.5+</option></select></label>{main && <label className="aftershock-toggle"><input type="checkbox" checked={onlyAftershocks} onChange={event => { setOnlyAftershocks(event.target.checked); setSelectedId(null); setFocus(null); }} /> Solo réplicas</label>}</div></div>
            <div className="map-card">
              <div className="map-frame"><QuakeMap events={mapEvents} mainshock={main} focus={focus} onSelect={setSelectedId} /><div className="map-label"><span className="mini-dot" /> PANAMÁ Y ALREDEDORES</div><div className="map-legend"><span>MAGNITUD</span><div><i className="legend-circle small" /> Menor a 3</div><div><i className="legend-circle medium" /> 3 a 4.9</div><div><i className="legend-circle large" /> 5 o más</div>{main && <><div><i className="legend-circle main" /> Sismo principal</div><div><i className="legend-circle after" /> Réplica</div></>}</div></div>
              <div className="map-aside"><div className="aside-top"><span>EN FOCO</span><span className="aside-icon">↗</span></div><div className="featured-magnitude">{featured ? magText(featured) : "—"}</div><div className="featured-place">{featured ? placeText(featured) : status === "loading" ? "Buscando el último sismo registrado…" : "No hay eventos para los filtros seleccionados."}</div><div className="featured-details"><div><span>FECHA Y HORA</span><strong>{featured ? dateTime.format(new Date(featured.properties.time)) : "—"}</strong></div><div><span>PROFUNDIDAD</span><strong>{featured ? depthText(featured) : "—"}</strong></div></div><a className="featured-link" href={featured?.properties.url?.startsWith("https://earthquake.usgs.gov/") ? featured.properties.url : "https://earthquake.usgs.gov/earthquakes/map/"} target="_blank" rel="noopener noreferrer">Ver en USGS <span aria-hidden="true">↗</span></a></div>
            </div>
            <p className="map-caption">Los círculos representan eventos reportados, según su ubicación y magnitud. Selecciona uno para ver más información.</p>
          </section>

          <div className="lower-grid">
            <section id="eventos" className="events-card" aria-labelledby="events-title"><div className="card-heading"><div><span className="section-kicker">REGISTRO RECIENTE</span><h2 id="events-title">Últimos eventos</h2></div><div className="events-tools"><div className="segmented" role="group" aria-label="Ordenar eventos">{([["recent", "Recientes"], ["magnitude", "Mayor magnitud"]] as const).map(([value, label]) => <button key={value} type="button" className={sort === value ? "selected" : ""} aria-pressed={sort === value} onClick={() => setSort(value)}>{label}</button>)}</div><span className="results-count">{events.length} {events.length === 1 ? "evento" : "eventos"}</span></div></div><div className="events-list" aria-live="polite">{events.length ? listEvents.map(event => <button key={event.id} type="button" className="event-row" onClick={() => chooseEvent(event)}><span className={`magnitude-badge${(event.properties.mag ?? 0) >= 5 ? " high" : (event.properties.mag ?? 0) < 3 ? " low" : ""}`}>{magText(event)}</span><span className="event-text"><strong>{placeText(event)}</strong><small>{depthText(event)} de profundidad</small></span><span className="event-time"><strong>{clockFormat.format(new Date(event.properties.time))}</strong><small>{date.format(new Date(event.properties.time))}</small></span></button>) : <div className="empty-state">{status === "loading" ? "Consultando eventos sísmicos…" : status === "error" ? "Los datos no están disponibles en este momento. Inténtalo de nuevo más tarde." : "No hay sismos reportados para este período y magnitud. Prueba otro filtro."}</div>}</div></section>
            <section id="preparacion" className="prepared-card" aria-labelledby="prepared-title"><div className="prepared-icon">✳</div><span className="section-kicker">ESTAR PREPARADOS IMPORTA</span><h2 id="prepared-title">La información es parte de tu seguridad.</h2><p>Ante un sismo, mantén la calma y sigue las indicaciones de las autoridades de protección civil.</p><div className="prepared-steps"><div><span>01</span><strong>Agáchate</strong><small>Reduce el riesgo de caídas.</small></div><div><span>02</span><strong>Cúbrete</strong><small>Protege cabeza y cuello.</small></div><div><span>03</span><strong>Sujétate</strong><small>Espera a que termine el movimiento.</small></div></div><a href="https://www.sinaproc.gob.pa/" target="_blank" rel="noopener noreferrer">Visitar SINAPROC <span aria-hidden="true">↗</span></a></section>
          </div>
          <section id="recomendaciones" className="guide-section" aria-labelledby="guide-title">
            <div className="section-heading"><div><span className="section-kicker">QUÉ HACER AHORA</span><h2 id="guide-title">Guía de seguridad según dónde estés</h2></div></div>
            <div className="guide-grid">
              <SafetyGuide aftershockCount={mainshock?.aftershocks.count ?? null} strongestAftershock={mainshock?.aftershocks.strongest ? magText(mainshock.aftershocks.strongest) : null} />
              <div className="guide-side">
                <div className="emergency-card">
                  <span className="section-kicker">EMERGENCIAS</span>
                  <a className="emergency-number" href="tel:911" aria-label="Llamar al 911">911</a>
                  <p>Llama solo si hay heridos, personas atrapadas, incendios o fugas de gas. Si puedes, usa mensajes de texto para no saturar las líneas.</p>
                  <div className="emergency-links">
                    <a href="https://www.sinaproc.gob.pa/" target="_blank" rel="noopener noreferrer">SINAPROC <span aria-hidden="true">↗</span></a>
                    <a href="https://www.tsunami.gov/" target="_blank" rel="noopener noreferrer">Avisos de tsunami <span aria-hidden="true">↗</span></a>
                    {main && <a href={mainUrl} target="_blank" rel="noopener noreferrer">Reporte del USGS <span aria-hidden="true">↗</span></a>}
                  </div>
                </div>
                <Checklists />
              </div>
            </div>
          </section>

          <footer><span>© {new Date().getFullYear()} Sismo Panamá</span><span>Datos: <a href="https://earthquake.usgs.gov/fdsnws/event/1/" target="_blank" rel="noopener noreferrer">USGS Earthquake Catalog</a> · No sustituye alertas oficiales ni predice sismos.</span></footer>
        </div>
      </main>
    </div>
  );
}
