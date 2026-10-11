import { rejectQuery } from "../../../../lib/http";
import { fetchMainshockDetail } from "../../../../lib/usgs-detail";

export const dynamic = "force-dynamic";

// Los productos del USGS (mecanismo, falla, «¿Lo sentiste?») cambian pocas veces al día: la red de Vercel
// responde casi todas las visitas y el servidor solo consulta al USGS cuando caduca la copia.
export async function GET(request: Request) {
  const rejected = rejectQuery(request);
  if (rejected) return rejected;
  try {
    return Response.json(await fetchMainshockDetail(), {
      headers: { "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=21600" },
    });
  } catch (error) {
    console.error("USGS detalle del sismo principal no disponible:", error);
    return Response.json(
      { error: "No se pudieron consultar los datos del USGS" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
