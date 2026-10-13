import type { Metadata } from "next";
import { pageSocial } from "../../lib/site";
import PageHeader from "../page-header";
import { BreadcrumbStructuredData } from "../structured-data";
import ReportsDashboardView from "./reports-dashboard";
import "./reportes.css";

const TITLE = "Reportes: ¿sentiste el sismo?";
const DESCRIPTION = "Reportes de las personas que sintieron (o no) cada sismo y réplica en Panamá: hasta dónde llegó, con qué fuerza y desde qué localidades. Incluye los reportes del USGS.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  ...pageSocial(`${TITLE} | Ojo Panamá`, DESCRIPTION, "/reportes"),
};

export default function ReportesPage() {
  return (
    <>
      <BreadcrumbStructuredData trail={[{ name: "Ojo Panamá", path: "/" }, { name: "Reportes", path: "/reportes" }]} />
      <PageHeader current="/reportes" />
      <ReportsDashboardView>
        <section className="rp-about" aria-labelledby="rp-about-title">
          <h2 id="rp-about-title">Sobre estos reportes</h2>
          <h3>¿De dónde salen?</h3>
          <p>
            De las personas que responden «¿Lo sentiste?» en esta página: si lo sintieron, con qué fuerza y en qué localidad estaban.
            También se muestran, por separado, los reportes que recibe el Servicio Geológico de los Estados Unidos (USGS) en su propio formulario.
          </p>
          <h3>¿Qué datos se guardan?</h3>
          <p>
            Solo la localidad y tu respuesta, nunca tu ubicación exacta: si usas «Usar mi ubicación», el teléfono busca la localidad
            más cercana y la posición no sale de él. Para no contar dos veces el mismo teléfono se guarda un código cifrado que no
            permite saber quién eres. Lo que se publica está siempre agrupado por localidad.
          </p>
          <h3>¿Cómo se evitan los reportes falsos?</h3>
          <p>
            Cada teléfono puede reportar un sismo una sola vez, hay un tope de reportes por conexión y solo se aceptan sismos reales
            de los últimos 15 días. No se cuentan los reportes que no son creíbles para la
            distancia y la magnitud del sismo (por ejemplo, «muy fuerte» a cientos de kilómetros de un sismo pequeño).
          </p>
          <h3>¿Es una medición oficial?</h3>
          <p>
            No. Son respuestas de personas, sin verificar: sirven para tener una idea de hasta dónde y con qué fuerza se sintió. Para
            las indicaciones oficiales consulta a <a href="https://www.sinaproc.gob.pa/" target="_blank" rel="noopener noreferrer">SINAPROC</a>.
          </p>
        </section>
      </ReportsDashboardView>
    </>
  );
}
