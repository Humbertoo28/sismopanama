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
    return Response.json({ error: "Acceso no autorizado" }, { status: 403 });
  }

  // Rate limiting por IP (120 req/min para clientes en tiempo real)
  const clientIp = getClientIp(request);
  const limit = checkRateLimit(`quakes:${clientIp}`, 120, 60_000);
  if (!limit.allowed) {
    return Response.json(
      { error: "Demasiadas peticiones. Por favor espera un momento." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  try {
    const { events, catalogs } = await fetchPanamaEvents(SINCE);
    // Revisión oportunista: si entra una visita y hay un sismo nuevo en catálogos, se avisa de inmediato sin esperar al cron.
    // Con after() de Next.js, Vercel no mata el proceso serverless hasta completar el despacho push.
    after(async () => {
      try {
        await runQuakeCheckThrottled(events, catalogs.igc);
      } catch (e) {
        console.warn("[push] oportuno fallo:", e);
      }
    });

    const result: EarthquakeResponse = { features: events, fetchedAt: new Date().toISOString(), catalogs };
    // Caché corta: s-maxage hace que la red Edge de Vercel responda a casi todas las visitas
    // sin despertar el servidor serverless.
    return Response.json(result, {
      headers: { "Cache-Control": "public, max-age=15, s-maxage=30, stale-while-revalidate=90" },
    });
  } catch (error) {
    console.error("Catálogos sísmicos no disponibles:", error);
    return Response.json(
      { error: "No se pudo consultar el catálogo sísmico" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
