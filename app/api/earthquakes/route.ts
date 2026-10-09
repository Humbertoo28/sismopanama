import { REGION, type Earthquake, type EarthquakeResponse } from "../../../lib/earthquakes";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const days = Number(new URL(request.url).searchParams.get("days") ?? "30");
  if (![1, 7, 30].includes(days)) {
    return Response.json({ error: "Período no válido" }, { status: 400 });
  }

  const params = new URLSearchParams({
    format: "geojson",
    starttime: new Date(Date.now() - days * 86_400_000).toISOString(),
    orderby: "time",
    limit: "2000",
    ...REGION,
  });

  try {
    const response = await fetch(`https://earthquake.usgs.gov/fdsnws/event/1/query?${params}`, {
      headers: { Accept: "application/geo+json, application/json" },
      signal: AbortSignal.timeout(30_000),
      cache: "no-store",
    });
    if (!response.ok && response.status !== 204) {
      throw new Error(`USGS respondió ${response.status}`);
    }
    const data = (response.status === 204 ? { features: [] } : await response.json()) as { features?: unknown };
    if (!Array.isArray(data.features)) throw new Error("Respuesta inválida del catálogo");
    const features: Earthquake[] = data.features.filter(
      (item: Earthquake) =>
        typeof item.id === "string" &&
        Number.isFinite(item.properties?.time) &&
        Array.isArray(item.geometry?.coordinates) &&
        Number.isFinite(item.geometry.coordinates[0]) &&
        Number.isFinite(item.geometry.coordinates[1]),
    );
    const result: EarthquakeResponse = { features, fetchedAt: new Date().toISOString() };
    return Response.json(result, {
      headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" },
    });
  } catch (error) {
    console.error("USGS fetch failed:", error);
    return Response.json(
      { error: "No se pudo consultar el catálogo sísmico" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
