import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      endpoint?: string;
      keys?: { p256dh?: string; auth?: string };
      minMagnitude?: number;
      // Endpoint anterior cuando el navegador renovó la suscripción: se traspasa su umbral y se borra.
      oldEndpoint?: string;
    };
    const { endpoint, keys, minMagnitude, oldEndpoint } = body;

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return NextResponse.json(
        { error: "Suscripción Push inválida. Se requiere endpoint, p256dh y auth." },
        { status: 400 },
      );
    }

    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json(
        {
          error: "Supabase no está conectado todavía.",
          configured: false,
        },
        { status: 503 },
      );
    }

    let threshold = Number(minMagnitude) || 0;
    if (oldEndpoint && oldEndpoint !== endpoint) {
      if (!threshold) {
        const { data: previous } = await supabase
          .from("push_subscriptions")
          .select("min_magnitude")
          .eq("endpoint", oldEndpoint)
          .maybeSingle();
        threshold = Number(previous?.min_magnitude) || 0;
      }
      await supabase.from("push_subscriptions").delete().eq("endpoint", oldEndpoint);
    }

    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        min_magnitude: threshold || 3.0,
        last_seen: new Date().toISOString(),
      },
      { onConflict: "endpoint" },
    );

    if (error) {
      console.error("Error guardando suscripción en Supabase:", error);
      return NextResponse.json(
        { error: "Error al guardar suscripción en base de datos: " + error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, message: "Suscripción registrada exitosamente" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { endpoint } = (await req.json()) as { endpoint?: string };
    if (!endpoint) {
      return NextResponse.json({ error: "Endpoint requerido" }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ success: true });
    }

    await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
    return NextResponse.json({ success: true, message: "Suscripción eliminada" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
