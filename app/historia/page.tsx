import type { Metadata } from "next";
import Link from "next/link";
import PageHeader from "../page-header";
import { HISTORY_MIN_MAG, HISTORY_REVALIDATE_SECONDS, buildHistory, formatMag, historyUrl, parseHistory, placeEs, type HistoricQuake, type HistorySummary } from "../../lib/history";
import { pageSocial } from "../../lib/site";
import { BreadcrumbStructuredData } from "../structured-data";
import HistoryMap from "./history-map";
import "./historia.css";

const TITLE = "Historia sísmica de Panamá: sismos grandes desde 1900";
const DESCRIPTION =
  "Los sismos de magnitud 6 o más que el USGS ha registrado en Panamá desde 1900, dónde ocurrieron y cómo se compara con ellos el sismo de octubre de 2026.";

export const metadata: Metadata = {
  title: TITLE, // el sitio añade "| Sismo Panamá"
  description: DESCRIPTION,
  ...pageSocial(`${TITLE} | Sismo Panamá`, DESCRIPTION, "/historia", true),
};

// El catálogo histórico casi no cambia: se guarda en la caché de la red y se vuelve a pedir cada media hora.
// Next exige un número escrito aquí (no una constante importada): 1800 s = HISTORY_REVALIDATE_SECONDS en lib/history.ts.
export const revalidate = 1800;

