import { SINCE, type EarthquakeResponse } from "../../../lib/earthquakes";
import { fetchPanamaEvents } from "../../../lib/catalogs";
import { rejectQuery } from "../../../lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const rejected = rejectQuery(request);
  if (rejected) return rejected;

  try {
    const { events, catalogs } = await fetchPanamaEvents(SINCE);
    const result: EarthquakeResponse = { features: events, fetchedAt: new Date().toISOString(), catalogs };
    // Caché corta: s-maxage hace que la red Edge de Vercel responda a casi todas las visitas
    // sin despertar el servidor serverless.
    return Response.json(result, {
      headers: { "Cache-Control": "public, max-age=15, s-maxage=30, stale-while-revalidate=90" },
    });
  } catch (error) {
    console.error("Catálogos sísmicos no disponibles:", error);
    return Response.json(
      { error: "No se pudo consultar el catálogo sísmico" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
