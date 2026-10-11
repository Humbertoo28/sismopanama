import {
  MAINSHOCK_ID,
  isAftershock,
  type Earthquake,
  type MainshockResponse,
} from "../../../../lib/earthquakes";
import { fetchPanamaEvents } from "../../../../lib/catalogs";
import { rejectQuery } from "../../../../lib/http";
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

export async function GET(request: Request) {
  const rejected = rejectQuery(request);
  if (rejected) return rejected;
  try {
    const mainshock = (await queryUsgs({ eventid: MAINSHOCK_ID })) as Earthquake | null;
    if (!mainshock || !isValid(mainshock)) throw new Error("Respuesta inválida del catálogo");

    // Mismas fuentes que la lista de sismos (USGS + EMSC), para que el conteo de réplicas coincida.
    const { events } = await fetchPanamaEvents(mainshock.properties.time);
    const aftershocks = events.filter((item) => isAftershock(item, mainshock));
    const strongest = aftershocks.reduce<Earthquake | null>(
      (best, event) =>
        !best || (event.properties.mag ?? -10) > (best.properties.mag ?? -10) ? event : best,
      null,
    );

    // El USGS marca con tsunami = 1 los sismos grandes en zonas oceánicas: no confirma un tsunami,
    // pero indica que hay que mirar los avisos oficiales. Se avisa también si es una réplica.
    const flagged = aftershocks
      .filter((item) => item.properties.tsunami === 1)
      .reduce<Earthquake | null>(
        (best, event) => !best || (event.properties.mag ?? -10) > (best.properties.mag ?? -10) ? event : best,
        null,
      );

    const result: MainshockResponse = {
      mainshock: slim(mainshock),
      aftershocks: { count: aftershocks.length, strongest: strongest && slim(strongest), tsunami: flagged && slim(flagged) },
      fetchedAt: new Date().toISOString(),
    };
    return Response.json(result, {
      headers: { "Cache-Control": "public, max-age=60, s-maxage=180, stale-while-revalidate=600" },
    });
  } catch (error) {
    console.error("USGS mainshock fetch failed:", error);
    return Response.json(
      { error: "No se pudo consultar el sismo principal" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
