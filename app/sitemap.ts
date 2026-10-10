import type { MetadataRoute } from "next";
import { SITE_URL } from "../lib/site";

// Las dos páginas cambian con cada sismo nuevo. La fecha es la de la compilación, no una inventada.
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    { url: `${SITE_URL}/`, lastModified, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE_URL}/analisis`, lastModified, changeFrequency: "hourly", priority: 0.7 },
  ];
}
