import { SINCE, type EarthquakeResponse } from "../../../lib/earthquakes";
import { after } from "next/server";
import { fetchPanamaEvents } from "../../../lib/catalogs";
import { runQuakeCheckThrottled } from "../../../lib/push-check";
import { rejectQuery } from "../../../lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const rejected = rejectQuery(request);
  if (rejected) return rejected;

  try {
    const { events, catalogs } = await fetchPanamaEvents(SINCE);
    const result: EarthquakeResponse = { features: events, fetchedAt: new Date().toISOString(), catalogs };
    // Con la respuesta ya enviada, se revisa si hay sismos nuevos que avisar por push a los celulares.
    after(() => runQuakeCheckThrottled(events));
    // Caché ultra-rápida: la página consulta cada ~12 s y un sismo nuevo debe verse de inmediato.
    return Response.json(result, {
      headers: { "Cache-Control": "public, max-age=5, stale-while-revalidate=10" },
    });
  } catch (error) {
    console.error("Catálogos sísmicos no disponibles:", error);
    return Response.json(
      { error: "No se pudo consultar el catálogo sísmico" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
