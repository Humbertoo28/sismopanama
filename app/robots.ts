import type { MetadataRoute } from "next";
import { SITE_URL } from "../lib/site";

// Las APIs de datos (/api/earthquakes...) quedan abiertas: Google las necesita para dibujar la página. Solo se
// excluye lo que no es contenido: el cron y el registro de notificaciones.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/cron/", "/api/push/"] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