// Fechas en hora universal, como las publica el USGS: es la fecha que traen todas las referencias (en hora de Panamá, algunos
// sismos ocurrieron la noche anterior).
const date = new Intl.DateTimeFormat("es-PA", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" });
const when = (time: number) => date.format(new Date(time));
const year = (time: number) => new Date(time).getUTCFullYear();
const yearsBetween = (from: number, to: number) => {
  const a = new Date(from);
  const b = new Date(to);
  let years = b.getUTCFullYear() - a.getUTCFullYear();
  if (b.getUTCMonth() < a.getUTCMonth() || (b.getUTCMonth() === a.getUTCMonth() && b.getUTCDate() < a.getUTCDate())) years -= 1;
  return years;
};
const mag = formatMag;
// "mww" → "Mww": el tipo de magnitud que publica el USGS para ese sismo.
const kind = (quake: HistoricQuake) => (quake.magType ? quake.magType.charAt(0).toUpperCase() + quake.magType.slice(1).toLowerCase() : "");

async function loadHistory(): Promise<{ summary: HistorySummary; panama: HistoricQuake[] } | null> {
  try {
    const response = await fetch(historyUrl(), { headers: { Accept: "application/geo+json, application/json" }, next: { revalidate: HISTORY_REVALIDATE_SECONDS } });
    if (!response.ok) throw new Error(`El USGS respondió ${response.status}`);
    const { panama, excluded } = parseHistory(await response.json());
    return panama.length ? { summary: buildHistory(panama, excluded), panama } : null;
  } catch (error) {
    console.error("Historia sísmica no disponible:", error);
    return null;
  }
}

export default async function HistoriaPage() {
  const data = await loadHistory();
  return (
    <>
      <BreadcrumbStructuredData trail={[{ name: "Sismo Panamá", path: "/" }, { name: "Historia sísmica", path: "/historia" }]} />
      <PageHeader current="/historia" />
      <main className="hs-main" id="contenido">
        <h1>Sismos grandes en Panamá desde 1900</h1>
        {data ? <Body summary={data.summary} panama={data.panama} /> : <Unavailable />}
      </main>
    </>
  );
}

function Unavailable() {
  return (
    <section className="hs-card hs-warn" role="status">
      <h2>No se pudo cargar el catálogo histórico</h2>
      <p>El catálogo del USGS no respondió en este momento. Inténtalo de nuevo en unos minutos.</p>
    </section>
  );
}

function Body({ summary: s, panama }: { summary: HistorySummary; panama: HistoricQuake[] }) {
  const main = s.mainshock;
  const maxDecade = Math.max(1, ...s.decades.map(d => d.count));
  const sinceM7 = main && s.previousM7 ? yearsBetween(s.previousM7.time, main.time) : null;
  return (
    <>
      <p className="hs-lead">
        {main
          ? <>El sismo de <strong>M {mag(main.mag)}</strong> del {when(main.time)} {s.rank === 1 ? "es el mayor" : `ocupa el puesto ${s.rank} por magnitud`} de los <strong>{s.total}</strong> sismos de magnitud 6 o más que el USGS ubica en Panamá desde 1900 (el primero de la lista es de {s.firstYear}). Esta página lo pone en contexto con esa historia.</>
          : <>Los <strong>{s.total}</strong> sismos de magnitud 6 o más que el USGS ubica en Panamá desde 1900.</>}
      </p>

      <ul className="hs-tiles" aria-label="Cifras principales">
        <li><strong>{s.total}</strong><span>sismos de M 6 o más en Panamá desde 1900</span></li>
        <li><strong>{s.m7plus}</strong><span>de M 7 o más{main ? ", incluido el de 2026" : ""}</span></li>
        {main && s.rank !== null && <li className="hs-tile-now"><strong>{s.rank}.º</strong><span>puesto por magnitud del sismo de 2026</span></li>}
        {sinceM7 !== null && <li><strong>{sinceM7}</strong><span>años desde el anterior de M 7 o más ({year(s.previousM7!.time)})</span></li>}
      </ul>

      <section className="hs-card" aria-labelledby="hs-map-h">
        <h2 id="hs-map-h">Dónde ocurrieron</h2>
        <p className="hs-sub">Cada círculo es un sismo de M 6 o más; mientras más grande, mayor la magnitud.</p>
        <HistoryMap quakes={panama} />
        <ul className="hs-legend" aria-label="Leyenda del mapa">
          <li><i className="hs-sw hs-e1" /> 1900–1949</li>
          <li><i className="hs-sw hs-e2" /> 1950–1999</li>
          <li><i className="hs-sw hs-e3" /> 2000–2025</li>
          <li><i className="hs-sw hs-now" /> Secuencia de 2026</li>
        </ul>
      </section>

      <section className="hs-card" aria-labelledby="hs-facts-h">
        <h2 id="hs-facts-h">Lo que dicen los registros</h2>
        <ul className="hs-facts">
          {main && s.previousLargest && (
            <li>
              Antes de 2026, el mayor de la lista era de <strong>M {mag(s.previousLargest.mag)}</strong>, el {when(s.previousLargest.time)} ({placeEs(s.previousLargest.place)}). El sismo de 2026 es de <strong>M {mag(main.mag)}</strong>.
            </li>
          )}
          {main && s.previousM7 && (
            <li>
              El último sismo de M 7 o más antes de este fue el {when(s.previousM7.time)} (M {mag(s.previousM7.mag)}, {placeEs(s.previousM7.place)}), hace {sinceM7} años.
            </li>
          )}
          <li>
            La lista tiene {s.m7plus} sismos de M 7 o más, {s.m65to69} de M 6.5 a 6.9 y {s.m6to64} de M 6.0 a 6.4.
          </li>
          {s.currentSequence > 0 && (
            <li>
              La secuencia actual suma {s.currentSequence} {s.currentSequence === 1 ? "sismo" : "sismos"} de M 6 o más en el catálogo del USGS (el principal y {Math.max(0, s.currentSequence - 1)} {s.currentSequence === 2 ? "réplica" : "réplicas"}).
            </li>
          )}
          {s.excludedLargest && (
            <li>
              Quedan fuera {s.excludedCount} sismos de M 6 o más del mismo recuadro que el USGS ubica en Costa Rica o Colombia; el mayor fue de M {mag(s.excludedLargest.mag)} ({when(s.excludedLargest.time)}, {placeEs(s.excludedLargest.place)}).
            </li>
          )}
        </ul>
      </section>

      <section className="hs-card" aria-labelledby="hs-top-h">
        <h2 id="hs-top-h">Los {s.top.length} sismos más grandes</h2>
        <div className="hs-scroll" role="region" aria-label="Tabla de los sismos más grandes" tabIndex={0}>
          <table className="hs-table">
            <caption className="sr-only">Sismos de Panamá ordenados de mayor a menor magnitud, según el catálogo del USGS</caption>
            <thead>
              <tr><th scope="col">Puesto</th><th scope="col">Magnitud</th><th scope="col">Fecha</th><th scope="col">Lugar</th><th scope="col">Profundidad</th></tr>
            </thead>
            <tbody>
              {s.top.map((quake, index) => (
                <tr key={quake.id} className={quake.current ? "hs-row-now" : undefined}>
                  <td>{index + 1}</td>
                  <th scope="row"><strong>M {mag(quake.mag)}</strong>{kind(quake) && <small> {kind(quake)}</small>}</th>
                  <td>{when(quake.time)}{quake.current && <span className="hs-badge">Secuencia actual</span>}</td>
                  <td>{placeEs(quake.place)}</td>
                  <td>{quake.depth === null ? "—" : `${Math.round(quake.depth)} km`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="hs-card" aria-labelledby="hs-dec-h">
        <h2 id="hs-dec-h">Sismos de M 6 o más por década</h2>
        <ol className="hs-decades">
          {s.decades.map(d => (
            <li key={d.decade}>
              <span className="hs-dec-name">{d.decade}s</span>
              <span className="hs-dec-bar" aria-hidden="true"><i className={d.decade === 2020 ? "hs-bar-now" : undefined} style={{ width: `${(d.count / maxDecade) * 100}%` }} /></span>
              <span className="hs-dec-n">{d.count}<span className="sr-only"> sismos</span></span>
              <span className="hs-dec-max">{d.max ? `mayor M ${mag(d.max)}` : ""}</span>
            </li>
          ))}
        </ol>
        <p className="hs-note">La década de 2020 llega solo hasta hoy. Las décadas antiguas dependen de qué tan completo es el registro histórico: el conteo no mide si hoy hay más o menos sismos.</p>
      </section>

      <section className="hs-card hs-source" aria-labelledby="hs-src-h">
        <h2 id="hs-src-h">De dónde salen estos datos</h2>
        <p>
          Catálogo de sismos <strong>ComCat del USGS</strong> (Servicio Geológico de Estados Unidos). Se piden los sismos de magnitud {HISTORY_MIN_MAG} o más desde 1900 dentro del
          recuadro 6° a 10.7° N y 83.8° a 77° O, y se conservan los que el USGS ubica en Panamá. La magnitud es la que publica el USGS para cada sismo.
          Las posiciones y magnitudes de los sismos antiguos son reconstrucciones del USGS y tienen más incertidumbre que las actuales. Las fechas están en hora universal, como las publica el USGS. Todo se calcula directamente
          de esos registros, sin estimaciones; la página se actualiza cada media hora.
        </p>
        <p><a href={historyUrl()} target="_blank" rel="noopener noreferrer">Ver la consulta al USGS (datos originales)</a></p>
      </section>

      <nav className="hs-next" aria-label="Seguir explorando">
        <Link href="/#mapa">Ver el mapa en vivo</Link>
        <Link href="/analisis">Gráficos de la secuencia actual</Link>
        <Link href="/">Panel principal</Link>
      </nav>
    </>
  );
}
