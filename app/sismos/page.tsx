import type { Metadata } from "next";
import Link from "next/link";
import PageHeader from "../page-header";
import { provinceLabel } from "../../lib/province-of";
import { PROVINCES } from "../../lib/provinces";
import { SEQUENCE_START_TEXT, loadProvincePages, provinceNoun } from "../../lib/province-pages";
import { placeTitle } from "../../lib/quake-summary";
import { SITE_NAME, SITE_URL, pageSocial } from "../../lib/site";
import { BreadcrumbStructuredData, jsonLd } from "../structured-data";
import { isoTime, longDate, magText, plural, shortDate } from "./format";
import "./sismos.css";

const TITLE = "Sismos por provincia y comarca en Panamá";
const DESCRIPTION = `El último sismo y los conteos de cada provincia y comarca de Panamá desde el ${SEQUENCE_START_TEXT}, con datos del IGC-UP, el USGS y el EMSC.`;

export const metadata: Metadata = {
  title: TITLE, // el sitio añade "| Ojo Panamá"
  description: DESCRIPTION,
  ...pageSocial(`${TITLE} | ${SITE_NAME}`, DESCRIPTION, "/sismos", true),
};

// Se regenera como mucho cada minuto, igual que las páginas de cada provincia.
export const revalidate = 60;

export default async function ProvincesIndexPage() {
  const pages = await loadProvincePages();
  // Las de más sismos primero; a igualdad, por nombre.
  const ordered = [...PROVINCES].sort((a, b) => pages.stats[b.id].total - pages.stats[a.id].total || a.name.localeCompare(b.name, "es"));

  return (
    <>
      <BreadcrumbStructuredData trail={[{ name: SITE_NAME, path: "/" }, { name: "Sismos por provincia", path: "/sismos" }]} />
      {jsonLd({
        "@context": "https://schema.org",
        "@type": "ItemList",
        name: TITLE,
        itemListElement: PROVINCES.map((province, index) => ({ "@type": "ListItem", position: index + 1, name: `Sismos en ${provinceNoun(province)}`, url: `${SITE_URL}/sismos/${province.id}` })),
      })}
      <PageHeader current="/sismos" />
      <main className="pr-main">
        <nav className="pr-crumbs" aria-label="Ruta de navegación">
          <Link href="/">Inicio</Link> › <span aria-current="page">Sismos por provincia</span>
        </nav>
        <h1>Sismos por provincia y comarca</h1>
        <p className="pr-lead">
          Cuántos sismos ha registrado cada una de las 13 provincias y comarcas de Panamá desde el {SEQUENCE_START_TEXT}, y cuál fue el último, según los
          catálogos del Instituto de Geociencias de la Universidad de Panamá (IGC-UP), el USGS y el EMSC. Toca una para ver su lista completa y sus sismos grandes desde 1900.
        </p>
        {pages.dataTime !== null && <p className="pr-updated">Datos del {longDate.format(new Date(pages.dataTime))} · se renueva sola cada minuto.</p>}
        {!pages.liveOk && (
          <section className="pr-card pr-warn" role="status">
            <p>No se pudieron consultar los catálogos de sismos en este momento, así que no se muestran los conteos. Consulta los avisos oficiales de SINAPROC.</p>
          </section>
        )}

        <ul className="pr-grid">
          {ordered.map(province => {
            const stats = pages.stats[province.id];
            return (
              <li key={province.id}>
                <Link className="pr-province" href={`/sismos/${province.id}`} prefetch={false}>
                  <h2>{province.name}</h2>
                  <span className="pr-kind">{province.kind === "comarca" ? "Comarca indígena" : "Provincia"}</span>
                  {pages.liveOk ? (
                    <>
                      <p><span className="pr-count">{stats.total}</span> {stats.total === 1 ? "sismo" : "sismos"} desde el 9 de octubre</p>
                      {stats.latest ? (
                        <p>
                          Último: M {magText(stats.latest)}, {placeTitle(stats.latest)} ({provinceLabel(stats.latest)}),{" "}
                          <time dateTime={isoTime(stats.latest.properties.time)}>{shortDate.format(new Date(stats.latest.properties.time))}</time>
                          {stats.last24h > 0 && <> · {plural(stats.last24h, "sismo", "sismos")} en 24 horas</>}
                        </p>
                      ) : (
                        <p>Sin sismos registrados desde el {SEQUENCE_START_TEXT}.</p>
                      )}
                    </>
                  ) : (
                    <p>Ver sismos y sismos grandes desde 1900.</p>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>

        <p className="pr-note">
          Cada sismo se asigna a la provincia o comarca donde cae. Si ocurre en el mar, va a la de la localidad que cita el catálogo (por ejemplo, «al sur de Tonosí» es Los Santos) y, si no cita ninguna, a la de la costa más cercana (hasta 90 km); los que quedan más lejos de toda costa no se cuentan en ninguna provincia. Datos del IGC-UP, el USGS y el EMSC, combinados sin
          duplicados; las magnitudes pueden cambiar cuando las agencias las revisan. Esta página no predice sismos ni reemplaza los avisos oficiales de{" "}
          <a href="https://www.sinaproc.gob.pa/" target="_blank" rel="noopener noreferrer">SINAPROC</a>. Mapa completo en la <Link href="/">portada</Link>.
        </p>
      </main>
    </>
  );
}
