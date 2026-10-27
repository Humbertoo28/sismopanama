"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { EarthquakeResponse } from "../../lib/earthquakes";
import { buildSummary, summaryToText, type QuakeSummary } from "../../lib/quake-summary";
import Downloads from "./downloads";

// Misma cadencia que la página principal: la consulta cae casi siempre en la caché de la red, y se pausa con la pestaña oculta.
const POLL_MS = 35_000;
// Si la copia que llega tiene más de esto, se pide otra enseguida (una sola vez por ronda): la red entrega esa copia vieja y a la
// vez renueva la suya, así que la segunda consulta ya trae datos frescos.
const STALE_MS = 45_000;
const RECHECK_MS = 5_000;

function ago(ms: number) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return seconds < 5 ? "hace unos segundos" : `hace ${seconds} segundos`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `hace ${minutes} ${minutes === 1 ? "minuto" : "minutos"}`;
  const hours = Math.round(minutes / 60);
  return `hace ${hours} ${hours === 1 ? "hora" : "horas"}`;
}

let clockNow: number | null = null;

function subscribeClock(onChange: () => void) {
  clockNow = Date.now();
  const tick = window.setInterval(() => {
    clockNow = Date.now();
    onChange();
  }, 5_000);
  return () => window.clearInterval(tick);
}

const getClock = () => clockNow;
const getServerClock = () => null;

export default function LiveSummary({ initial }: { initial: QuakeSummary | null }) {
  const [summary, setSummary] = useState(initial);
  const [failed, setFailed] = useState(false);
  // Instante actual y de la última comprobación: se fijan en el navegador (no en el servidor) para que "hace N segundos" sea cierto.
  const now = useSyncExternalStore(subscribeClock, getClock, getServerClock);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);

  useEffect(() => {
    let stopped = false;
    let controller: AbortController | null = null;
    let rechecked = false;
    let recheckTimer = 0;
    let lastStart = 0;
    const load = async () => {
      lastStart = Date.now();
      controller?.abort();
      const mine = new AbortController();
      controller = mine;
      const timeout = window.setTimeout(() => mine.abort(), 30_000);
      try {
        // Sin caché del navegador: la consulta va a la red (que ya trae su propia copia de hace pocos segundos).
        const response = await fetch("/api/earthquakes", { signal: mine.signal, cache: "no-store" });
        if (!response.ok) throw new Error(`Error ${response.status}`);
        const data = (await response.json()) as EarthquakeResponse;
        if (!Array.isArray(data.features) || data.features.length === 0) throw new Error("Respuesta vacía");
        if (stopped) return;
        const dataTime = Date.parse(data.fetchedAt) || Date.now();
        setSummary(buildSummary(data.features, Date.now(), { dataTime, catalogs: data.catalogs }));
        setCheckedAt(Date.now());
        setFailed(false);
        if (Date.now() - dataTime > STALE_MS && !rechecked) {
          rechecked = true;
          recheckTimer = window.setTimeout(() => void load(), RECHECK_MS);
        } else {
          rechecked = false;
        }
      } catch {
        if (!stopped && !mine.signal.aborted) setFailed(true);
      } finally {
        window.clearTimeout(timeout);
      }
    };
    void load();
    const timer = window.setInterval(() => { if (!document.hidden) void load(); }, POLL_MS);
    // Al volver a ver la pestaña o enfocar la ventana se consulta de inmediato (visibilitychange, focus y pageshow suelen dispararse
    // juntos: la consulta se hace una sola vez).
    const onVisible = () => { if (!document.hidden && Date.now() - lastStart > 2_000) void load(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("pageshow", onVisible);
    return () => {
      stopped = true;
      window.clearTimeout(recheckTimer);
      controller?.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("pageshow", onVisible);
    };
  }, []);

  if (!summary) {
    return <p className="rs-card" role="status">{failed ? "No se pudo consultar los catálogos de sismos en este momento. Se vuelve a intentar sola; también puedes consultar los avisos oficiales de SINAPROC." : "Consultando los catálogos de sismos…"}</p>;
  }
  return (
    <>
      <p className="rs-updated">
        {summary.updated}{now !== null && ` (${ago(now - summary.dataTime)})`}.
        {now !== null && checkedAt !== null && ` Última comprobación ${ago(now - checkedAt)}.`} Se actualiza sola cada 35 segundos mientras tengas la página abierta.
      </p>
      {failed && <p className="rs-card rs-warn" role="status">No se pudo actualizar ahora. Se muestra la última información recibida; se vuelve a intentar sola.</p>}
      {summary.sections.map((section, index) => (
        <section key={section.heading} className="rs-card" aria-labelledby={`rs-s${index}`}>
          <h2 id={`rs-s${index}`}>{section.heading}</h2>
          {section.ordered ? (
            <ol>{section.lines.map((line, i) => <li key={i}>{line}</li>)}</ol>
          ) : section.lines.length === 1 ? (
            // Solo el último sismo se anuncia a los lectores de pantalla cuando cambia (un sismo nuevo); el resto se actualiza en silencio.
            <>
              <p aria-live={index === 0 ? "polite" : undefined}>{section.lines[0]}</p>
              {index === 0 && now !== null && summary.latestTime !== null && <p className="rs-ago">Ocurrió {ago(now - summary.latestTime)}.</p>}
            </>
          ) : (
            <ul>{section.lines.map((line, i) => <li key={i}>{line}</li>)}</ul>
          )}
        </section>
      ))}
      <Downloads text={summaryToText(summary)} />
    </>
  );
}
