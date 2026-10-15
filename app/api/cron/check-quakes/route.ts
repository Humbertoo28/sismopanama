import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { fetchPanamaEvents } from "@/lib/catalogs";
import { runQuakeCheck } from "@/lib/push-check";
import { sendAnnouncementOnce } from "@/lib/announcement-push";
import { getSupabaseServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // amplio tiempo para despachar a decenas de miles de dispositivos en Vercel Pro

// Comparación en tiempo constante (no revela cuántos caracteres del secreto se acertaron).
function sameSecret(given: string | null, expected: string) {
  if (!given) return false;
  const hash = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(hash(given), hash(expected));
}

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
      sameSecret(authHeader, `Bearer ${cronSecret}`) || sameSecret(querySecret, cronSecret);
    if (!isAuthorized) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
  }

  try {
    // Ventana de 3 horas: la misma que usa runQuakeCheck para decidir qué falta por avisar.
    const { events, catalogs } = await fetchPanamaEvents(Date.now() - 3 * 3600 * 1000);
    const result = await runQuakeCheck(events, Date.now(), catalogs.igc);
    // Aviso único sobre mantenimiento del IGC a todas las suscripciones (ver lib/announcement-push.ts).
    try {
      const supabase = getSupabaseServerClient();
      const announcement = supabase ? await sendAnnouncementOnce(supabase) : null;
      if (announcement && announcement.status !== "skipped") console.log("[push] aviso IGC mantenimiento:", JSON.stringify(announcement));
    } catch (error) {
      console.error("[push] aviso IGC mantenimiento falló:", error);
    }
    return NextResponse.json(result, { status: result.configured ? 200 : 503 });
  } catch (err: unknown) {
    // El detalle queda en el registro del servidor; a quien llame no se le devuelve (puede revelar la infraestructura).
    console.error("Error en check-quakes:", err);
    return NextResponse.json({ ok: false, error: "Error interno al revisar los sismos" }, { status: 500 });
  }
}
