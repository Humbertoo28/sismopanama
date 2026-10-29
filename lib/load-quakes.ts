import type { EarthquakeResponse } from "./earthquakes";
import { SITE_URL } from "./site";

// Los sismos tal como los sirve la propia API del sitio (que ya viene en caché de la red) y no los catálogos directamente: sus
// consultas van sin caché y volverían dinámicas las páginas que los usan, que deben regenerarse como mucho cada minuto.
// Si la consulta falla, devuelve null y la página sale sin esos datos (el navegador los pide después).
export async function loadQuakeData(): Promise<EarthquakeResponse | null> {
  try {
    const response = await fetch(`${SITE_URL}/api/earthquakes`, { next: { revalidate: 60 } });
    if (!response.ok) throw new Error(`La API de sismos respondió ${response.status}`);
    const data = (await response.json()) as EarthquakeResponse;
    return Array.isArray(data.features) && data.features.length ? data : null;
  } catch (error) {
    console.error("Sismos no disponibles para la primera versión de la página:", error);
    return null;
  }
}
