import type { Earthquake } from "./earthquakes";

export async function queryUsgs(params: Record<string, string>): Promise<unknown> {
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

export function isValidEarthquake(item: Earthquake) {
  return (
    typeof item?.id === "string" &&
    Number.isFinite(item.properties?.time) &&
    Array.isArray(item.geometry?.coordinates) &&
    Number.isFinite(item.geometry.coordinates[0]) &&
    Number.isFinite(item.geometry.coordinates[1])
  );
}
