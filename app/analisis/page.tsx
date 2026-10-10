import type { Metadata } from "next";
import { pageSocial } from "../../lib/site";
import { BreadcrumbStructuredData } from "../structured-data";
import Dashboard from "./dashboard";
import "./analisis.css";

const TITLE = "Gráficos de sismos y réplicas en Panamá";
const DESCRIPTION = "Gráficos interactivos de los sismos y réplicas registrados en Panamá por USGS, IGC y EMSC: línea de tiempo, actividad, magnitudes y profundidad, en vivo.";

export const metadata: Metadata = {
  title: TITLE, // el sitio añade "| Sismo Panamá"
  description: DESCRIPTION,
  ...pageSocial(`${TITLE} | Sismo Panamá`, DESCRIPTION, "/analisis", true),
};

// Esta explicación vive en el HTML inicial (no se carga con JavaScript): es lo que lee el buscador, y también ayuda a quien
// llega sin saber de dónde salen los números.
export default function AnalisisPage() {
  return (
    <>
      <BreadcrumbStructuredData trail={[{ name: "Sismo Panamá", path: "/" }, { name: "Gráficos de sismos", path: "/analisis" }]} />
      <Dashboard>
        <section className="an-about" aria-labelledby="an-about-title">
          <h2 id="an-about-title">Sobre estos gráficos</h2>
          <h3>¿Qué muestran?</h3>
          <p>
            Los sismos y réplicas que registran el Servicio Geológico de los Estados Unidos (USGS), el Instituto de Geociencias de la
            Universidad de Panamá (IGC) y el Centro Sismológico Euro-Mediterráneo (EMSC), combinados sin duplicados: línea de tiempo,
            actividad por intervalo, cantidad de sismos por magnitud y por profundidad.
          </p>
          <h3>¿Cómo se actualizan?</h3>
          <p>
            La página consulta los catálogos cada pocos segundos y avisa cuando entra un sismo nuevo. Cada agencia publica a su ritmo
            y las magnitudes pueden cambiar cuando se revisan.
          </p>
          <h3>¿Es una alerta oficial?</h3>
          <p>
            No. Es información de referencia y no un sistema de alerta temprana. Para las indicaciones oficiales consulta a{" "}
            <a href="https://www.sinaproc.gob.pa/" target="_blank" rel="noopener noreferrer">SINAPROC</a>.
          </p>
        </section>
      </Dashboard>
    </>
  );
}
