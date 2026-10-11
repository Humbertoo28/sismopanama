"use client";

import { useEffect, useState } from "react";
import type { EarthquakeResponse } from "../../lib/earthquakes";
import { buildSummary, summaryToText, type QuakeSummary } from "../../lib/quake-summary";
import Downloads from "./downloads";

// Misma cadencia que la página principal: la consulta cae casi siempre en la caché de la red, y se pausa con la pestaña oculta.
const POLL_MS = 35_000;

export default function LiveSummary({ initial }: { initial: QuakeSummary | null }) {
  const [summary, setSummary] = useState(initial);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let stopped = false;
    let controller: AbortController | null = null;
    const load = async () => {
      controller?.abort();
      const mine = new AbortController();
      controller = mine;
      const timeout = window.setTimeout(() => mine.abort(), 30_000);
      try {
        const response = await fetch("/api/earthquakes", { signal: mine.signal });
        if (!response.ok) throw new Error(`Error ${response.status}`);
        const data = (await response.json()) as EarthquakeResponse;
        if (!Array.isArray(data.features) || data.features.length === 0) throw new Error("Respuesta vacía");
        if (stopped) return;
        setSummary(buildSummary(data.features, Date.now(), { dataTime: Date.parse(data.fetchedAt) || Date.now(), catalogs: data.catalogs }));
        setFailed(false);
      } catch {
        if (!stopped && !mine.signal.aborted) setFailed(true);
      } finally {
        window.clearTimeout(timeout);
      }
    };
    void load();
    const timer = window.setInterval(() => { if (!document.hidden) void load(); }, POLL_MS);
    const onVisible = () => { if (!document.hidden) void load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      controller?.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (!summary) {
    return <p className="rs-card" role="status">{failed ? "No se pudo consultar los catálogos de sismos en este momento. Se vuelve a intentar sola; también puedes consultar los avisos oficiales de SINAPROC." : "Consultando los catálogos de sismos…"}</p>;
  }
  return (
    <>
      <p className="rs-updated">{summary.updated}. Se actualiza sola cada 35 segundos mientras tengas la página abierta.</p>
      {failed && <p className="rs-card rs-warn" role="status">No se pudo actualizar ahora. Se muestra la última información recibida; se vuelve a intentar sola.</p>}
      {summary.sections.map((section, index) => (
        <section key={section.heading} className="rs-card" aria-labelledby={`rs-s${index}`}>
          <h2 id={`rs-s${index}`}>{section.heading}</h2>
          {section.ordered ? (
            <ol>{section.lines.map((line, i) => <li key={i}>{line}</li>)}</ol>
          ) : section.lines.length === 1 ? (
            // Solo el último sismo se anuncia a los lectores de pantalla cuando cambia (un sismo nuevo); el resto se actualiza en silencio.
            <p aria-live={index === 0 ? "polite" : undefined}>{section.lines[0]}</p>
          ) : (
            <ul>{section.lines.map((line, i) => <li key={i}>{line}</li>)}</ul>
          )}
        </section>
      ))}
      <Downloads text={summaryToText(summary)} />
    </>
  );
}
