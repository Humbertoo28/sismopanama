import type { Metadata } from "next";

// Datos del sitio para buscadores y vistas previas al compartir. Una sola fuente para que la portada, /analisis,
// el sitemap y los datos estructurados digan lo mismo. Si algún día el sitio tiene dominio propio, basta con definir
// NEXT_PUBLIC_SITE_URL en Vercel.
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.ojopanama.com").replace(/\/$/, "");
export const SITE_NAME = "Ojo Panamá";
// El título cabe en los ~60 caracteres que muestra Google; la descripción, en ~160. «Avisos» y no «alertas tempranas»: el sitio avisa
// cuando las agencias publican el sismo, no antes de que ocurra.
export const SITE_TITLE = "Ojo Panamá: sismos y temblores en vivo | Mapa y alertas";
export const SITE_DESCRIPTION =
  "Sismos y temblores en Panamá en tiempo real: mapa en vivo, magnitud, réplicas y avisos al celular, con datos del IGC-UP, el USGS y el EMSC.";
export const INSTAGRAM_URL = "https://www.instagram.com/ojopanama507";

const OG_IMAGE = { url: "/opengraph-image", width: 1200, height: 630, alt: "Ojo Panamá: sismos y réplicas en vivo, mapa y avisos al celular" };

// Next reemplaza (no mezcla) openGraph y twitter de la página por los del layout: cada página debe repetirlos completos.
// La portada recibe la imagen de app/opengraph-image.tsx por convención; las demás páginas la piden con `withImage`.
export function pageSocial(title: string, description: string, path: string, withImage = false): Pick<Metadata, "alternates" | "openGraph" | "twitter"> {
  return {
    alternates: { canonical: path },
    openGraph: { type: "website", locale: "es_PA", siteName: SITE_NAME, url: path, title, description, ...(withImage && { images: [OG_IMAGE] }) },
    twitter: { card: "summary_large_image", title, description, ...(withImage && { images: [OG_IMAGE.url] }) },
  };
}

// Apps en las tiendas. Mientras no se defina la dirección de una tienda, el botón «Instalar» instala la web como hasta ahora;
// al publicar la app basta con definir la variable en Vercel y redesplegar. Android: el proyecto está en android/.
export const PLAY_STORE_URL = process.env.NEXT_PUBLIC_PLAY_STORE_URL || null; // https://play.google.com/store/apps/details?id=com.ojopanama.app
export const APP_STORE_URL = process.env.NEXT_PUBLIC_APP_STORE_URL || null;
