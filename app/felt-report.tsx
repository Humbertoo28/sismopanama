"use client";

import { Check, LocateFixed, MapPin, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Earthquake } from "../lib/earthquakes";
import { INTENSITIES, PLACE_INDEX, nearestPlace, placeTitle, type Intensity } from "../lib/felt-reports";
import { PLACES, type Place } from "../lib/places";
import { agoLabel } from "../lib/quake-facts";
import { placeTitle as quakePlace } from "../lib/quake-summary";

// Formulario «¿Lo sentiste?»: tres preguntas cortas, una debajo de otra (lo sentiste, con qué fuerza, dónde estabas). La
// localidad se elige de una lista: nunca se pide ni se guarda la ubicación exacta. El último lugar elegido se recuerda en el
// equipo para no escribirlo cada vez, y también qué sismos ya se reportaron desde aquí.

const PLACE_KEY = "sismo_panama_report_place_v1";
const SENT_KEY = "sismo_panama_reported_v1";

const clock = new Intl.DateTimeFormat("es-PA", { timeZone: "America/Panama", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", hour12: true });
const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const SEARCH = PLACES.map(place => ({ place, key: fold(place.name), full: fold(placeTitle(place)) }));

function readSent(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(SENT_KEY) ?? "[]");
    return Array.isArray(list) ? list.filter(item => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function alreadyReported(event: Earthquake) {
  const sent = readSent();
  return [event.id, ...(event.properties.aliases ?? [])].some(id => sent.includes(id));
}

function remember(event: Earthquake) {
  try {
    const ids = [event.id, ...(event.properties.aliases ?? [])];
    localStorage.setItem(SENT_KEY, JSON.stringify([...new Set([...ids, ...readSent()])].slice(0, 300)));
  } catch {
    // Sin almacenamiento solo se pierde el aviso de «ya lo reportaste»; el servidor igual evita los duplicados.
  }
}

export default function FeltReport({ event, onClose }: { event: Earthquake; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  const [felt, setFelt] = useState<boolean | null>(null);
  const [intensity, setIntensity] = useState<Intensity | null>(null);
  const [place, setPlace] = useState<Place | null>(() => {
    try {
      return PLACE_INDEX.get(localStorage.getItem(PLACE_KEY) ?? "") ?? null;
    } catch {
      return null;
    }
  });
  const [query, setQuery] = useState("");
  const [state, setState] = useState<"form" | "sending" | "done" | "error">(() => (alreadyReported(event) ? "done" : "form"));
  const [message, setMessage] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [locateNote, setLocateNote] = useState<string | null>(null);

  // «Usar mi ubicación»: el GPS solo sirve para elegir la localidad más cercana aquí mismo, en el teléfono. La posición no se
  // envía ni se guarda: al servidor llega solo la localidad, igual que si la persona la hubiera escrito.
  const locate = () => {
    if (!("geolocation" in navigator)) {
      setLocateNote("Tu navegador no puede dar la ubicación. Escribe tu localidad abajo.");
      return;
    }
    setLocating(true);
    setLocateNote(null);
    navigator.geolocation.getCurrentPosition(
      position => {
        setLocating(false);
        const found = nearestPlace(position.coords.latitude, position.coords.longitude);
        if (!found || found.km > 40) {
          setLocateNote("No encontramos una localidad de Panamá cerca de ti. Escríbela abajo.");
          return;
        }
        setPlace(found.place);
        setLocateNote(`Encontramos la localidad más cercana, a unos ${Math.max(1, Math.round(found.km))} km. Si no es correcta, toca «Cambiar».`);
      },
      error => {
        setLocating(false);
        setLocateNote(error.code === error.PERMISSION_DENIED ? "No se dio permiso para usar la ubicación. Escribe tu localidad abajo." : "No se pudo obtener la ubicación. Escribe tu localidad abajo.");
      },
      { enableHighAccuracy: false, timeout: 12_000, maximumAge: 10 * 60_000 },
    );
  };

  const matches = useMemo(() => {
    const q = fold(query.trim());
    if (q.length < 2) return [];
    const starts = SEARCH.filter(item => item.key.startsWith(q));
    const contains = SEARCH.filter(item => !item.key.startsWith(q) && item.full.includes(q));
    return [...starts, ...contains].slice(0, 8).map(item => item.place);
  }, [query]);

  // Foco dentro de la ventana mientras está abierta: Escape la cierra y Tab no se sale de ella.
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const node = panel.current;
    node?.focus({ preventScroll: true });
    const onKey = (key: KeyboardEvent) => {
      if (key.key === "Escape") {
        key.stopImmediatePropagation();
        closeRef.current();
      } else if (key.key === "Tab" && node) {
        const items = [...node.querySelectorAll<HTMLElement>('button:not([disabled]), input, a[href]')];
        if (!items.length) return;
        const [first, last] = [items[0], items[items.length - 1]];
        if (key.shiftKey && (document.activeElement === first || document.activeElement === node)) {
          key.preventDefault();
          last.focus();
        } else if (!key.shiftKey && document.activeElement === last) {
          key.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      before?.focus?.({ preventScroll: true });
    };
  }, []);

  const ready = felt !== null && (!felt || intensity !== null) && place !== null;
  const send = async () => {
    if (!ready || !place) return;
    setState("sending");
    setMessage(null);
    try {
      localStorage.setItem(PLACE_KEY, place.id);
    } catch {
      // Sin almacenamiento la próxima vez se vuelve a escribir el lugar.
    }
    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: event.id, felt, intensity: felt ? intensity : null, placeId: place.id }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string; duplicate?: boolean };
      if (response.ok || data.duplicate) {
        remember(event);
        setState("done");
        return;
      }
      setMessage(data.error ?? "No se pudo enviar tu reporte. Inténtalo de nuevo.");
      setState("error");
    } catch {
      setMessage("Sin conexión. Revisa tu internet e inténtalo de nuevo.");
      setState("error");
    }
  };

  const mag = event.properties.mag === null ? "—" : event.properties.mag.toFixed(1);

  return (
    <div className="report-backdrop" onClick={click => click.target === click.currentTarget && onClose()}>
      <div ref={panel} className="report-card" role="dialog" aria-modal="true" aria-labelledby="report-title" tabIndex={-1}>
        <header className="report-head">
          <div>
            <h2 id="report-title">¿Sentiste este sismo?</h2>
            <p>Magnitud {mag} · {quakePlace(event)} · {clock.format(new Date(event.properties.time))} ({agoLabel(event.properties.time)})</p>
          </div>
          <button type="button" className="report-close" onClick={onClose} aria-label="Cerrar"><X size={22} aria-hidden="true" /></button>
        </header>

        {state === "done" ? (
          <div className="report-done" role="status">
            <span className="report-done-icon" aria-hidden="true"><Check size={30} /></span>
            <h3>¡Gracias por tu reporte!</h3>
            <p>Ayuda a saber hasta dónde y con qué fuerza se sintió. Los reportes se ven agrupados por localidad, sin datos tuyos.</p>
            <div className="report-actions">
              <a className="btn btn-primary" href={`/reportes?sismo=${encodeURIComponent(event.id)}`}>Ver los reportes</a>
              <button type="button" className="btn btn-secondary" onClick={onClose}>Cerrar</button>
            </div>
          </div>
        ) : (
          <div className="report-body">
            <fieldset className="report-step">
              <legend>1. ¿Lo sentiste?</legend>
              <div className="report-choices two">
                <button type="button" aria-pressed={felt === true} className={felt === true ? "on" : ""} onClick={() => setFelt(true)}>Sí, lo sentí</button>
                <button type="button" aria-pressed={felt === false} className={felt === false ? "on" : ""} onClick={() => { setFelt(false); setIntensity(null); }}>No lo sentí</button>
              </div>
            </fieldset>

            {felt && (
              <fieldset className="report-step">
                <legend>2. ¿Con qué fuerza?</legend>
                <div className="report-choices">
                  {INTENSITIES.map(item => (
                    <button key={item.value} type="button" aria-pressed={intensity === item.value} className={`report-level level-${item.value}${intensity === item.value ? " on" : ""}`} onClick={() => setIntensity(item.value)}>
                      <strong>{item.name}</strong>
                      <span>{item.detail}</span>
                    </button>
                  ))}
                </div>
              </fieldset>
            )}

            {felt !== null && (
              <fieldset className="report-step">
                <legend>{felt ? "3." : "2."} ¿Dónde estabas?</legend>
                {place ? (
                  <>
                  <div className="report-place">
                    <MapPin size={20} aria-hidden="true" />
                    <strong>{placeTitle(place)}</strong>
                    <button type="button" className="btn btn-quiet" onClick={() => { setPlace(null); setQuery(""); setLocateNote(null); }}>Cambiar</button>
                  </div>
                  {locateNote && <p className="report-note" role="status">{locateNote}</p>}
                  </>
                ) : (
                  <div className="report-search">
                    <button type="button" className="btn btn-secondary report-locate" onClick={locate} disabled={locating}>
                      <LocateFixed size={20} aria-hidden="true" /> {locating ? "Buscando tu localidad…" : "Usar mi ubicación"}
                    </button>
                    {locateNote && <p className="report-note" role="status">{locateNote}</p>}
                    <label htmlFor="report-place-input">O escribe tu ciudad, pueblo o corregimiento</label>
                    <input
                      id="report-place-input" type="search" autoComplete="off" value={query} onChange={change => setQuery(change.target.value)}
                      placeholder="Por ejemplo: Chitré" aria-controls="report-place-list" aria-describedby="report-place-note"
                    />
                    {matches.length > 0 && (
                      <ul id="report-place-list" className="report-matches">
                        {matches.map(item => (
                          <li key={item.id}><button type="button" onClick={() => setPlace(item)}><strong>{item.name}</strong><span>{placeTitle(item)}</span></button></li>
                        ))}
                      </ul>
                    )}
                    {query.trim().length >= 2 && matches.length === 0 && <p className="report-note">No encontramos ese lugar. Prueba con el pueblo o la ciudad más cercana.</p>}
                    <p id="report-place-note" className="report-note">Solo se guarda la localidad, nunca tu ubicación exacta: si usas el GPS, la posición se queda en tu teléfono.</p>
                  </div>
                )}
              </fieldset>
            )}

            {message && <p className="report-error" role="alert">{message}</p>}
            <div className="report-actions">
              <button type="button" className="btn btn-primary" disabled={!ready || state === "sending"} onClick={send}>
                {state === "sending" ? "Enviando…" : "Enviar mi reporte"}
              </button>
              <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            </div>
            <p className="report-note">Es un reporte de personas, no una medición. Para avisos oficiales, sigue a SINAPROC.</p>
          </div>
        )}
      </div>
    </div>
  );
}
