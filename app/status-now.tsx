"use client";

import { ChevronRight, ExternalLink, MapPin, MessageCircle, MessageSquareText, Phone, RefreshCw, Share2, WifiOff } from "lucide-react";
import CountUp from "./count-up";
import { getWhatsAppShareUrl } from "../lib/alert-system";
import { isAftershock, isUnconfirmed, type Earthquake, type EarthquakeResponse, type MainshockResponse } from "../lib/earthquakes";
import { provinceLabel } from "../lib/province-of";
import { SOURCE_NAMES, agoLabel, reportUrl } from "../lib/quake-facts";
import { placeTitle } from "../lib/quake-summary";

// Lo primero que se ve al abrir la página: cuál fue el último sismo, en qué va la secuencia del sismo principal y qué hacer.
// Pensado para leerse de un vistazo en el celular, también por personas mayores: letra grande, frases completas, sin siglas.

const dateTime = new Intl.DateTimeFormat("es-PA", {
  timeZone: "America/Panama", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", hour12: true,
});
const clock = new Intl.DateTimeFormat("es-PA", { timeZone: "America/Panama", hour: "numeric", minute: "2-digit", hour12: true });

// "a la 1:06 p. m." pero "a las 2:06 p. m.".
function atTime(time: number) {
  const text = clock.format(new Date(time));
  return `${text.startsWith("1:") ? "a la" : "a las"} ${text}`;
}

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
const INTENSITY = ["No sentido", "Débil", "Débil", "Ligera", "Moderada", "Fuerte", "Muy fuerte", "Severa", "Violenta", "Extrema", "Extrema", "Extrema"];
const PAGER: Record<string, string> = { green: "Verde (bajo)", yellow: "Amarillo (moderado)", orange: "Naranja (alto)", red: "Rojo (muy alto)" };

function magText(event: Earthquake) {
  return event.properties.mag === null ? "—" : event.properties.mag.toFixed(1);
}

function depthText(event: Earthquake) {
  const depth = event.geometry.coordinates[2];
  return Number.isFinite(depth) ? `${Math.round(depth!)} km` : "No disponible";
}

// Un sismo de la última hora lleva un pulso suave alrededor de su magnitud.
function isFresh(time: number) {
  return Date.now() - time < 60 * 60_000;
}

// Nivel de color de la magnitud: el rojo se reserva para lo que de verdad es fuerte.
function magLevel(mag: number | null) {
  if (mag === null || mag < 4) return "low";
  return mag < 6 ? "mid" : "high";
}

type Props = {
  latest: Earthquake | null;
  main: Earthquake | null;
  mainshock: MainshockResponse | null;
  status: "loading" | "ready" | "error";
  lastUpdate: string | null;
  catalogs: EarthquakeResponse["catalogs"];
  shared: boolean;
  onShowOnMap: (event: Earthquake) => void;
  onShare: (event: Earthquake) => void;
  onRefresh: () => void;
  onReport: (event: Earthquake) => void;
};

