import { recentNearbyEvents, recentPanamaEvents } from "../../../../lib/catalogs";
import { SINCE, type Earthquake } from "../../../../lib/earthquakes";
import { fetchEventPhases } from "../../../../lib/usgs-phases";

export const dynamic = "force-dynamic";

// Único parámetro admitido: el id de un sismo del USGS. El formato se valida y el servidor solo consulta al USGS si el sismo está
// en la lista del sitio (la de Panamá o la de los alrededores, que son los únicos que la página puede pedir). Antes se consultaba
// al USGS por cualquier id con formato válido: bastaba inventar ids para saltarse la caché y hacer trabajar al servidor en cada
// petición. Las listas se guardan un minuto por instancia, así que un id inventado ya no cuesta ninguna consulta externa.
const ID = /^[a-z]{2}[0-9a-z]{6,12}$/;
const LIST_MAX_AGE_MS = 60_000;

const lists = (id: string) => (events: Earthquake[]) => events.some(event => event.id === id || event.properties.aliases?.includes(id));

async function isListed(id: string) {
  const has = lists(id);
  return has(await recentPanamaEvents(SINCE, LIST_MAX_AGE_MS)) || has(await recentNearbyEvents(SINCE, LIST_MAX_AGE_MS));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if ([...searchParams.keys()].length !== 1 || !id || !ID.test(id)) {
    return Response.json({ error: "Parámetros no admitidos" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  try {
    // Caché corta: un sismo recién publicado puede no estar todavía en la copia de la lista de esta instancia.
    if (!(await isListed(id))) return Response.json({ error: "Sismo no encontrado" }, { status: 404, headers: { "Cache-Control": "public, s-maxage=60" } });
    const phases = await fetchEventPhases(id);
    if (!phases) return Response.json({ error: "Sismo no encontrado" }, { status: 404, headers: { "Cache-Control": "public, s-maxage=600" } });
    return Response.json(phases, { headers: { "Cache-Control": "public, max-age=600, s-maxage=3600, stale-while-revalidate=86400" } });
  } catch (error) {
    console.error("USGS llegadas a estaciones no disponibles:", error);
    return Response.json({ error: "No se pudieron consultar los datos del USGS" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
