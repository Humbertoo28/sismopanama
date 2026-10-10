"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  DEFAULT_FILTERS, HOUR, MINUTE, SOURCES, WINDOWS, activitySeries, ago, filterQuakes, median, observedFacts, pickBucket,
  toQuakes, windowStart, type Filters, type Quake, type Source, type WindowKey,
} from "../../lib/analytics";
import { MAINSHOCK_ID, sameEvent, type Earthquake, type EarthquakeResponse, type MainshockResponse } from "../../lib/earthquakes";
import { ActivityChart, DepthBars, Legend, MagnitudeBars, TimelineChart, type TimelinePoint } from "./charts";
import { fmtClock, fmtFull, fmtInt } from "./format";

// Igual que la página principal: el servidor guarda la respuesta 5 s, así que consultar más seguido no sirve de nada.
const POLL_MS = 8_000;
const TOAST_MS = 20_000;
const FRESH_MS = 3 * 60_000;
const REPORT_HOSTS = ["https://earthquake.usgs.gov/", "https://sismosgeociencias.up.ac.pa/", "https://www.emsc-csem.org/"];
const SOURCE_NAMES: Record<Source, string> = { usgs: "USGS", igc: "IGC", emsc: "EMSC" };
const MAG_OPTIONS = [0, 3, 4, 5, 6];

const reportUrl = (quake: Quake) => (quake.url && REPORT_HOSTS.some((host) => quake.url!.startsWith(host)) ? quake.url : null);
const depthText = (quake: Quake) => (quake.depth === null ? "—" : `${Math.round(quake.depth)} km`);

async function getJson<T>(url: string, ms = 30_000): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), ms);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()) as T;
  } finally {
    window.clearTimeout(timer);
  }
}

function Kpi({ label, value, sub, badge }: { label: string; value: string; sub?: string; badge?: string }) {
  return (
    <div className="an-kpi">
      <span className="an-kpi-label">{label}{badge && <em>{badge}</em>}</span>
      <strong>{value}</strong>
      {sub && <small>{sub}</small>}
    </div>
  );
}