export default function StatusNow({ latest, main, mainshock, status, lastUpdate, catalogs, shared, onShowOnMap, onShare, onRefresh, onReport }: Props) {
  const isMain = Boolean(latest && main && latest.id === main.id);
  // Si el último sismo es posterior al sismo principal, es la última réplica (igual que en los gráficos y en la lista).
  const isAfter = Boolean(latest && main && !isMain && !latest.properties.nearby && isAftershock(latest, main));
  const source = SOURCE_NAMES[latest?.properties.source ?? "usgs"];
  const preliminary = latest?.properties.status !== "reviewed";
  const down = catalogs ? (Object.keys(SOURCE_NAMES) as (keyof typeof SOURCE_NAMES)[]).filter(name => !catalogs[name]).map(name => SOURCE_NAMES[name]) : [];
  const mmi = main?.properties.mmi;
  const felt = main?.properties.felt;
  const pager = main?.properties.alert ? PAGER[main.properties.alert] : undefined;
  const mainUrl = reportUrl(main);
  const strongest = mainshock?.aftershocks.strongest;

  return (
    <section className="now" aria-labelledby="now-title">
      <div className="now-head">
        <h1 id="now-title">Sismos en Panamá</h1>
        {!(status === "error" && !lastUpdate) && (
          <p className="now-updated" role="status" aria-live="polite" suppressHydrationWarning>
            <i className={`now-dot${status === "loading" ? " busy" : ""}`} aria-hidden="true" suppressHydrationWarning />
            {status === "loading" && !lastUpdate ? "Consultando los datos…" : `Actualizado ${lastUpdate ? atTime(Date.parse(lastUpdate)) : ""} · se actualiza solo`}
          </p>
        )}
        <button type="button" className="now-refresh" onClick={onRefresh} disabled={status === "loading"} aria-label="Actualizar ahora">
          <RefreshCw aria-hidden="true" size={18} className={status === "loading" ? "spin" : undefined} />
          <span>Actualizar</span>
        </button>
        {down.length > 0 && (
          <p className="now-warning">{down.join(" y ")} no {down.length === 1 ? "responde" : "responden"} en este momento: puede haber retraso en los datos.</p>
        )}
      </div>

      <div className="now-grid">
        <article className="now-card now-latest" aria-labelledby="latest-title">
          {latest ? (
            <div className="now-latest-body" key={latest.id}>
              <p className="now-label">{isMain ? "Sismo principal" : isAfter ? "Última réplica registrada" : "Último sismo registrado"} · <strong>{agoLabel(latest.properties.time)}</strong></p>
              <div className="now-quake">
                <div className={`now-mag ${magLevel(latest.properties.mag)}${isFresh(latest.properties.time) ? " fresh" : ""}`}>
                  <strong>{latest.properties.mag === null ? "—" : <CountUp value={latest.properties.mag} from={0} decimals={1} duration={900} />}</strong>
                  <span>magnitud</span>
                </div>
                <div className="now-place">
                  <h2 id="latest-title">{placeTitle(latest)}</h2>
                  <p>{provinceLabel(latest)}</p>
                  {isUnconfirmed(latest) && <p className="now-unconfirmed">Sin confirmar: solo lo publica el EMSC; el IGC y el USGS no lo registran.</p>}
                </div>
              </div>
              <dl className="now-facts">
                <div><dt>Fecha y hora</dt><dd suppressHydrationWarning>{dateTime.format(new Date(latest.properties.time))}</dd></div>
                <div><dt>Profundidad</dt><dd>{depthText(latest)}</dd></div>
                <div>
                  <dt>Fuente</dt>
                  <dd><a href={reportUrl(latest)} target="_blank" rel="noopener noreferrer">{source}<ExternalLink aria-hidden="true" size={14} /><span className="sr-only"> (se abre en otra pestaña)</span></a>{preliminary ? " · dato preliminar" : " · revisado"}</dd>
                </div>
              </dl>
              <div className="now-actions">
                <button type="button" className="btn btn-primary" onClick={() => onShowOnMap(latest)}>
                  <MapPin aria-hidden="true" size={20} /> Ver en el mapa
                </button>
                <a className="btn btn-secondary" href={getWhatsAppShareUrl(latest, typeof window !== "undefined" ? window.location.href : "")} target="_blank" rel="noopener noreferrer">
                  <MessageCircle aria-hidden="true" size={20} /> Enviar por WhatsApp
                </a>
                <button type="button" className="btn btn-secondary" onClick={() => onReport(latest)}>
                  <MessageSquareText aria-hidden="true" size={20} /> ¿Lo sentiste? Repórtalo
                </button>
                <button type="button" className="btn btn-quiet" onClick={() => onShare(latest)} aria-live="polite">
                  <Share2 aria-hidden="true" size={18} /> {shared ? "Enlace copiado" : "Compartir"}
                </button>
              </div>
            </div>
          ) : status === "error" ? (
            <div className="now-error" role="alert">
              <span className="now-error-icon" aria-hidden="true"><WifiOff size={34} /></span>
              <h2>No se pudieron consultar los datos.</h2>
              <p>Revisa tu conexión.</p>
              <button type="button" className="btn btn-primary" onClick={onRefresh}>
                <RefreshCw aria-hidden="true" size={20} /> Volver a intentar
              </button>
            </div>
          ) : (
            <div className="now-skeleton" aria-label="Cargando el último sismo"><i /><span /><span /></div>
          )}
        </article>

        <aside className="now-side">
          <a className="now-help" href="#recomendaciones">
            <span>
              <strong>¿Qué hago si vuelve a temblar?</strong>
              <small>Guía rápida de seguridad</small>
            </span>
            <ChevronRight aria-hidden="true" size={26} />
          </a>
          <a className="now-emergency" href="tel:911">
            <Phone aria-hidden="true" size={24} />
            <span>
              <strong>Emergencias: 911</strong>
              <small>Solo si hay peligro para la vida</small>
            </span>
          </a>
        </aside>
      </div>

      {main && (
        <article className="now-card now-sequence" aria-labelledby="sequence-title">
          <div className="now-sequence-head">
            <div>
              <h2 id="sequence-title">El terremoto de magnitud {magText(main)} del 9 de octubre</h2>
              <p suppressHydrationWarning>
                {dateTime.format(new Date(main.properties.time))} ({agoLabel(main.properties.time)}). {placeTitle(main)}, a {depthText(main)} de profundidad.
              </p>
            </div>
            <div className="now-sequence-links">
              {!isMain && (
                <button type="button" className="btn btn-secondary btn-small" onClick={() => onShowOnMap(main)}>
                  <MapPin aria-hidden="true" size={18} /> Ver en el mapa
                </button>
              )}
              <a className="btn btn-secondary btn-small" href={mainUrl} target="_blank" rel="noopener noreferrer">
                Informe del USGS <ExternalLink aria-hidden="true" size={16} /><span className="sr-only"> (se abre en otra pestaña)</span>
              </a>
            </div>
          </div>
          <dl className="now-stats">
            <div>
              <dt>Réplicas desde entonces</dt>
              <dd>{mainshock ? <CountUp value={mainshock.aftershocks.count} from={0} /> : "—"}</dd>
              {strongest && <small>La más fuerte: magnitud {magText(strongest)}</small>}
            </div>
            {typeof mmi === "number" && (
              <div>
                <dt>Intensidad máxima</dt>
                <dd>{ROMAN[Math.min(12, Math.max(1, Math.round(mmi))) - 1]} · {INTENSITY[Math.min(12, Math.max(1, Math.round(mmi))) - 1]}</dd>
                <small>Estimada por el USGS</small>
              </div>
            )}
            {typeof felt === "number" && (
              <div>
                <dt>Personas que lo reportaron</dt>
                <dd><CountUp value={felt} from={0} /></dd>
                <small>{mainUrl.includes("/eventpage/") ? <a href={`${mainUrl}/tellus`} target="_blank" rel="noopener noreferrer">¿Lo sentiste? Repórtalo</a> : "Reportes al USGS"}</small>
              </div>
            )}
            {pager && (
              <div>
                <dt>Nivel de daños estimado</dt>
                <dd>{pager}</dd>
                <small>Alerta PAGER del USGS</small>
              </div>
            )}
          </dl>
        </article>
      )}

      <p className="now-note">
        Datos del USGS, del Instituto de Geociencias de la Universidad de Panamá y del EMSC. Las cifras se revisan y pueden cambiar.
        Esta página no reemplaza los avisos oficiales de <a href="https://www.sinaproc.gob.pa/" target="_blank" rel="noopener noreferrer">SINAPROC</a>.
      </p>

      <nav className="now-more" aria-label="Más información">
        <a href="/analisis">Gráficos de la secuencia <ChevronRight aria-hidden="true" size={18} /></a>
        <a href="/noticias">Noticias oficiales <ChevronRight aria-hidden="true" size={18} /></a>
        <a href="/reportes">Reportes de quienes lo sintieron <ChevronRight aria-hidden="true" size={18} /></a>
        <a href="/historia">Sismos históricos en Panamá <ChevronRight aria-hidden="true" size={18} /></a>
        <a href="/resumen">Resumen en texto sencillo <ChevronRight aria-hidden="true" size={18} /></a>
      </nav>
    </section>
  );
}
