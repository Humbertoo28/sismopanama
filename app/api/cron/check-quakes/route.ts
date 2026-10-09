import { NextRequest, NextResponse } from "next/server";
import { fetchPanamaEvents } from "@/lib/catalogs";
import { getSupabaseServerClient } from "@/lib/supabase";
import { broadcastPush } from "@/lib/push-service";

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

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      {
        ok: false,
        message: "Supabase no está conectado todavía. Agrega SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.",
      },
      { status: 503 },
    );
  }

  try {
    // Buscar sismos de las últimas 3 horas
    const since = Date.now() - 3 * 3600 * 1000;
    const { events } = await fetchPanamaEvents(since);

    if (!events || events.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "No hay sismos recientes en la ventana de tiempo.",
        eventsChecked: 0,
        broadcasts: 0,
      });
    }

    // Obtener los sismos ya notificados
    const { data: alreadyNotified } = await supabase
      .from("notified_quakes")
      .select("id")
      .limit(500);

    const notifiedSet = new Set<string>((alreadyNotified || []).map((r: { id: string }) => r.id));

    // Filtrar sismos que no se hayan notificado aún
    const newQuakes = events.filter((e) => {
      if (notifiedSet.has(e.id)) return false;
      const aliases = e.properties.aliases || [];
      for (const a of aliases) {
        if (notifiedSet.has(a)) return false;
      }
      // Filtrar sólo sismos significativos (magnitud >= 3.0 por omisión)
      const mag = e.properties.mag ?? 0;
      return mag >= 3.0;
    });

    if (newQuakes.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "Todos los sismos recientes ya fueron notificados.",
        eventsChecked: events.length,
        newQuakesCount: 0,
      });
    }

    // Procesar y notificar los nuevos sismos
    let totalSent = 0;
    for (const quake of newQuakes) {
      const mag = quake.properties.mag?.toFixed(1) ?? "?.?";
      const place = quake.properties.place ?? "Panamá";
      const payload = {
        title: `🚨 Sismo M${mag} en Panamá`,
        body: `${place}. Pulsa para ver mapa y recomendaciones de seguridad.`,
        id: quake.id,
        magnitude: quake.properties.mag ?? 3.0,
        place,
        time: quake.properties.time,
        url: `/?focus=${encodeURIComponent(quake.id)}`,
      };

      const broadcastResult = await broadcastPush(payload, quake.properties.mag ?? 3.0);
      totalSent += broadcastResult.sent;

      // Registrar como notificado en Supabase
      await supabase.from("notified_quakes").upsert(
        {
          id: quake.id,
          magnitude: quake.properties.mag,
          place,
          time: quake.properties.time,
          notified_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      );

      // Si tiene alias de otros catálogos, marcarlos también
      for (const alias of quake.properties.aliases || []) {
        await supabase.from("notified_quakes").upsert(
          {
            id: alias,
            magnitude: quake.properties.mag,
            place,
            time: quake.properties.time,
            notified_at: new Date().toISOString(),
          },
          { onConflict: "id" },
        );
      }
    }

    return NextResponse.json({
      ok: true,
      message: `Se procesaron ${newQuakes.length} nuevo(s) sismo(s).`,
      newQuakesCount: newQuakes.length,
      notificationsSent: totalSent,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Error en check-quakes:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
