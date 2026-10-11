import type { Metadata } from "next";
import Link from "next/link";
import type { EarthquakeResponse } from "../../lib/earthquakes";
import { buildSummary, type QuakeSummary } from "../../lib/quake-summary";
import { SITE_URL, pageSocial } from "../../lib/site";
import { BreadcrumbStructuredData } from "../structured-data";
import LiveSummary from "./live-summary";
import "./resumen.css";

const TITLE = "Resumen de sismos en texto sencillo";
const DESCRIPTION = "Los sismos y réplicas de Panamá en frases cortas y sin símbolos, fáciles de leer, con descarga en texto.";

export const metadata: Metadata = {
  title: TITLE, // el sitio añade "| Sismo Panamá"
  description: DESCRIPTION,
  ...pageSocial(`${TITLE} | Sismo Panamá`, DESCRIPTION, "/resumen"),
};

// La primera versión se regenera como mucho cada minuto (para que cargue ya con datos); después la página se actualiza sola.
export const revalidate = 60;

// Se lee la propia API del sitio (que ya viene en caché de la red) y no los catálogos directamente: sus consultas van sin
// caché y volverían dinámica esta página, que debe regenerarse como mucho cada minuto.
async function loadSummary(): Promise<QuakeSummary | null> {
  try {
    const response = await fetch(`${SITE_URL}/api/earthquakes`, { next: { revalidate: 60 } });
    if (!response.ok) throw new Error(`La API de sismos respondió ${response.status}`);
    const data = (await response.json()) as EarthquakeResponse;
    return Array.isArray(data.features) && data.features.length
      ? buildSummary(data.features, Date.now(), { dataTime: Date.parse(data.fetchedAt) || Date.now(), catalogs: data.catalogs })
      : null;
  } catch (error) {
    console.error("Resumen de sismos no disponible:", error);
    return null;
  }
}

export default async function ResumenPage() {
  const summary = await loadSummary();
  return (
    <>
      <BreadcrumbStructuredData trail={[{ name: "Sismo Panamá", path: "/" }, { name: "Resumen en texto sencillo", path: "/resumen" }]} />
      <header className="rs-header">
        <Link href="/">← Volver al panel principal</Link>
      </header>
      <main className="rs-main">
        <h1>Resumen de sismos en Panamá</h1>
        <LiveSummary initial={summary} />
      </main>
    </>
  );
}
