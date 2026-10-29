import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PageHeader from "../../page-header";
import { formatDateUTC, formatMag, placeEs } from "../../../lib/history";
import type { Earthquake } from "../../../lib/earthquakes";
import { provinceLabel } from "../../../lib/province-of";
import { PROVINCES } from "../../../lib/provinces";
import { SEQUENCE_START_TEXT, hasContent, loadProvincePages, provinceById, provinceNoun, type ProvinceStats } from "../../../lib/province-pages";
import { SOURCE_NAMES, reportUrl } from "../../../lib/quake-facts";
import { placeTitle } from "../../../lib/quake-summary";
import { SITE_NAME, pageSocial } from "../../../lib/site";
import { BreadcrumbStructuredData } from "../../structured-data";
import { depthText, isoTime, longDate, magLevel, magText, plural, shortDate } from "../format";
import "../sismos.css";

// Se regenera como mucho cada minuto, igual que /resumen. Solo existen las 13 provincias y comarcas: cualquier otra dirección da 404.
export const revalidate = 60;
export const dynamicParams = false;

export function generateStaticParams() {
  return PROVINCES.map(province => ({ provincia: province.id }));
}

type Props = { params: Promise<{ provincia: string }> };

// La descripción lleva las cifras reales de esa provincia (cambian con cada sismo); si no se pudieron consultar, queda una frase fija.
function describe(noun: string, stats: ProvinceStats, liveOk: boolean) {
  const history = stats.historicTotal > 0 ? " y sismos grandes desde 1900" : "";
  if (!liveOk) return `Sismos en ${noun}: último sismo y conteos${history}, con datos del IGC-UP, el USGS y el EMSC.`;
  if (stats.total === 0) return `Los catálogos del IGC-UP, el USGS y el EMSC no registran sismos en ${noun} desde el ${SEQUENCE_START_TEXT}${history ? "; sí hay sismos grandes desde 1900" : ""}.`;
  const mag = stats.strongest?.properties.mag;
  return `${plural(stats.total, "sismo registrado", "sismos registrados")} en ${noun} desde el ${SEQUENCE_START_TEXT}${typeof mag === "number" ? `; el más fuerte, de magnitud ${mag.toFixed(1)}` : ""}. Último sismo, lista${history}.`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const province = provinceById((await params).provincia);
  if (!province) return {};
  const pages = await loadProvincePages();
  const noun = provinceNoun(province);
  const stats = pages.stats[province.id];
  // Sin sismos en la secuencia, el título no promete un «último temblor»: la página solo trae los grandes desde 1900.
  // Con el " | Ojo Panamá" que añade el sitio, Google corta los títulos de más de ~65 caracteres: los nombres largos pierden la cola.
  const candidates = pages.liveOk && stats.total === 0
    ? [`Sismos grandes en ${noun} desde 1900`, `Sismos en ${noun} desde 1900`]
    : [`Sismos en ${noun}: último temblor y cifras`, `Sismos en ${noun}: último temblor`, `Sismos en ${noun}`];
  const title = candidates.find(text => text.length + SITE_NAME.length + 3 <= 65)!;
  const description = describe(noun, stats, pages.liveOk);
  return {
    title, // el sitio añade "| Ojo Panamá"
    description,
    ...pageSocial(`${title} | ${SITE_NAME}`, description, `/sismos/${province.id}`, true),
    // `robots` reemplaza al del sitio completo, así que solo se pone cuando hay que ocultarla.
    ...(hasContent(pages, province.id) ? {} : { robots: { index: false, follow: true } }),
  };
}

function QuakeItem({ event }: { event: Earthquake }) {
  return (
    <li>
      <span className={`pr-badge ${magLevel(event.properties.mag)}`}>{magText(event)}</span>
      <span className="pr-row-text">
        <strong>{placeTitle(event)}</strong>
        <small>{provinceLabel(event)} · {depthText(event)} de profundidad</small>
      </span>
      <time dateTime={isoTime(event.properties.time)}>{shortDate.format(new Date(event.properties.time))}</time>
    </li>
  );
}

