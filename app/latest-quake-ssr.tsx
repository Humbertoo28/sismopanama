import { MAINSHOCK_ID, isAftershock, isUnconfirmed, type Earthquake } from "../lib/earthquakes";
import { provinceLabel } from "../lib/province-of";
import { SOURCE_NAMES, reportUrl } from "../lib/quake-facts";
import { placeTitle } from "../lib/quake-summary";

// El último sismo, dibujado en el servidor con los mismos datos y el mismo diseño que la tarjeta de «Último sismo» de la portada
// (status-now.tsx), sin sus botones ni animaciones. Se ve mientras el navegador consulta los datos en vivo y, si esa consulta falla,
// se queda con la fecha y la hora del sismo a la vista. Así la portada llega con el sismo real y no con un esqueleto vacío.

const dateTime = new Intl.DateTimeFormat("es-PA", {
  timeZone: "America/Panama", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", hour12: true,
});

function magLevel(mag: number | null) {
  if (mag === null || mag < 4) return "low";
  return mag < 6 ? "mid" : "high";
}

export default function LatestQuakeSsr({ events }: { events: Earthquake[] }) {
  const latest = events.reduce<Earthquake | null>((best, event) => (!best || event.properties.time > best.properties.time ? event : best), null);
  if (!latest) return null;
  const main = events.find(event => event.id === MAINSHOCK_ID || event.properties.aliases?.includes(MAINSHOCK_ID)) ?? null;
  const isMain = Boolean(main && latest.id === main.id);
  const isAfter = Boolean(main && !isMain && !latest.properties.nearby && isAftershock(latest, main));
  const depth = latest.geometry.coordinates[2];
  const source = SOURCE_NAMES[latest.properties.source ?? "usgs"];

  return (
    <div className="now-latest-body">
      <p className="now-label">{isMain ? "Sismo principal" : isAfter ? "Última réplica registrada" : "Último sismo registrado"}</p>
      <div className="now-quake">
        <div className={`now-mag ${magLevel(latest.properties.mag)}`}>
          <strong>{latest.properties.mag === null ? "—" : latest.properties.mag.toFixed(1)}</strong>
          <span>magnitud</span>
        </div>
        <div className="now-place">
          <h2 id="latest-title">{placeTitle(latest)}</h2>
          <p>{provinceLabel(latest)}</p>
          {isUnconfirmed(latest) && <p className="now-unconfirmed">Sin confirmar: solo lo publica el EMSC; el IGC y el USGS no lo registran.</p>}
        </div>
      </div>
      <dl className="now-facts">
        <div><dt>Fecha y hora</dt><dd>{dateTime.format(new Date(latest.properties.time))}</dd></div>
        <div><dt>Profundidad</dt><dd>{Number.isFinite(depth) ? `${Math.round(depth!)} km` : "No disponible"}</dd></div>
        <div>
          <dt>Fuente</dt>
          <dd><a href={reportUrl(latest)} target="_blank" rel="noopener noreferrer">{source}</a>{latest.properties.status !== "reviewed" ? " · dato preliminar" : " · revisado"}</dd>
        </div>
      </dl>
    </div>
  );
}
