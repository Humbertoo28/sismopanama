"use client";

import { useEffect, useState } from "react";
import type { SourcesResponse } from "../lib/earthquakes";

const clock = new Intl.DateTimeFormat("es-PA", {
  timeZone: "America/Panama", hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true,
});

const OFFICIAL = [
  { name: "SINAPROC", tag: "Oficial · Panamá", url: "https://www.sinaproc.gob.pa/", role: "Protección Civil de Panamá: alertas, evacuaciones e indicaciones oficiales." },
  { name: "Instituto de Geociencias (IGC-UP)", tag: "Científica · Panamá", url: "https://geociencias.up.ac.pa/", role: "Red Sísmica Nacional de la Universidad de Panamá. Publica los sismos del país, con reportes preliminares a los pocos minutos." },
  { name: "Cruz Roja Panameña", tag: "Humanitaria · Panamá", url: "https://cruzroja.org.pa/", role: "Ayuda humanitaria y primeros auxilios." },
  { name: "Centros de Alerta de Tsunamis de EE. UU.", tag: "Oficial · Internacional", url: "https://www.tsunami.gov/", role: "Avisos de tsunami para el Pacífico (NOAA)." },
];

const CATALOGS = [
  { name: "USGS", url: "https://earthquake.usgs.gov/" },
  { name: "EMSC", url: "https://www.emsc-csem.org/" },
  { name: "GFZ GEOFON", url: "https://geofon.gfz.de/" },
];

function magnitudeSummary(values: number[]) {
  if (values.length < 2) return null;
  const low = Math.min(...values).toFixed(1);
  const high = Math.max(...values).toFixed(1);
  return low === high ? `Las ${values.length} agencias coinciden: magnitud ${low}.` : `Las ${values.length} agencias reportan entre M ${low} y M ${high}.`;
}

export default function Sources({ refreshKey }: { refreshKey: number }) {
  const [data, setData] = useState<SourcesResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch("/api/earthquakes/sources", { signal: controller.signal });
        if (!response.ok) throw new Error(`Error ${response.status}`);
        const body: SourcesResponse = await response.json();
        if (!Array.isArray(body.sources)) throw new Error("Respuesta no válida");
        setData(body);
        setFailed(false);
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("No se pudo cargar el contraste entre agencias:", error);
        setFailed(true);
      }
    };
    load();
    return () => controller.abort();
  }, [refreshKey]);

  const rows = data?.sources ?? [];
  const summary = magnitudeSummary(rows.flatMap(row => row.magnitude === null ? [] : [row.magnitude]));

  return (
    <div className="sources-grid">
      <div className="sources-card">
        <span className="section-kicker">CONTRASTE EN VIVO</span>
        <h3>Varias agencias, un mismo sismo</h3>
        {rows.length > 0 ? (
          <table className="sources-table">
            <caption className="sr-only">Magnitud, profundidad y hora de este sismo según cada agencia</caption>
            <thead><tr><th scope="col">Agencia</th><th scope="col">Magnitud</th><th scope="col">Profundidad</th><th scope="col">Hora local</th><th scope="col"><span className="sr-only">Enlace</span></th></tr></thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id}>
                  <th scope="row" data-label="Agencia">{row.agency}{row.reviewed !== null && <small className={row.reviewed ? "ok" : ""}>{row.reviewed ? "✓ Revisado" : "Automático"}</small>}</th>
                  <td data-label="Magnitud"><strong>{row.magnitude === null ? "—" : `M ${row.magnitude.toFixed(1)}`}</strong>{row.magType && <small>{row.magType}</small>}</td>
                  <td data-label="Profundidad">{row.depthKm === null ? "—" : `${Math.round(row.depthKm)} km`}</td>
                  <td data-label="Hora local">{clock.format(new Date(row.time))}</td>
                  <td className="source-link"><a href={row.url} target="_blank" rel="noopener noreferrer" aria-label={`Ver el evento en ${row.agency}`}>Ver <span aria-hidden="true">↗</span></a></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="sources-empty" role="status">{failed ? "No se pudo consultar las otras agencias en este momento. Puedes revisar sus catálogos directamente:" : "Consultando agencias…"}</p>
        )}
        {rows.length === 0 && failed && <div className="emergency-links">{CATALOGS.map(item => <a key={item.name} href={item.url} target="_blank" rel="noopener noreferrer">{item.name} <span aria-hidden="true">↗</span></a>)}</div>}
        {summary && <p className="sources-summary"><strong>{summary}</strong> Es normal que difieran unas décimas: cada red usa sus propias estaciones y métodos, y las cifras se afinan con las horas.</p>}
        {rows.length === 1 && !failed && <p className="sources-summary">Las otras agencias aún no publican este evento o no respondieron.</p>}
      </div>

      <div className="sources-card">
        <span className="section-kicker">DÓNDE INFORMARSE</span>
        <h3>Fuentes oficiales y de ayuda</h3>
        <ul className="official-list">
          {OFFICIAL.map(item => (
            <li key={item.name}>
              <a href={item.url} target="_blank" rel="noopener noreferrer">
                <span className="official-tag">{item.tag}</span>
                <strong>{item.name} <span aria-hidden="true">↗</span></strong>
                <span>{item.role}</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
