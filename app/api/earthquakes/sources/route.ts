import {
  MAINSHOCK_ID,
  type Earthquake,
  type SourceRow,
  type SourcesResponse,
} from "../../../../lib/earthquakes";
import { isValidEarthquake, queryUsgs } from "../../../../lib/usgs";

export const dynamic = "force-dynamic";

const WINDOW_MS = 120_000;
const AREA_DEGREES = 2;

function magType(value: string | null | undefined) {
  return value ? value[0].toUpperCase() + value.slice(1) : null;
}

// Entre varias coincidencias, la más cercana en el tiempo al sismo principal.
function closest<T extends { time: number }>(items: T[], time: number) {
  return items.reduce<T | null>(
    (best, item) => !best || Math.abs(item.time - time) < Math.abs(best.time - time) ? item : best,
    null,
  );
}

async function fetchEmsc(query: URLSearchParams, time: number): Promise<SourceRow | null> {
  const response = await fetch(`https://www.seismicportal.eu/fdsnws/event/1/query?${query}&format=json&orderby=time`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (response.status === 204) return null;
  if (!response.ok) throw new Error(`EMSC respondió ${response.status}`);
  const data = (await response.json()) as {
    features?: { properties?: { source_id?: string; time?: string; mag?: number; magtype?: string; depth?: number } }[];
  };
  const events = (data.features ?? []).flatMap(item => {
    const p = item.properties;
    const when = Date.parse(p?.time ?? "");
    return p?.source_id && Number.isFinite(when) ? [{ p, time: when }] : [];
  });
  const match = closest(events, time);
  if (!match) return null;
  const { p } = match;
  return {
    id: "emsc",
    agency: "EMSC (Europa)",
    magnitude: Number.isFinite(p.mag) ? p.mag! : null,
    magType: magType(p.magtype),
    depthKm: Number.isFinite(p.depth) ? p.depth! : null,
    time: match.time,
    reviewed: null,
    url: `https://www.emsc-csem.org/Earthquake_information/earthquake.php?id=${encodeURIComponent(p.source_id!)}`,
  };
}

async function fetchGfz(query: URLSearchParams, time: number): Promise<SourceRow | null> {
  const response = await fetch(`https://geofon.gfz.de/fdsnws/event/1/query?${query}&format=text&orderby=time`, {
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (response.status === 204) return null;
  if (!response.ok) throw new Error(`GFZ respondió ${response.status}`);
  // EventID|Time|Latitude|Longitude|Depth/km|Author|Catalog|Contributor|ContributorID|MagType|Magnitude|...
  const events = (await response.text())
    .split("\n")
    .filter(line => line && !line.startsWith("#"))
    .flatMap(line => {
      const f = line.split("|");
      const when = Date.parse(`${f[1]}Z`);
      return f[0] && Number.isFinite(when) ? [{ f, time: when }] : [];
    });
  const match = closest(events, time);
  if (!match) return null;
  const { f } = match;
  return {
    id: "gfz",
    agency: "GFZ GEOFON (Alemania)",
    magnitude: Number.isFinite(Number(f[10])) && f[10] !== "" ? Number(f[10]) : null,
    magType: magType(f[9]),
    depthKm: Number.isFinite(Number(f[4])) && f[4] !== "" ? Number(f[4]) : null,
    time: match.time,
    reviewed: null,
    url: `https://geofon.gfz.de/eqinfo/event.php?id=${encodeURIComponent(f[0])}`,
  };
}

export async function GET() {
  try {
    const usgs = (await queryUsgs({ eventid: MAINSHOCK_ID })) as Earthquake | null;
    if (!usgs || !isValidEarthquake(usgs)) throw new Error("Respuesta inválida del catálogo");

    const { time, mag, magType: type, status, url } = usgs.properties;
    const [lng, lat, depth] = usgs.geometry.coordinates;
    const query = new URLSearchParams({
      starttime: new Date(time - WINDOW_MS).toISOString().slice(0, 19),
      endtime: new Date(time + WINDOW_MS).toISOString().slice(0, 19),
      minmagnitude: String(Math.max(5, (mag ?? 6) - 1.5)),
      minlatitude: String(lat - AREA_DEGREES),
      maxlatitude: String(lat + AREA_DEGREES),
      minlongitude: String(lng - AREA_DEGREES),
      maxlongitude: String(lng + AREA_DEGREES),
    });

    const others = await Promise.allSettled([fetchEmsc(query, time), fetchGfz(query, time)]);
    const sources: SourceRow[] = [
      {
        id: "usgs",
        agency: "USGS (Estados Unidos)",
        magnitude: mag,
        magType: magType(type),
        depthKm: Number.isFinite(depth) ? depth! : null,
        time,
        reviewed: status ? status === "reviewed" : null,
        url: url?.startsWith("https://earthquake.usgs.gov/") ? url : "https://earthquake.usgs.gov/earthquakes/map/",
      },
    ];
    for (const result of others) {
      if (result.status === "fulfilled" && result.value) sources.push(result.value);
      else if (result.status === "rejected") console.error("Fuente adicional no disponible:", result.reason);
    }

    const result: SourcesResponse = { sources, fetchedAt: new Date().toISOString() };
    return Response.json(result, {
      headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" },
    });
  } catch (error) {
    console.error("Sources fetch failed:", error);
    return Response.json(
      { error: "No se pudo consultar las fuentes" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
