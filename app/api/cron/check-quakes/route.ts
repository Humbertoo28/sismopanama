import { NextRequest, NextResponse } from "next/server";
import { fetchPanamaEvents } from "@/lib/catalogs";
import { runQuakeCheck } from "@/lib/push-check";

export const dynamic = "force-dynamic";
export const maxDuration = 30; // 30 segundos límite para serverless

export async function GET(req: NextRequest) {
  return handleCheck(req);
}

export async function POST(req: NextRequest) {
  return handleCheck(req);
}

async function handleCheck(req: NextRequest) {
  // Verificación de seguridad si CRON_SECRET está configurado
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get("authorization");
    const querySecret = req.nextUrl.searchParams.get("secret");
    const isAuthorized =
      authHeader === `Bearer ${cronSecret}` || querySecret === cronSecret;
    if (!isAuthorized) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
  }

  try {
    // Ventana de 3 horas: la misma que usa runQuakeCheck para decidir qué falta por avisar.
    const { events } = await fetchPanamaEvents(Date.now() - 3 * 3600 * 1000);
    const result = await runQuakeCheck(events);
    return NextResponse.json(result, { status: result.configured ? 200 : 503 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Error en check-quakes:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
