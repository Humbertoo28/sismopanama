import type { Metadata } from "next";

// Datos del sitio para buscadores y vistas previas al compartir. Una sola fuente para que la portada, /analisis,
// el sitemap y los datos estructurados digan lo mismo. Si algún día el sitio tiene dominio propio, basta con definir
// NEXT_PUBLIC_SITE_URL en Vercel.
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://sismopanama.vercel.app").replace(/\/$/, "");
export const SITE_NAME = "Sismo Panamá";
export const SITE_TITLE = "Sismo Panamá | Sismos y réplicas en vivo, mapa y alertas";
export const SITE_DESCRIPTION =
  "Sismos y réplicas en Panamá en vivo: mapa, magnitud, profundidad y hora local, con datos de USGS, IGC y EMSC y avisos al celular.";

const OG_IMAGE = { url: "/opengraph-image", width: 1200, height: 630, alt: "Sismo Panamá: sismos y réplicas en vivo, mapa y avisos al celular" };

// Next reemplaza (no mezcla) openGraph y twitter de la página por los del layout: cada página debe repetirlos completos.
// La portada recibe la imagen de app/opengraph-image.tsx por convención; las demás páginas la piden con `withImage`.
export function pageSocial(title: string, description: string, path: string, withImage = false): Pick<Metadata, "alternates" | "openGraph" | "twitter"> {
  return {
    alternates: { canonical: path },
    openGraph: { type: "website", locale: "es_PA", siteName: SITE_NAME, url: path, title, description, ...(withImage && { images: [OG_IMAGE] }) },
    twitter: { card: "summary_large_image", title, description, ...(withImage && { images: [OG_IMAGE.url] }) },
  };
}