export default function Dashboard({ children }: { children?: ReactNode }) {
  const [events, setEvents] = useState<Earthquake[] | null>(null);
  const [catalogs, setCatalogs] = useState<EarthquakeResponse["catalogs"]>();
  const [lastOk, setLastOk] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [mainshock, setMainshock] = useState<MainshockResponse | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<"interval" | "cumulative">("interval");
  const [sort, setSort] = useState<"recent" | "mag">("recent");
  const [limit, setLimit] = useState(12);
  const [fresh, setFresh] = useState<Record<string, number>>({});
  const [announcement, setAnnouncement] = useState("");
  const [toast, setToast] = useState<{ key: number; id: string; title: string; place: string } | null>(null);
  const previous = useRef<Earthquake[] | null>(null);
  const inflight = useRef(false);

  const load = useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    try {
      const data = await getJson<EarthquakeResponse>("/api/earthquakes");
      if (!Array.isArray(data.features)) throw new Error("formato");
      const arrived = Date.now();
      const before = previous.current;
      if (before) {
        // Un registro es nuevo si no estaba antes ni se parece a uno que ya estaba (los catálogos cambian ids al revisar).
        const added = data.features.filter((event) => !before.some((old) => old.id === event.id || sameEvent(old, event)));
        if (added.length) {
          setFresh((current) => ({ ...current, ...Object.fromEntries(added.map((event) => [event.id, arrived])) }));
          const top = added.reduce((best, event) => ((event.properties.mag ?? -1) > (best.properties.mag ?? -1) ? event : best));
          const mag = top.properties.mag === null ? "" : ` M ${top.properties.mag.toFixed(1)}`;
          const title = added.length > 1 ? `${added.length} sismos nuevos · el mayor${mag}` : `Nuevo sismo${mag ? ` ·${mag}` : ""}`;
          setAnnouncement(`${title}.`);
          setToast({ key: arrived, id: top.id, title, place: top.properties.place || "Ubicación no especificada" });
        }
      }
      previous.current = data.features;
      setEvents(data.features);
      setCatalogs(data.catalogs);
      setLastOk(arrived);
      setNow(arrived);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      inflight.current = false;
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, POLL_MS);
    const onVisible = () => { if (document.visibilityState === "visible") void load(); };
    // Al volver a la pestaña o recuperar la conexión se consulta de inmediato, sin esperar al siguiente turno.
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    // Si el celular recibe el aviso push de un sismo, el service worker se lo comunica a la página: se consulta en
    // ese instante (y de nuevo unos segundos después, por si la respuesta guardada del servidor aún no lo incluye).
    const retries: number[] = [];
    const onWorkerMessage = (message: MessageEvent) => {
      if (message.data?.type !== "quake-push") return;
      void load();
      retries.push(window.setTimeout(() => void load(), 4_000), window.setTimeout(() => void load(), 10_000));
    };
    navigator.serviceWorker?.addEventListener("message", onWorkerMessage);
    return () => {
      window.clearInterval(timer);
      retries.forEach((id) => window.clearTimeout(id));
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
      navigator.serviceWorker?.removeEventListener("message", onWorkerMessage);
    };
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(tick);
  }, []);

  // Solo se usa la hora del sismo principal, para saber desde dónde cuentan las réplicas.
  useEffect(() => {
    let alive = true;
    const loadMain = () => getJson<MainshockResponse>("/api/earthquakes/mainshock").then((data) => { if (alive) setMainshock(data); }).catch(() => {});
    loadMain();
    const timer = window.setInterval(loadMain, 120_000);
    return () => { alive = false; window.clearInterval(timer); };
  }, []);

  const quakes = useMemo(() => (events ? toQuakes(events) : []), [events]);
  const withoutMagnitude = events ? events.length - quakes.length : 0;
  const bySource = useMemo(() => quakes.filter((quake) => filters.sources.includes(quake.source)), [quakes, filters.sources]);
  const mainshockTime = useMemo(() => {
    if (mainshock) return mainshock.mainshock.properties.time;
    const known = events?.find((event) => event.id === MAINSHOCK_ID || event.properties.aliases?.includes(MAINSHOCK_ID));
    return known?.properties.time ?? null;
  }, [mainshock, events]);

  const sequenceStart = useMemo(
    () => (mainshockTime === null ? quakes.reduce((min, quake) => Math.min(min, quake.time), now) : mainshockTime - 30 * MINUTE),
    [mainshockTime, quakes, now],
  );
  const shown = useMemo(() => filterQuakes(quakes, filters, now, sequenceStart), [quakes, filters, now, sequenceStart]);
  const inSequence = useMemo(() => quakes.filter((quake) => quake.time >= sequenceStart).length, [quakes, sequenceStart]);

  const from = windowStart(filters.window, now, sequenceStart);
  const latest = shown.reduce<Quake | null>((best, quake) => (!best || quake.time > best.time ? quake : best), null);
  const strongest = shown.reduce<Quake | null>((best, quake) => (!best || quake.mag > best.mag ? quake : best), null);
  const points = useMemo<TimelinePoint[]>(
    () => shown.map((quake) => ({ ...quake, role: quake.id === MAINSHOCK_ID ? "main" : quake.id === latest?.id ? "latest" : "normal" })),
    [shown, latest?.id],
  );
  const size = pickBucket(Math.max(now - from, HOUR));
  const buckets = useMemo(() => activitySeries(shown, from, now, size), [shown, from, now, size]);
  const facts = useMemo(() => observedFacts(bySource, mainshockTime, now), [bySource, mainshockTime, now]);
  const depths = shown.flatMap((quake) => (quake.depth === null ? [] : [quake.depth]));
  const medianDepth = median(depths);
  const recent3h = shown.filter((quake) => now - quake.time <= 3 * HOUR).length;
  const selected = selectedId ? quakes.find((quake) => quake.id === selectedId) ?? null : null;
  const isFresh = (id: string) => fresh[id] !== undefined && now - fresh[id] < FRESH_MS;
  const stale = lastOk !== null && now - lastOk > 3 * POLL_MS;

  const table = useMemo(() => [...shown].sort((a, b) => (sort === "recent" ? b.time - a.time : b.mag - a.mag || b.time - a.time)), [shown, sort]);

  const toggleSource = (source: Source) =>
    setFilters((current) => {
      const has = current.sources.includes(source);
      if (has && current.sources.length === 1) return current; // siempre queda al menos una fuente
      return { ...current, sources: has ? current.sources.filter((item) => item !== source) : [...current.sources, source] };
    });
  const filtersChanged = filters.window !== DEFAULT_FILTERS.window || filters.minMag !== 0 || filters.sources.length !== SOURCES.length;

  return (
    <div className="an-root">
      <header className="an-header">
        <Link className="an-back" href="/">← Panel principal</Link>
        <div className="an-brand" aria-label="Sismo Panamá"><strong>SISMO</strong><small>PANAMÁ</small></div>
        <span className={`an-live${failed && stale ? " an-live-off" : ""}`} role="status">
          <i aria-hidden="true" />
          {lastOk === null ? (failed ? "Sin conexión" : "Conectando…") : failed && stale ? `Sin conexión · datos de ${fmtClock.format(lastOk)}` : `En vivo · ${fmtClock.format(lastOk)}`}
        </span>
      </header>

      {toast && (
        <div className="an-toast" role="status" key={toast.key}>
          <i aria-hidden="true" />
          <div><strong>{toast.title}</strong><span>{toast.place}</span></div>
          <button type="button" className="an-btn" onClick={() => { setSelectedId(toast.id); setToast(null); document.getElementById("an-tl-title")?.scrollIntoView({ block: "center", behavior: "smooth" }); }}>Ver</button>
          <button type="button" className="an-toast-close" aria-label="Cerrar aviso" onClick={() => setToast(null)}>×</button>
        </div>
      )}

      <div className="an-wrap">
        <section className="an-intro" aria-labelledby="an-title">
          <h1 id="an-title">Sismos registrados</h1>
          <p>Gráficos interactivos con los sismos que publican USGS, IGC y EMSC, tal como los publican. Se actualizan solos: cada vez que entra un sismo nuevo aparece un aviso y los gráficos se ponen al día.</p>
        </section>

        {!events && (
          <div className="an-card an-state" role="status">
            {failed ? (
              <>
                <p>No se pudieron cargar los sismos. Revisa tu conexión.</p>
                <button type="button" className="an-btn" onClick={() => void load()}>Reintentar</button>
              </>
            ) : (
              <p>Cargando sismos…</p>
            )}
          </div>
        )}

        {events && (
          <>
            <div className="an-filters" role="group" aria-label="Filtros">
              <div className="an-field">
                <span id="an-win">Periodo</span>
                <div className="an-seg" role="radiogroup" aria-labelledby="an-win">
                  {WINDOWS.map((item) => (
                    <button key={item.key} type="button" role="radio" aria-checked={filters.window === item.key}
                      onClick={() => setFilters((current) => ({ ...current, window: item.key as WindowKey }))}>{item.label}</button>
                  ))}
                </div>
              </div>
              <label className="an-field">
                <span>Magnitud</span>
                <select value={filters.minMag} onChange={(e) => setFilters((current) => ({ ...current, minMag: Number(e.target.value) }))}>
                  {MAG_OPTIONS.map((value) => <option key={value} value={value}>{value === 0 ? "Todas" : `M ${value} o más`}</option>)}
                </select>
              </label>
              <div className="an-field">
                <span id="an-src">Fuentes</span>
                <div className="an-chips" role="group" aria-labelledby="an-src">
                  {SOURCES.map((source) => {
                    const down = catalogs && !catalogs[source];
                    return (
                      <button key={source} type="button" aria-pressed={filters.sources.includes(source)} onClick={() => toggleSource(source)}
                        title={down ? `${SOURCE_NAMES[source]} no respondió en la última consulta` : undefined}>
                        {SOURCE_NAMES[source]}{down && <span className="an-warn" aria-label="sin respuesta"> !</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
              {filtersChanged && <button type="button" className="an-btn an-btn-ghost" onClick={() => setFilters(DEFAULT_FILTERS)}>Quitar filtros</button>}
            </div>

            <section className="an-kpis" aria-label="Resumen">
              <Kpi label="Sismos" value={fmtInt.format(shown.length)} sub={`de ${fmtInt.format(inSequence)} desde el sismo principal`} />
              <Kpi label="Último sismo" value={latest ? `M ${latest.mag.toFixed(1)}` : "—"} sub={latest ? ago(now - latest.time) : "Sin datos"} badge={latest && isFresh(latest.id) ? "NUEVO" : undefined} />
              <Kpi label="Mayor magnitud" value={strongest ? `M ${strongest.mag.toFixed(1)}` : "—"} sub={strongest ? ago(now - strongest.time) : "Sin datos"} />
              <Kpi label="Últimas 3 horas" value={fmtInt.format(recent3h)} sub={`sismos registrados (${(recent3h / 3).toFixed(1)} por hora)`} />
              <Kpi label="Profundidad mediana" value={medianDepth === null ? "—" : `${Math.round(medianDepth)} km`} sub={`${fmtInt.format(depths.length)} con dato`} />
            </section>

            {facts.length > 0 && (
              <section className="an-card" aria-labelledby="an-facts-title">
                <h2 id="an-facts-title">Lo registrado hasta ahora</h2>
                <ul className="an-list">{facts.map((fact) => <li key={fact}>{fact}</li>)}</ul>
              </section>
            )}

            <section className="an-card" aria-labelledby="an-tl-title">
              <div className="an-card-head">
                <div>
                  <h2 id="an-tl-title">Línea de tiempo</h2>
                  <p>Cada punto es un sismo; crece con la magnitud. Toca uno para ver el detalle.</p>
                </div>
                <Legend items={[
                  { label: "Sismo", kind: "dot", color: "var(--an-s1)" },
                  { label: "Sismo principal", kind: "dot", color: "var(--an-s2)" },
                  { label: "Último", kind: "ring", color: "var(--an-ink)" },
                ]} />
              </div>
              <TimelineChart points={points} from={from} to={now} selectedId={selectedId} onSelect={setSelectedId} />
              {selected && (
                <div className="an-detail" role="region" aria-label="Detalle del sismo seleccionado">
                  <div>
                    <strong>M {selected.mag.toFixed(1)}</strong>
                    <span>{selected.place}</span>
                    <small>{fmtFull.format(selected.time)} · {ago(now - selected.time)} · prof. {depthText(selected)} · {SOURCE_NAMES[selected.source]}</small>
                  </div>
                  <div className="an-detail-actions">
                    <a className="an-btn" href={`/?focus=${encodeURIComponent(selected.id)}#mapa`}>Ver en el mapa</a>
                    {reportUrl(selected) && <a className="an-btn an-btn-ghost" href={reportUrl(selected)!} target="_blank" rel="noopener noreferrer">Reporte oficial ↗</a>}
                    <button type="button" className="an-btn an-btn-ghost" onClick={() => setSelectedId(null)}>Cerrar</button>
                  </div>
                </div>
              )}
            </section>

            <div className="an-grid">
              <section className="an-card" aria-labelledby="an-act-title">
                <div className="an-card-head">
                  <div>
                    <h2 id="an-act-title">Actividad</h2>
                    <p>{mode === "interval" ? `Sismos por intervalo de ${size >= 24 * HOUR ? "1 día" : size >= HOUR ? `${size / HOUR} h` : `${size / MINUTE} min`}. En naranja, los que incluyen un M 5 o más.` : "Total de sismos registrados desde el inicio del periodo."}</p>
                  </div>
                  <div className="an-seg" role="radiogroup" aria-label="Tipo de gráfico">
                    <button type="button" role="radio" aria-checked={mode === "interval"} onClick={() => setMode("interval")}>Por intervalo</button>
                    <button type="button" role="radio" aria-checked={mode === "cumulative"} onClick={() => setMode("cumulative")}>Acumulado</button>
                  </div>
                </div>
                <ActivityChart buckets={buckets} size={size} mode={mode} />
              </section>

              <div className="an-stack">
                <section className="an-card" aria-labelledby="an-mag-title">
                  <div className="an-card-head"><div><h2 id="an-mag-title">Magnitudes</h2><p>Cuántos sismos hubo de cada magnitud.</p></div></div>
                  <MagnitudeBars quakes={shown} />
                </section>
                <section className="an-card" aria-labelledby="an-depth-title">
                  <div className="an-card-head"><div><h2 id="an-depth-title">Profundidad</h2><p>Cuántos sismos hubo a cada profundidad.</p></div></div>
                  <DepthBars quakes={shown} />
                </section>
              </div>
            </div>

            <section className="an-card" aria-labelledby="an-tab-title">
              <div className="an-card-head">
                <div><h2 id="an-tab-title">Eventos</h2><p>{fmtInt.format(shown.length)} sismos con los filtros actuales.</p></div>
                <div className="an-seg" role="radiogroup" aria-label="Orden">
                  <button type="button" role="radio" aria-checked={sort === "recent"} onClick={() => setSort("recent")}>Recientes</button>
                  <button type="button" role="radio" aria-checked={sort === "mag"} onClick={() => setSort("mag")}>Mayores</button>
                </div>
              </div>
              <div className="an-table-wrap">
                <table className="an-table">
                  <thead>
                    <tr><th scope="col">Hora</th><th scope="col">M</th><th scope="col">Lugar</th><th scope="col" className="an-hide-sm">Prof.</th><th scope="col" className="an-hide-sm">Fuente</th></tr>
                  </thead>
                  <tbody>
                    {table.slice(0, limit).map((quake) => (
                      <tr key={quake.id} className={quake.id === selectedId ? "an-row-selected" : undefined}>
                        <td>{fmtFull.format(quake.time)}{isFresh(quake.id) && <em className="an-new">NUEVO</em>}</td>
                        <td><b>{quake.mag.toFixed(1)}</b></td>
                        <td><button type="button" className="an-linkbtn" onClick={() => { setSelectedId(quake.id); document.getElementById("an-tl-title")?.scrollIntoView({ block: "center", behavior: "smooth" }); }}>{quake.place}</button></td>
                        <td className="an-hide-sm">{depthText(quake)}</td>
                        <td className="an-hide-sm">{SOURCE_NAMES[quake.source]}</td>
                      </tr>
                    ))}
                    {!table.length && <tr><td colSpan={5} className="an-empty">No hay sismos con estos filtros.</td></tr>}
                  </tbody>
                </table>
              </div>
              {limit < table.length && <button type="button" className="an-btn an-btn-ghost an-more" onClick={() => setLimit((current) => current + 25)}>Mostrar más ({table.length - limit} restantes)</button>}
            </section>

            <footer className="an-foot">
              <p>Creado por <a href="https://www.instagram.com/humbertiex_?dlrf=MXZsN3N2ZGpnZGI3&utm_source=qr" target="_blank" rel="noopener noreferrer">humbertiex</a></p>
              <p>Datos: USGS, Instituto de Geociencias de la Universidad de Panamá (IGC) y EMSC, combinados sin duplicados. Las magnitudes pueden diferir entre agencias y cambiar cuando se revisan. Aquí no se estima ni se proyecta nada: solo se cuenta y se ordena lo registrado.</p>
              {withoutMagnitude > 0 && <p>{withoutMagnitude} {withoutMagnitude === 1 ? "sismo sin magnitud publicada no aparece" : "sismos sin magnitud publicada no aparecen"} en estos gráficos.</p>}
              <p>Consulta siempre los avisos oficiales de <a href="https://www.sinaproc.gob.pa/" target="_blank" rel="noopener noreferrer">SINAPROC</a>.</p>
            </footer>
          </>
        )}
        {children}
      </div>
      <div className="an-sr" aria-live="polite">{announcement}</div>
    </div>
  );
}
