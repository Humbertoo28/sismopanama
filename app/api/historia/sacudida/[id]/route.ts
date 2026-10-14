import { buildHistory, historyUrl, HISTORY_REVALIDATE_SECONDS, parseHistory } from "../../../../../lib/history";
import { fetchWaveData } from "../../../../../lib/usgs-detail";

export const dynamic = "force-dynamic";

// Los 12 sismos más grandes de la historia, tal como los muestra /historia (el catálogo se pide con la misma dirección y la misma
// caducidad que la página). Se recuerdan en memoria, y varias peticiones a la vez comparten la misma consulta: el catálogo es grande y
// no hay por qué pedirlo y leerlo una vez por cada petición.
let remembered: { ids: string[]; at: number } | null = null;
let pending: Promise<string[]> | null = null;

async function topIds() {
  if (remembered && Date.now() - remembered.at < HISTORY_REVALIDATE_SECONDS * 1000) return remembered.ids;
  pending ??= (async () => {
    try {
      const response = await fetch(historyUrl(), { headers: { Accept: "application/geo+json, application/json" }, next: { revalidate: HISTORY_REVALIDATE_SECONDS } });
      if (!response.ok) throw new Error(`El USGS respondió ${response.status}`);
      const { panama, excluded } = parseHistory(await response.json());
      const ids = buildHistory(panama, excluded).top.map(quake => quake.id);
      remembered = { ids, at: Date.now() };
      return ids;
    } finally {
      pending = null;
    }
  })();
  return pending;
}

// La rejilla de intensidad (ShakeMap) y, si existe, la falla de un sismo de los 12 mayores. Solo acepta esos 12 identificadores: así
// nadie puede usar la ruta para consultar al USGS por cualquier sismo ni inventar direcciones para saltarse la caché del CDN.
// Lo publicado de un sismo antiguo casi no cambia: se guarda un día en la red de Vercel.
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    if (!/^[A-Za-z0-9]{4,40}$/.test(id) || !(await topIds()).includes(id)) {
      return Response.json({ error: "Sismo no admitido" }, { status: 404, headers: { "Cache-Control": "public, max-age=60, s-maxage=300" } });
    }
    return Response.json(await fetchWaveData(id), {
      headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800" },
    });
  } catch (error) {
    console.error("Sacudida del sismo no disponible:", error);
    return Response.json({ error: "No se pudieron consultar los datos del USGS" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
