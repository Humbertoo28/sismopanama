import type { Metadata } from "next";
import Link from "next/link";
import PageHeader from "../page-header";
import { HISTORY_MIN_MAG, HISTORY_REVALIDATE_SECONDS, buildHistory, formatDateUTC, formatMag, historyUrl, parseHistory, placeEs, yearsBetween, type HistoricQuake, type HistorySummary } from "../../lib/history";
import { PANAMA_CITY, PLACES } from "../../lib/places";
import { pageSocial } from "../../lib/site";
import { BreadcrumbStructuredData } from "../structured-data";
import HistoryExplorer from "./explorer";
import { outlinePath } from "./frame";
import TopMap from "./top-map";
import "./historia.css";

const TITLE = "Historia sísmica de Panamá: sismos grandes desde 1900";
const DESCRIPTION =
  "Los sismos de magnitud 6 o más que el USGS ha registrado en Panamá desde 1900, dónde ocurrieron y cómo se compara con ellos el sismo de octubre de 2026.";

export const metadata: Metadata = {
  title: TITLE, // el sitio añade "| Ojo Panamá"
  description: DESCRIPTION,
  ...pageSocial(`${TITLE} | Ojo Panamá`, DESCRIPTION, "/historia", true),
};

// El catálogo histórico casi no cambia: se guarda en la caché de la red y se vuelve a pedir cada media hora.
// Next exige un número escrito aquí (no una constante importada): 1800 s = HISTORY_REVALIDATE_SECONDS en lib/history.ts.
export const revalidate = 1800;

const when = formatDateUTC;
const year = (time: number) => new Date(time).getUTCFullYear();
const mag = formatMag;

// Ciudades de referencia del mapa (con las coordenadas de GeoNames, CC BY 4.0): la capital y las capitales de provincia más cercanas a donde ocurrieron
// los sismos. La capital se toma de su propia ficha de GeoNames (PANAMA_CITY en lib/places.ts), no del centro del distrito.
const CITY_IDS = ["3711668", "3701117", "3712076", "3712384", "3712560", "3707058"];
const CITIES = [
  PANAMA_CITY,
  ...CITY_IDS.flatMap(id => {
    const place = PLACES.find(item => item.id === id);
    return place ? [{ name: place.name, lat: place.lat, lng: place.lng }] : [];
  }),
];

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
      <BreadcrumbStructuredData trail={[{ name: "Ojo Panamá", path: "/" }, { name: "Historia sísmica", path: "/historia" }]} />
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
  const sinceM7 = main && s.previousM7 ? yearsBetween(s.previousM7.time, main.time) : null;
  // El mapa de los 12 más grandes (fijo): el explorador lo coloca entre las décadas y la tabla.
  const topMap = (
    <section className="hs-card" aria-labelledby="hs-top-map-h">
      <h2 id="hs-top-map-h">Los {s.top.length} más grandes en el mapa</h2>
      <p className="hs-sub">Cada número es el puesto del sismo en la tabla de abajo. Los del suroeste caen muy juntos: se ven también en el acercamiento.</p>
      <TopMap top={s.top} />
      <ul className="hs-legend" aria-label="Leyenda del mapa de los más grandes">
        <li><i className="hs-sw hs-e1" /> 1900–1949</li>
        <li><i className="hs-sw hs-e2" /> 1950–1999</li>
        <li><i className="hs-sw hs-e3" /> 2000–2025</li>
        <li><i className="hs-sw hs-now" /> Secuencia de 2026</li>
      </ul>
    </section>
  );
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

      <HistoryExplorer quakes={panama} outline={outlinePath()} cities={CITIES} topMap={topMap} />

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

      <section className="hs-card hs-source" aria-labelledby="hs-src-h">
        <h2 id="hs-src-h">De dónde salen estos datos</h2>
        <p>
          Catálogo de sismos <strong>ComCat del USGS</strong> (Servicio Geológico de Estados Unidos). Se piden los sismos de magnitud {HISTORY_MIN_MAG} o más desde 1900 dentro del
          recuadro 6° a 10.7° N y 83.8° a 77° O, y se conservan los que el USGS ubica en Panamá. La magnitud es la que publica el USGS para cada sismo.
          Las posiciones y magnitudes de los sismos antiguos son reconstrucciones del USGS y tienen más incertidumbre que las actuales. Las fechas están en hora universal, como las publica el USGS. Todo se calcula directamente
          de esos registros, sin estimaciones; la página se actualiza cada media hora.
        </p>
        <p>
          Lo interactivo (el mapa, la línea de tiempo, las décadas, la tabla y las comparaciones con el sismo de 2026) usa esos mismos registros. Los
          años son años cumplidos entre dos fechas; las distancias entre epicentros se calculan con las posiciones que publica el USGS (distancia sobre la
          esfera terrestre), y los conteos «a 100 km» cuentan sismos de esta misma lista. Los nombres de ciudades del mapa son de GeoNames (CC BY 4.0). No hay estimaciones ni
          pronósticos: los terremotos no se pueden predecir.
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
