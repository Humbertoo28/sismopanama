"use client";

import { useEffect, useMemo, useRef } from "react";
import { isAftershock, type Earthquake } from "../lib/earthquakes";
import { isRoundDepth } from "../lib/depth";
import { agoLabel, arrivals, depthClass, energyTnt, reportUrl, SOURCE_NAMES } from "../lib/quake-facts";
import { placeLabel } from "../lib/place-of";
import { provinceLabel } from "../lib/province-of";

const dateTime = new Intl.DateTimeFormat("es-PA", {
  timeZone: "America/Panama", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
});

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Ficha completa de un sismo: se abre al tocarlo en el mapa. Lo medido o publicado por los catálogos se presenta tal cual; lo
// que se calcula aquí (energía, tiempo de llegada) lleva su aviso.
export default function QuakeSheet({
  event, mainshock, onClose, onPropagate, onShowOnMap,
}: { event: Earthquake; mainshock: Earthquake | null; onClose: () => void; onPropagate: () => void; onShowOnMap?: () => void }) {
  const panel = useRef<HTMLElement>(null);
  const { properties } = event;
  const [, , depthRaw] = event.geometry.coordinates;
  const depth = Number.isFinite(depthRaw) ? depthRaw! : null;
  const isMain = event.id === mainshock?.id;
  const after = !!mainshock && isAftershock(event, mainshock);
  const facts = useMemo(() => arrivals(event), [event]);
  const agencies = properties.agencies ?? [{ source: properties.source ?? "usgs", mag: properties.mag, magType: properties.magType ?? null }];
  const primary = SOURCE_NAMES[properties.source ?? "usgs"];
  const reviewed = properties.status === "reviewed";

  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  // Foco dentro de la ficha mientras está abierta: Esc la cierra, Tab no se sale de ella y al cerrar el foco vuelve al sismo.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const node = panel.current;
    node?.focus({ preventScroll: true });
    const onKey = (key: KeyboardEvent) => {
      if (key.key === "Escape") {
        key.stopPropagation();
        closeRef.current();
      } else if (key.key === "Tab" && node) {
        const items = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)];
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
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      before?.focus?.();
    };
  }, []);

  const magnitude = properties.mag === null ? "—" : properties.mag.toFixed(1);

  return (
    <div className="qs-backdrop" onClick={onClose}>
      <section ref={panel} className="qs" role="dialog" aria-modal="true" aria-labelledby="qs-title" tabIndex={-1} onClick={click => click.stopPropagation()}>
        <button type="button" className="qs-close" onClick={onClose} aria-label="Cerrar la ficha del sismo">✕</button>
        <header className="qs-head">
          {isMain && <span className="qs-badge main">SISMO PRINCIPAL</span>}
          {!isMain && after && <span className="qs-badge">RÉPLICA DEL SISMO M {mainshock?.properties.mag?.toFixed(1)}</span>}
          <div className="qs-mag-row">
            <strong className="qs-mag" aria-label={`Magnitud ${magnitude}`}>{magnitude}</strong>
            <div>
              <h3 id="qs-title">{properties.place || "Ubicación no especificada"}</h3>
              <p>{provinceLabel(event)} · cerca de {placeLabel(event)}</p>
            </div>
          </div>
        </header>

        <dl className="qs-facts">
          <div>
            <dt>Fecha y hora de Panamá</dt>
            <dd>{dateTime.format(new Date(properties.time))} <span>({agoLabel(properties.time)})</span></dd>
          </div>
          <div>
            <dt>Profundidad</dt>
            <dd>
              {depth === null ? "No disponible" : `${Math.round(depth)} km, ${depthClass(depth)}`}
              {depth !== null && isRoundDepth(depth) && <small>Valor asignado por el catálogo cuando no logra calcularla: es aproximado.</small>}
            </dd>
          </div>
          {properties.mag !== null && (
            <div>
              <dt>Energía liberada, más o menos</dt>
              <dd>
                Equivale a cerca de {energyTnt(properties.mag)}
                <small>Cálculo aproximado con la magnitud (Gutenberg-Richter): sirve para comparar, no es una medición.</small>
              </dd>
            </div>
          )}
          {facts.capital && (
            <div>
              <dt>Distancia</dt>
              <dd>A {Math.round(facts.capital.km)} km de {facts.capital.name}</dd>
            </div>
          )}
          <div>
            <dt>Agencias que lo publicaron</dt>
            <dd>{agencies.map(agency => `${SOURCE_NAMES[agency.source]} M ${agency.mag === null ? "—" : agency.mag.toFixed(1)}`).join(", ")}</dd>
          </div>
          <div>
            <dt>Estado</dt>
            <dd>{reviewed ? `Revisado por ${primary}.` : "Preliminar: la magnitud y la ubicación pueden cambiar."}</dd>
          </div>
        </dl>

        <section className="qs-arrival" aria-labelledby="qs-arrival-title">
          <h4 id="qs-arrival-title">Cuánto tardó en llegar el temblor</h4>
          <ul>
            {facts.list.map(city => (
              <li key={city.name}><span>{city.name} <small>a {Math.round(city.km)} km</small></span><strong>{Math.max(1, Math.round(city.seconds))} s</strong></li>
            ))}
          </ul>
          <p className="qs-note">Tiempo calculado para la sacudida fuerte (onda S) con una velocidad típica de 3.5 km/s: no son registros de sismógrafos.</p>
        </section>

        <div className="qs-actions">
          <button type="button" className="qs-primary" onClick={onPropagate}>Ver cómo se propagó</button>
          {onShowOnMap && <button type="button" className="qs-secondary" onClick={onShowOnMap}>Ver en el mapa</button>}
          <a className="qs-link" href={reportUrl(event)} target="_blank" rel="noopener noreferrer">Ver el reporte en {primary} <span aria-hidden="true">↗</span></a>
        </div>
      </section>
    </div>
  );
}
