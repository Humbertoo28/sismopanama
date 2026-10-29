import type { Metadata } from "next";
import PageHeader from "../page-header";
import { INSTAGRAM_URL, SITE_NAME, SITE_URL, pageSocial } from "../../lib/site";
import { BreadcrumbStructuredData, jsonLd } from "../structured-data";
import "../privacidad/privacidad.css";

const TITLE = "Acerca del proyecto y sus fuentes de datos";
const DESCRIPTION = "Quién hace Ojo Panamá, de dónde salen sus datos de sismos, cada cuánto se actualizan, qué no hace y cómo contactarnos.";

export const metadata: Metadata = {
  title: TITLE, // el sitio añade "| Ojo Panamá"
  description: DESCRIPTION,
  ...pageSocial(`${TITLE} | Ojo Panamá`, DESCRIPTION, "/acerca", true),
};

// Todo lo que dice esta página describe lo que hace el código y las otras páginas del sitio (privacidad, fuentes, resumen). Si cambian
// los catálogos, la cadencia de consulta o el contacto, hay que actualizarla.
export default function AcercaPage() {
  return (
    <>
      <BreadcrumbStructuredData trail={[{ name: SITE_NAME, path: "/" }, { name: "Acerca de Ojo Panamá", path: "/acerca" }]} />
      {jsonLd({
        "@context": "https://schema.org",
        "@type": "AboutPage",
        "@id": `${SITE_URL}/acerca#page`,
        url: `${SITE_URL}/acerca`,
        name: "Acerca de Ojo Panamá",
        inLanguage: "es-PA",
        isPartOf: { "@id": `${SITE_URL}/#website` },
        mainEntity: { "@id": `${SITE_URL}/#organization` },
      })}
      <PageHeader current="/acerca" />
      <main className="pv-main">
        <h1>Acerca de Ojo Panamá</h1>
        <p className="pv-updated">Última actualización: 28 de octubre de 2026.</p>
        <p>
          Ojo Panamá (<a href={SITE_URL}>www.ojopanama.com</a>) muestra los sismos y temblores de Panamá en un mapa, con su magnitud, su profundidad
          y las réplicas del terremoto del 9 de octubre, y avisa al celular cuando se publica un sismo nuevo. Es un proyecto independiente:
          no es del gobierno ni de ningún medio. No pide crear una cuenta, no muestra publicidad y no vende datos.
        </p>

        <h2>Quién lo hace</h2>
        <p>
          Lo creó{" "}
          <a href="https://www.instagram.com/humbertiex_" target="_blank" rel="noopener noreferrer">humbertiex</a>. El proyecto también está en Instagram:{" "}
          <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer me">@ojopanama507</a>.
        </p>

        <h2>De dónde salen los datos</h2>
        <p>
          La lista de sismos sale de tres catálogos científicos, que se consultan y se combinan sin duplicados:
        </p>
        <ul>
          <li>
            <a href="https://sismosgeociencias.up.ac.pa/" target="_blank" rel="noopener noreferrer">Instituto de Geociencias de la Universidad de Panamá (IGC-UP)</a>:
            la Red Sísmica Nacional, que publica los sismos del país.
          </li>
          <li>
            <a href="https://earthquake.usgs.gov/" target="_blank" rel="noopener noreferrer">Servicio Geológico de Estados Unidos (USGS)</a>.
          </li>
          <li>
            <a href="https://www.emsc-csem.org/" target="_blank" rel="noopener noreferrer">Centro Sismológico Euromediterráneo (EMSC)</a>.
          </li>
        </ul>
        <p>
          Para contrastar, la sección «De dónde salen los datos» de la portada también consulta a{" "}
          <a href="https://geofon.gfz.de/" target="_blank" rel="noopener noreferrer">GFZ GEOFON</a>, de Alemania. Cada agencia mide por su cuenta, así
          que sus magnitudes pueden diferir y cambian cuando las revisan. Ojo Panamá muestra lo que publican los catálogos y, cuando un
          sismo solo aparece en una agencia, lo dice.
        </p>

        <h2>Cada cuánto se actualiza</h2>
        <p>
          Con la página abierta, la lista de sismos se vuelve a consultar cada 35 segundos. Las alertas al celular se envían cuando los
          catálogos publican un sismo nuevo; por eso no son un sistema de alerta temprana, que avisaría antes de que llegue la sacudida.
        </p>

        <h2>Lo que Ojo Panamá no hace</h2>
        <ul>
          <li>No predice sismos: nadie puede hacerlo con fecha y lugar.</li>
          <li>No reemplaza los avisos oficiales: ante una emergencia, sigue las indicaciones de <a href="https://www.sinaproc.gob.pa/" target="_blank" rel="noopener noreferrer">SINAPROC</a> y llama al 911 si hay peligro para la vida.</li>
          <li>No presenta cálculos como mediciones: lo que se calcula (por ejemplo, la energía liberada o lo que tarda la onda en llegar a una ciudad) se rotula como cálculo.</li>
        </ul>

        <h2>Más páginas</h2>
        <ul>
          <li><a href="/resumen">Resumen en texto sencillo</a>: los sismos más recientes en frases cortas, con descarga.</li>
          <li><a href="/analisis">Gráficos</a> de la secuencia de réplicas.</li>
          <li><a href="/historia">Historia</a> de los sismos grandes de Panamá.</li>
          <li><a href="/privacidad">Privacidad</a>: qué datos se usan y cómo borrarlos.</li>
        </ul>

        <h2>Contacto</h2>
        <p>
          Escríbenos por Instagram a <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer me">@ojopanama507</a>.
        </p>
      </main>
    </>
  );
}
