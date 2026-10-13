"use client";

import { Download, ExternalLink, MessageSquareText, Search } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { Earthquake, EarthquakeResponse } from "../../lib/earthquakes";
import { INTENSITIES, PLACE_INDEX, placeTitle, type EventReports, type EventSummary, type ReportsDashboard } from "../../lib/felt-reports";
import { DISTRICTS } from "../../lib/places";
import { PROVINCE_BY_ID } from "../../lib/province-of";
import { agoLabel } from "../../lib/quake-facts";
import { placeTitle as quakePlace } from "../../lib/quake-summary";
import FeltReport from "../felt-report";
import ReportsMap from "./reports-map";

// Página «Reportes»: lo que contaron las personas que sintieron (o no) cada sismo, más lo que publica el USGS de su propio
// formulario «¿Lo sentiste?». Todo está agrupado por localidad; ningún reporte se muestra suelto.

type Summary = EventSummary & { usgsFelt: number | null; usgsUrl: string | null };
type Dashboard = Omit<ReportsDashboard, "events"> & { events: Summary[] };
type Detail = Omit<EventReports, "event"> & { event: Summary };

const POLL_MS = 30_000;
const LEVEL_COLORS = ["#8fb7ef", "#f2bd38", "#ef7b2d", "#b8102b"];
const dayFormat = new Intl.DateTimeFormat("es-PA", { timeZone: "America/Panama", weekday: "long", day: "numeric", month: "long" });
const clock = new Intl.DateTimeFormat("es-PA", { timeZone: "America/Panama", hour: "numeric", minute: "2-digit", hour12: true });
const full = new Intl.DateTimeFormat("es-PA", { timeZone: "America/Panama", day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
const count = new Intl.NumberFormat("es-PA");
const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Un sismo del resumen, con la forma que espera el formulario.
const asEarthquake = (item: Summary): Earthquake => ({
  id: item.id,
  properties: { mag: item.mag, place: item.place, time: item.time, url: null },
  geometry: { coordinates: [item.lng, item.lat] },
});

function csvFor(detail: Detail) {
  const cell = (value: string | number) => (typeof value === "number" ? String(value) : `"${value.replace(/"/g, '""')}"`);
  const header = ["localidad", "distrito", "provincia", "latitud", "longitud", "km_al_epicentro", "lo_sintieron", "no_lo_sintieron", ...INTENSITIES.map(item => fold(item.name).replace(/ /g, "_"))];
  const rows = detail.places.map(place => {
    const info = PLACE_INDEX.get(place.id);
    return [place.name, DISTRICTS[info?.district ?? ""]?.name ?? "", PROVINCE_BY_ID.get(info?.province ?? "")?.name ?? "", place.lat, place.lng, place.km, place.yes, place.no, ...place.byIntensity];
  });
  return [header, ...rows].map(row => row.map(cell).join(",")).join("\n");
}

function IntensityBar({ values, large = false }: { values: readonly number[]; large?: boolean }) {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!total) return <div className={`rp-bar empty${large ? " large" : ""}`} aria-hidden="true" />;
  return (
    <div className={`rp-bar${large ? " large" : ""}`} aria-hidden="true">
      {values.map((value, index) => value > 0 && <i key={index} style={{ flexGrow: value, background: LEVEL_COLORS[index] }} />)}
    </div>
  );
}

export default function ReportsDashboardView({ children }: { children?: ReactNode }) {
  const [data, setData] = useState<Dashboard | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "off">("loading");
  const [latest, setLatest] = useState<Earthquake | null>(null);
  const [sort, setSort] = useState<"recent" | "most">("recent");
  const [query, setQuery] = useState("");
  // El sismo que se pidió ver (desde el formulario: /reportes?sismo=<id>). Los datos se cargan en el navegador, así que leer
  // la dirección aquí no cambia lo que se dibuja en el servidor.
  const [selected, setSelected] = useState<string | null>(() => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("sismo")));
  const [detail, setDetail] = useState<Detail | null>(null);
  const [reportFor, setReportFor] = useState<Earthquake | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => !document.hidden && setTick(value => value + 1), POLL_MS);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const response = await fetch("/api/reports");
        if (response.status === 503) {
          if (live) setStatus("off");
          return;
        }
        if (!response.ok) throw new Error(String(response.status));
        const next = (await response.json()) as Dashboard;
        if (!live) return;
        setData(next);
        setStatus("ready");
      } catch {
        if (live) setStatus(current => (current === "ready" ? current : "error"));
      }
      try {
        const quakes = (await (await fetch("/api/earthquakes")).json()) as EarthquakeResponse;
        if (live && quakes.features?.length) setLatest(quakes.features.reduce((a, b) => (b.properties.time > a.properties.time ? b : a)));
      } catch {
        // Sin el último sismo solo falta el botón para reportarlo.
      }
    })();
    return () => { live = false; };
  }, [tick, reportFor]);

  const list = useMemo(() => {
    if (!data) return [];
    const q = fold(query.trim());
    const filtered = q ? data.events.filter(item => fold(quakePlace(asEarthquake(item))).includes(q) || fold(item.place ?? "").includes(q)) : data.events;
    const weight = (item: Summary) => item.total + (item.usgsFelt ?? 0);
    return sort === "recent" ? filtered : [...filtered].sort((a, b) => weight(b) - weight(a));
  }, [data, query, sort]);

  // Sin selección, el primero de la lista.
  const current = selected ?? list[0]?.id ?? null;
  useEffect(() => {
    if (!current) return;
    let live = true;
    fetch(`/api/reports?event=${encodeURIComponent(current)}`)
      .then(response => (response.ok ? (response.json() as Promise<Detail>) : null))
      .then((next: Detail | null) => live && setDetail(next))
      .catch(() => live && setDetail(null));
    return () => { live = false; };
  }, [current, tick, reportFor]);

  const groups = useMemo(() => {
    const result: { day: string; items: Summary[] }[] = [];
    for (const item of list) {
      const day = sort === "recent" ? dayFormat.format(new Date(item.time)) : "";
      const last = result[result.length - 1];
      if (last && last.day === day) last.items.push(item);
      else result.push({ day, items: [item] });
    }
    return result;
  }, [list, sort]);

  const download = () => {
    if (!detail) return;
    const blob = new Blob(["﻿" + csvFor(detail)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `reportes-${detail.event.id.replace(/[^\w-]/g, "_")}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const shown = detail?.event;
  return (
    <main className="rp content-wrap" id="contenido">
      <header className="rp-head">
        <div>
          <h1>Reportes de quienes lo sintieron</h1>
          <p>Lo que cuentan las personas que sintieron (o no) cada sismo desde el 9 de octubre. Son reportes sin verificar, no una medición.</p>
          {data && <p className="rp-updated">Se actualiza solo · última vez a las {clock.format(new Date(data.fetchedAt))}</p>}
        </div>
        {latest && (
          <button type="button" className="btn btn-primary rp-cta" onClick={() => setReportFor(latest)}>
            <MessageSquareText size={20} aria-hidden="true" /> Reportar el último sismo
            <small>Magnitud {latest.properties.mag?.toFixed(1) ?? "—"} · {agoLabel(latest.properties.time)}</small>
          </button>
        )}
      </header>

      {status === "off" && <p className="rp-empty">Los reportes todavía no están disponibles. Vuelve pronto.</p>}
      {status === "error" && !data && <p className="rp-empty">No se pudieron consultar los reportes. Revisa tu conexión.</p>}
      {status === "loading" && !data && <p className="rp-empty" role="status">Cargando reportes…</p>}

      {data && (
        <>
          <dl className="rp-totals">
            <div><dt>Reportes</dt><dd>{count.format(data.totals.reports)}</dd></div>
            <div><dt>Lo sintieron</dt><dd className="yes">{count.format(data.totals.yes)}</dd></div>
            <div><dt>No lo sintieron</dt><dd>{count.format(data.totals.no)}</dd></div>
            <div><dt>Sismos con reportes</dt><dd>{count.format(data.events.length)}</dd></div>
          </dl>

          <div className="rp-grid">
            <section className="rp-list" aria-labelledby="rp-list-title">
              <div className="rp-list-head">
                <h2 id="rp-list-title">Sismos con reportes <span>{data.events.length}</span></h2>
                <div className="rp-sort" role="group" aria-label="Ordenar">
                  <button type="button" aria-pressed={sort === "recent"} className={sort === "recent" ? "on" : ""} onClick={() => setSort("recent")}>Más recientes</button>
                  <button type="button" aria-pressed={sort === "most"} className={sort === "most" ? "on" : ""} onClick={() => setSort("most")}>Más reportes</button>
                </div>
                <label className="rp-search">
                  <Search size={18} aria-hidden="true" />
                  <span className="sr-only">Buscar por lugar</span>
                  <input type="search" value={query} onChange={change => setQuery(change.target.value)} placeholder="Buscar por lugar" />
                </label>
              </div>
              {list.length === 0 ? (
                <p className="rp-empty small">{query ? "Ningún sismo coincide con esa búsqueda." : "Todavía no hay reportes. ¡Sé la primera persona en reportar!"}</p>
              ) : (
                <div className="rp-items">
                  {groups.map(group => (
                    <div key={group.day || "todos"}>
                      {group.day && <h3 className="rp-day">{group.day}</h3>}
                      <ul>
                        {group.items.map(item => (
                          <li key={item.id}>
                            <button type="button" className={item.id === current ? "on" : ""} aria-current={item.id === current ? "true" : undefined}
                              onClick={() => { setSelected(item.id); if (window.innerWidth < 900) document.getElementById("rp-detail")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>
                              <span className="rp-mag"><strong>{item.mag === null ? "—" : item.mag.toFixed(1)}</strong><small>mag.</small></span>
                              <span className="rp-item-text">
                                <strong>{quakePlace(asEarthquake(item))}</strong>
                                <small>{clock.format(new Date(item.time))}{item.usgsFelt ? ` · USGS: ${count.format(item.usgsFelt)}` : ""}</small>
                                <IntensityBar values={item.byIntensity} />
                              </span>
                              <span className="rp-count"><strong>{count.format(item.total)}</strong><small>{item.yes} sí</small></span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rp-detail" id="rp-detail" aria-live="polite" aria-labelledby="rp-detail-title">
              {shown ? (
                <>
                  <div className="rp-detail-head">
                    <div>
                      <h2 id="rp-detail-title">Magnitud {shown.mag === null ? "—" : shown.mag.toFixed(1)}, {quakePlace(asEarthquake(shown))}</h2>
                      <p>{full.format(new Date(shown.time))} ({agoLabel(shown.time)})</p>
                    </div>
                    <div className="rp-detail-actions">
                      <a className="btn btn-secondary" href={`/?focus=${encodeURIComponent(shown.id)}#mapa`}>Ver en el mapa</a>
                      <button type="button" className="btn btn-primary" onClick={() => setReportFor(asEarthquake(shown))}><MessageSquareText size={18} aria-hidden="true" /> ¿Lo sentiste?</button>
                      <button type="button" className="btn btn-secondary" onClick={download} disabled={!detail?.places.length}><Download size={18} aria-hidden="true" /> Descargar CSV</button>
                    </div>
                  </div>
                  <dl className="rp-stats">
                    <div><dt>Lo sintieron</dt><dd className="yes">{count.format(shown.yes)}</dd></div>
                    <div><dt>No lo sintieron</dt><dd>{count.format(shown.no)}</dd></div>
                    <div><dt>Hasta dónde</dt><dd>{shown.farthestKm === null ? "—" : `${count.format(shown.farthestKm)} km`}</dd></div>
                  </dl>
                  {shown.yes > 0 && (
                    <div className="rp-strength">
                      <h3>Con qué fuerza lo sintieron</h3>
                      <IntensityBar values={shown.byIntensity} large />
                      <ul>{INTENSITIES.map((item, index) => <li key={item.value}><i style={{ background: LEVEL_COLORS[index] }} />{item.name} <strong>{shown.byIntensity[index]}</strong></li>)}</ul>
                    </div>
                  )}
                  {(shown.usgsFelt !== null || shown.usgsUrl) && (
                    <div className="rp-usgs">
                      <div>
                        <strong>En el USGS{shown.usgsFelt !== null && `: ${count.format(shown.usgsFelt)} ${shown.usgsFelt === 1 ? "reporte" : "reportes"}`}</strong>
                        <span>El Servicio Geológico de EE. UU. tiene su propio formulario «¿Lo sentiste?» para este sismo.</span>
                      </div>
                      {shown.usgsUrl && <a className="btn btn-secondary" href={shown.usgsUrl} target="_blank" rel="noopener noreferrer">Reportar en el USGS <ExternalLink size={16} aria-hidden="true" /></a>}
                    </div>
                  )}
                  {detail && detail.places.length > 0 ? (
                    <>
                      <ReportsMap places={detail.places} epicenter={{ lat: shown.lat, lng: shown.lng }} />
                      <table className="rp-table">
                        <caption className="sr-only">Reportes por localidad</caption>
                        <thead><tr><th scope="col">Localidad</th><th scope="col">Lo sintieron</th><th scope="col">No</th><th scope="col">Distancia</th></tr></thead>
                        <tbody>
                          {detail.places.slice(0, 40).map(place => (
                            <tr key={place.id}>
                              <th scope="row">{place.name}<small>{placeTitle(PLACE_INDEX.get(place.id)!).replace(`${place.name}, `, "")}</small></th>
                              <td>{place.yes}</td>
                              <td>{place.no}</td>
                              <td>{place.km} km</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </>
                  ) : (
                    <p className="rp-empty small">Todavía nadie lo ha reportado aquí. Si lo sentiste, cuéntanos.</p>
                  )}
                </>
              ) : (
                <p className="rp-empty small">Elige un sismo de la lista para ver sus reportes.</p>
              )}
            </section>
          </div>
        </>
      )}
      {children}
      {reportFor && <FeltReport event={reportFor} onClose={() => setReportFor(null)} />}
    </main>
  );
}
