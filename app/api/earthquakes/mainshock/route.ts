import {
  MAINSHOCK_ID,
  REGION,
  isAftershock,
  isPanamaPlace,
  type Earthquake,
  type MainshockResponse,
} from "../../../../lib/earthquakes";
import { isValidEarthquake as isValid, queryUsgs } from "../../../../lib/usgs";

export const dynamic = "force-dynamic";

// El detalle de un evento trae ~57 KB de "products" que la página no usa: se envía solo lo necesario.
function slim({ id, properties: p, geometry }: Earthquake): Earthquake {
  return {
    id,
    properties: { mag: p.mag, place: p.place, time: p.time, url: p.url, alert: p.alert, felt: p.felt, mmi: p.mmi, tsunami: p.tsunami, magType: p.magType, status: p.status },
    geometry,
  };
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
      (item) => isValid(item) && isAftershock(item, mainshock) && isPanamaPlace(item.properties.place),
    );
    const strongest = aftershocks.reduce<Earthquake | null>(
      (best, event) =>
        !best || (event.properties.mag ?? -10) > (best.properties.mag ?? -10) ? event : best,
      null,
    );

    const result: MainshockResponse = {
      mainshock: slim(mainshock),
      aftershocks: { count: aftershocks.length, strongest: strongest && slim(strongest) },
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
