import {
  MAINSHOCK_ID,
  REGION,
  isAftershock,
  type Earthquake,
  type MainshockResponse,
} from "../../../../lib/earthquakes";

export const dynamic = "force-dynamic";

async function queryUsgs(params: Record<string, string>): Promise<unknown> {
  const response = await fetch(
    `https://earthquake.usgs.gov/fdsnws/event/1/query?${new URLSearchParams({ format: "geojson", ...params })}`,
    {
      headers: { Accept: "application/geo+json, application/json" },
      signal: AbortSignal.timeout(30_000),
      cache: "no-store",
    },
  );
  if (!response.ok && response.status !== 204) {
    throw new Error(`USGS respondió ${response.status}`);
  }
  return response.status === 204 ? null : response.json();
}

function isValid(item: Earthquake) {
  return (
    typeof item?.id === "string" &&
    Number.isFinite(item.properties?.time) &&
    Array.isArray(item.geometry?.coordinates) &&
    Number.isFinite(item.geometry.coordinates[0]) &&
    Number.isFinite(item.geometry.coordinates[1])
  );
}

export async function GET() {
  try {
    const mainshock = (await queryUsgs({ eventid: MAINSHOCK_ID })) as Earthquake | null;
    if (!mainshock || !isValid(mainshock)) throw new Error("Respuesta inválida del catálogo");

    const after = (await queryUsgs({
      starttime: new Date(mainshock.properties.time).toISOString(),
      orderby: "time",
      limit: "2000",
      ...REGION,
    })) as { features?: Earthquake[] } | null;
    const aftershocks = (after?.features ?? []).filter(
      (item) => isValid(item) && isAftershock(item, mainshock),
    );
    const strongest = aftershocks.reduce<Earthquake | null>(
      (best, event) =>
        !best || (event.properties.mag ?? -10) > (best.properties.mag ?? -10) ? event : best,
      null,
    );

    const result: MainshockResponse = {
      mainshock,
      aftershocks: { count: aftershocks.length, strongest },
      fetchedAt: new Date().toISOString(),
    };
    return Response.json(result, {
      headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" },
    });
  } catch (error) {
    console.error("USGS mainshock fetch failed:", error);
    return Response.json(
      { error: "No se pudo consultar el sismo principal" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
