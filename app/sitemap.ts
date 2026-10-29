import type { MetadataRoute } from "next";
import { PROVINCES } from "../lib/provinces";
import { hasContent, loadProvincePages } from "../lib/province-pages";
import { SITE_URL } from "../lib/site";

// Las páginas con datos cambian con cada sismo nuevo. La fecha es la de la compilación, no una inventada; la de cada provincia es la
// del último sismo que registra (un dato real). Las provincias sin nada que mostrar no van: su página no se ofrece a Google.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const lastModified = new Date();
  const pages = await loadProvincePages();
  const provinces = PROVINCES.filter(province => hasContent(pages, province.id));
  const lastQuake = Math.max(0, ...provinces.map(province => pages.stats[province.id].latest?.properties.time ?? 0));
  return [
    { url: `${SITE_URL}/`, lastModified, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE_URL}/sismos`, lastModified: lastQuake ? new Date(lastQuake) : lastModified, changeFrequency: "hourly", priority: 0.8 },
    ...provinces.map(province => ({
      url: `${SITE_URL}/sismos/${province.id}`,
      lastModified: pages.stats[province.id].latest ? new Date(pages.stats[province.id].latest!.properties.time) : lastModified,
      changeFrequency: "hourly" as const,
      priority: 0.7,
    })),
    { url: `${SITE_URL}/analisis`, lastModified, changeFrequency: "hourly", priority: 0.7 },
    { url: `${SITE_URL}/noticias`, lastModified, changeFrequency: "hourly", priority: 0.6 },
    { url: `${SITE_URL}/historia`, lastModified, changeFrequency: "daily", priority: 0.6 },
    { url: `${SITE_URL}/reportes`, lastModified, changeFrequency: "hourly", priority: 0.5 },
    { url: `${SITE_URL}/resumen`, lastModified, changeFrequency: "hourly", priority: 0.5 },
    { url: `${SITE_URL}/acerca`, lastModified, changeFrequency: "monthly", priority: 0.4 },
    { url: `${SITE_URL}/privacidad`, lastModified, changeFrequency: "yearly", priority: 0.2 },
  ];
}
