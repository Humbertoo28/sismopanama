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
    // Caché corta: la página consulta cada ~25 s y un sismo nuevo debe verse cuanto antes.
    return Response.json(result, {
      headers: { "Cache-Control": "public, max-age=15, stale-while-revalidate=60" },
    });
  } catch (error) {
    console.error("Catálogos sísmicos no disponibles:", error);
    return Response.json(
      { error: "No se pudo consultar el catálogo sísmico" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
