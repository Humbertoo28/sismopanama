import { SINCE, type EarthquakeResponse } from "../../../lib/earthquakes";
import { after } from "next/server";
import { fetchPanamaEvents } from "../../../lib/catalogs";
import { runQuakeCheckThrottled } from "../../../lib/push-check";
import { rejectQuery } from "../../../lib/http";

export const dynamic = "force-dynamic";
// Esta ruta también reparte los avisos push cuando detecta un sismo nuevo (after): con miles de dispositivos el envío
// necesita más de los 10 s por omisión.
export const maxDuration = 60;

export async function GET(request: Request) {
  const rejected = rejectQuery(request);
  if (rejected) return rejected;

  try {
    const { events, catalogs } = await fetchPanamaEvents(SINCE);
    const result: EarthquakeResponse = { features: events, fetchedAt: new Date().toISOString(), catalogs };
    // Con la respuesta ya enviada, se revisa si hay sismos nuevos que avisar por push a los celulares.
    after(() => runQuakeCheckThrottled(events));
    // Caché corta: un sismo nuevo se ve en segundos. s-maxage hace que la red de Vercel responda a casi todas las
    // visitas sin despertar el servidor (con mucha gente conectada, esa es la diferencia entre aguantar y caerse).
    return Response.json(result, {
      headers: { "Cache-Control": "public, max-age=5, s-maxage=10, stale-while-revalidate=30" },
    });
  } catch (error) {
    console.error("Catálogos sísmicos no disponibles:", error);
    return Response.json(
      { error: "No se pudo consultar el catálogo sísmico" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
