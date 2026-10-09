// Las rutas de la API no reciben parámetros. Rechazarlos evita que alguien invente URLs distintas
// (?x=1, ?x=2, ...) para saltarse la caché del CDN y obligar a consultar al USGS en cada petición.
export function rejectQuery(request: Request) {
  if (new URL(request.url).search === "") return null;
  return Response.json(
    { error: "Parámetros no admitidos" },
    { status: 400, headers: { "Cache-Control": "no-store" } },
  );
}
