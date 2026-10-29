import type { Metadata } from "next";
import PageHeader from "../page-header";
import { loadQuakeData } from "../../lib/load-quakes";
import { buildSummary, type QuakeSummary } from "../../lib/quake-summary";
import { pageSocial } from "../../lib/site";
import { BreadcrumbStructuredData } from "../structured-data";
import LiveSummary from "./live-summary";
import "./resumen.css";

const TITLE = "Resumen de sismos en texto sencillo";
const DESCRIPTION = "Los sismos y réplicas de Panamá en frases cortas y sin símbolos, fáciles de leer, con descarga en texto.";

export const metadata: Metadata = {
  title: TITLE, // el sitio añade "| Ojo Panamá"
  description: DESCRIPTION,
  ...pageSocial(`${TITLE} | Ojo Panamá`, DESCRIPTION, "/resumen", true),
};

// La primera versión se regenera como mucho cada minuto (para que cargue ya con datos); después la página se actualiza sola.
export const revalidate = 60;

async function loadSummary(): Promise<QuakeSummary | null> {
  const data = await loadQuakeData();
  return data ? buildSummary(data.features, Date.now(), { dataTime: Date.parse(data.fetchedAt) || Date.now(), catalogs: data.catalogs }) : null;
}

export default async function ResumenPage() {
  const summary = await loadSummary();
  return (
    <>
      <BreadcrumbStructuredData trail={[{ name: "Ojo Panamá", path: "/" }, { name: "Resumen en texto sencillo", path: "/resumen" }]} />
      <PageHeader current="/resumen" />
      <main className="rs-main">
        <h1>Resumen de sismos en Panamá</h1>
        <LiveSummary initial={summary} />
      </main>
    </>
  );
}
