import { SINCE, type EarthquakeResponse } from "../../../../lib/earthquakes";
import { fetchNearbyEvents } from "../../../../lib/catalogs";
import { rejectQuery } from "../../../../lib/http";

export const dynamic = "force-dynamic";

// Sismos de los alrededores de Panamá (Costa Rica, Colombia, mar abierto) dentro de la zona del mapa, desde el inicio de la
// secuencia. Solo los pide la página cuando alguien enciende «Incluir alrededores». A diferencia de /api/earthquakes, no
// dispara el chequeo de alertas push: las alertas son solo de Panamá.
export async function GET(request: Request) {
  const rejected = rejectQuery(request);
  if (rejected) return rejected;
  try {
    const { events, catalogs } = await fetchNearbyEvents(SINCE);
    const result: EarthquakeResponse = { features: events, fetchedAt: new Date().toISOString(), catalogs };
    return Response.json(result, {
      headers: { "Cache-Control": "public, max-age=30, s-maxage=60, stale-while-revalidate=120" },
    });
  } catch (error) {
    console.error("Catálogos de los alrededores no disponibles:", error);
    return Response.json({ error: "No se pudo consultar el catálogo sísmico" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