export default async function ProvincePage({ params }: Props) {
  const province = provinceById((await params).provincia);
  if (!province) notFound();
  const pages = await loadProvincePages();
  const stats = pages.stats[province.id];
  const noun = provinceNoun(province);
  const latest = stats.latest;
  const down = pages.catalogs ? (["usgs", "igc", "emsc"] as const).filter(key => !pages.catalogs![key]).map(key => key.toUpperCase()) : [];
  const others = PROVINCES.filter(item => item.id !== province.id);

  return (
    <>
      <BreadcrumbStructuredData trail={[{ name: SITE_NAME, path: "/" }, { name: "Sismos por provincia", path: "/sismos" }, { name: province.name, path: `/sismos/${province.id}` }]} />
      <PageHeader current="/sismos" />
      <main className="pr-main">
        <nav className="pr-crumbs" aria-label="Ruta de navegación">
          <Link href="/">Inicio</Link> › <Link href="/sismos">Sismos por provincia</Link> › <span aria-current="page">{province.name}</span>
        </nav>
        <h1>Sismos en {noun}</h1>
        <p className="pr-lead">
          Los sismos registrados en {noun} desde el {SEQUENCE_START_TEXT}, el día del terremoto, según los catálogos del Instituto de Geociencias
          de la Universidad de Panamá (IGC-UP), el USGS y el EMSC. Se cuentan los que ocurren dentro del límite de {province.kind === "comarca" ? "la comarca" : "la provincia"} y en el mar frente a su costa.
        </p>
        {pages.dataTime !== null && <p className="pr-updated">Datos del {longDate.format(new Date(pages.dataTime))} · se renueva sola cada minuto.</p>}

        {!pages.liveOk && (
          <section className="pr-card pr-warn" role="status">
            <p>No se pudieron consultar los catálogos de sismos en este momento, así que aquí no se muestran los de la secuencia actual. Consulta los avisos oficiales de SINAPROC.</p>
          </section>
        )}
        {down.length > 0 && (
          <section className="pr-card pr-warn" role="status">
            <p>En este momento no responde: {down.join(", ")}. Los datos pueden estar incompletos.</p>
          </section>
        )}

        {pages.liveOk && !latest && (
          <section className="pr-card" aria-labelledby="pr-none">
            <h2 id="pr-none">Sin sismos registrados desde el {SEQUENCE_START_TEXT}</h2>
            <p>Los catálogos no registran sismos en {noun} ni en el mar frente a su costa desde el {SEQUENCE_START_TEXT}. Si sentiste un temblor, revisa el <Link href="/">mapa en vivo</Link>: puede haber ocurrido en otra provincia.</p>
          </section>
        )}

        {latest && (
          <section className="pr-card" aria-labelledby="pr-latest">
            <h2 id="pr-latest">Último sismo en {noun}</h2>
            <div className="pr-latest">
              <span className={`pr-badge big ${magLevel(latest.properties.mag)}`}>{magText(latest)}</span>
              <div className="pr-latest-text">
                <strong>{placeTitle(latest)}</strong>
                <span>{provinceLabel(latest)}</span>
                <span>
                  <time dateTime={isoTime(latest.properties.time)}>{longDate.format(new Date(latest.properties.time))}</time> · {depthText(latest)} de profundidad
                </span>
                <span>
                  Fuente: <a href={reportUrl(latest)} target="_blank" rel="noopener noreferrer">{SOURCE_NAMES[latest.properties.source ?? "usgs"]}</a>
                  {latest.properties.status !== "reviewed" ? " · dato preliminar" : " · revisado"}
                </span>
              </div>
            </div>
          </section>
        )}

        {stats.total > 0 && (
          <section className="pr-card" aria-labelledby="pr-figures">
            <h2 id="pr-figures">En cifras</h2>
            <dl className="pr-stats">
              <div><dt>Sismos registrados</dt><dd>{stats.total}</dd></div>
              <div><dt>Últimas 24 horas</dt><dd>{stats.last24h}</dd></div>
              <div><dt>Última hora</dt><dd>{stats.lastHour}</dd></div>
              <div><dt>De magnitud 4 o más</dt><dd>{stats.m4plus}</dd></div>
              <div><dt>De magnitud 5 o más</dt><dd>{stats.m5plus}</dd></div>
              {stats.strongest && (
                <div>
                  <dt>El más fuerte</dt>
                  <dd>
                    M {magText(stats.strongest)}
                    <small>{placeTitle(stats.strongest)} · {shortDate.format(new Date(stats.strongest.properties.time))}</small>
                  </dd>
                </div>
              )}
            </dl>
          </section>
        )}

        {stats.places.length > 0 && (
          <section className="pr-card" aria-labelledby="pr-places">
            <h2 id="pr-places">Dónde ha temblado más</h2>
            <p>La localidad que cita el catálogo para cada sismo; si no cita ninguna, la más cercana dentro de la provincia.</p>
            <ul className="pr-places">
              {stats.places.map(place => (
                <li key={place.name}><span>{place.name}</span><b>{plural(place.count, "sismo", "sismos")}</b></li>
              ))}
            </ul>
          </section>
        )}

        {stats.recent.length > 0 && (
          <section className="pr-card" aria-labelledby="pr-recent">
            <h2 id="pr-recent">{stats.recent.length === 1 ? "El sismo registrado" : `Los ${stats.recent.length} sismos más recientes`}</h2>
            <ol className="pr-list">
              {stats.recent.map(event => <QuakeItem key={event.id} event={event} />)}
            </ol>
            {stats.total > stats.recent.length && <p className="pr-note">Hay {stats.total - stats.recent.length} más. Todos están en el <Link href="/#eventos">listado de la portada</Link>, donde puedes filtrar por provincia.</p>}
          </section>
        )}

        {stats.historicTotal > 0 && (
          <section className="pr-card" aria-labelledby="pr-history">
            <h2 id="pr-history">Sismos grandes desde 1900</h2>
            <p>
              El USGS registra {plural(stats.historicTotal, "sismo de magnitud 6 o más", "sismos de magnitud 6 o más")} en {noun} o frente a su costa desde 1900, sin contar la secuencia actual.
              {stats.historicTotal > stats.historic.length ? ` Los ${stats.historic.length} mayores:` : ""} Las fechas son en hora universal, como las publica el USGS.
            </p>
            <ol className="pr-list">
              {stats.historic.map(quake => (
                <li key={quake.id}>
                  <span className={`pr-badge ${magLevel(quake.mag)}`}>{formatMag(quake.mag)}</span>
                  <span className="pr-row-text">
                    <strong>{placeEs(quake.place)}</strong>
                    <small>{quake.depth === null ? "profundidad sin dato" : `${Math.round(quake.depth)} km de profundidad`}</small>
                  </span>
                  <time dateTime={isoTime(quake.time)}>{formatDateUTC(quake.time)}</time>
                </li>
              ))}
            </ol>
            <p className="pr-note">Más sobre ellos y cómo se compara la secuencia actual, en <Link href="/historia">Historia sísmica de Panamá</Link>.</p>
          </section>
        )}

        <section className="pr-card" aria-labelledby="pr-more">
          <h2 id="pr-more">Más información</h2>
          <ul className="pr-links">
            <li><Link href="/#mapa" prefetch={false}>Mapa en vivo</Link></li>
            <li><Link href="/#recomendaciones" prefetch={false}>Qué hacer si vuelve a temblar</Link></li>
            <li><Link href="/resumen" prefetch={false}>Resumen en texto sencillo</Link></li>
            <li><Link href="/analisis" prefetch={false}>Gráficos de la secuencia</Link></li>
            <li><Link href="/reportes" prefetch={false}>Reportes de quienes lo sintieron</Link></li>
          </ul>
        </section>

        <section className="pr-card" aria-labelledby="pr-others">
          <h2 id="pr-others">Otras provincias y comarcas</h2>
          <ul className="pr-links">
            {others.map(item => (
              <li key={item.id}><Link href={`/sismos/${item.id}`} prefetch={false}>{item.name}</Link></li>
            ))}
          </ul>
        </section>

        <p className="pr-note">
          Cada sismo se asigna a la provincia o comarca donde cae. Si ocurre en el mar, va a la de la localidad que cita el catálogo (por ejemplo, «al sur de Tonosí» es Los Santos) y, si no cita ninguna, a la de la costa más cercana (hasta 90 km); los que quedan más lejos de toda costa no se cuentan en ninguna provincia. Datos del IGC-UP, el USGS y el EMSC, combinados sin duplicados; las magnitudes pueden cambiar cuando las agencias las revisan. Límites de provincias y
          comarcas: © colaboradores de OpenStreetMap (ODbL), vía geoBoundaries; localidades: GeoNames (CC BY 4.0). Esta página no predice sismos ni reemplaza
          los avisos oficiales de <a href="https://www.sinaproc.gob.pa/" target="_blank" rel="noopener noreferrer">SINAPROC</a>. Si hay peligro para la vida, llama al 911.
        </p>
      </main>
    </>
  );
}
