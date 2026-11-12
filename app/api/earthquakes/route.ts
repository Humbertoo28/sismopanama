import { after } from "next/server";
import { SINCE, type EarthquakeResponse } from "../../../lib/earthquakes";
import { fetchPanamaEvents } from "../../../lib/catalogs";
import { rejectQuery } from "../../../lib/http";
import { runQuakeCheckThrottled } from "../../../lib/push-check";

import { isAutomatedBot } from "../../../lib/bot-defense";
import { checkRateLimit, getClientIp } from "../../../lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const rejected = rejectQuery(request);
  if (rejected) return rejected;

  // Protección anti-bot / anti-scraper
  const userAgent = request.headers.get("user-agent");
  if (isAutomatedBot(userAgent)) {
    return Response.json({ error: "Acceso no autorizado" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }

  // Rate limiting por IP (120 req/min para clientes en tiempo real)
  const clientIp = getClientIp(request);
  const limit = checkRateLimit(`quakes:${clientIp}`, 120, 60_000);
  if (!limit.allowed) {
    return Response.json(
      { error: "Demasiadas peticiones. Por favor espera un momento." },
      { status: 429, headers: { "Retry-After": "60", "Cache-Control": "no-store" } },
    );
  }

  try {
    const { events, catalogs } = await fetchPanamaEvents(SINCE);
    // Revisión oportunista: si entra una visita y hay un sismo nuevo en catálogos, se avisa de inmediato sin esperar al cron.
    // Con after() de Next.js, Vercel no mata el proceso serverless hasta completar el despacho push.
    after(async () => {
      try {
        await runQuakeCheckThrottled(events);
      } catch (e) {
        console.warn("[push] oportuno fallo:", e);
      }
    });

    const result: EarthquakeResponse = { features: events, fetchedAt: new Date().toISOString(), catalogs };
    // Caché de 1 minuto en el Edge de Vercel: absorbe la mayoría de los polls del cliente (cada 60 s)
    // sin despertar el servidor serverless.
    // Cloudflare-CDN-Cache-Control solo lo lee Cloudflare (que va delante de Vercel) y solo cuenta si allí hay una regla
    // de caché para esta ruta. 30 s y no 60: su copia se suma a la de Vercel, y así un sismo nuevo no tarda el doble en verse.
    return Response.json(result, {
      headers: {
        "Cache-Control": "public, max-age=20, s-maxage=60, stale-while-revalidate=120",
        "Cloudflare-CDN-Cache-Control": "public, max-age=30",
      },
    });
  } catch (error) {
    console.error("Catálogos sísmicos no disponibles:", error);
    return Response.json(
      { error: "No se pudo consultar el catálogo sísmico" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
