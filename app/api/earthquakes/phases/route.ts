import { fetchEventPhases } from "../../../../lib/usgs-phases";

export const dynamic = "force-dynamic";

// Único parámetro admitido: el id de un sismo del USGS. El formato se valida y el servidor solo sigue adelante si el sismo es de
// esta secuencia, así que no se pueden inventar direcciones para saltarse la caché o hacer trabajar al servidor en vano.
const ID = /^[a-z]{2}[0-9a-z]{6,12}$/;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if ([...searchParams.keys()].length !== 1 || !id || !ID.test(id)) {
    return Response.json({ error: "Parámetros no admitidos" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const phases = await fetchEventPhases(id);
    if (!phases) return Response.json({ error: "Sismo no encontrado" }, { status: 404, headers: { "Cache-Control": "public, s-maxage=600" } });
    return Response.json(phases, { headers: { "Cache-Control": "public, max-age=600, s-maxage=3600, stale-while-revalidate=86400" } });
  } catch (error) {
    console.error("USGS llegadas a estaciones no disponibles:", error);
    return Response.json({ error: "No se pudieron consultar los datos del USGS" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
