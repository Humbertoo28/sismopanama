import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { endpointHost, isPushEndpoint, isPushKeys, keyBytes, parseMinMagnitude, readJsonObject } from "@/lib/push-validation";

export const dynamic = "force-dynamic";

const INVALID = { error: "Suscripción Push inválida. Se requiere endpoint, p256dh y auth." };

export async function POST(req: NextRequest) {
  try {
    // endpoint: dirección del buzón push del navegador. oldEndpoint: la anterior cuando el navegador renovó la
    // suscripción; se traspasa su umbral y se borra.
    const body = await readJsonObject(req);
    const endpoint = body?.endpoint;
    const keys = body?.keys;
    const oldEndpoint = body?.oldEndpoint;

    if (!isPushEndpoint(endpoint) || !isPushKeys(keys) || (oldEndpoint !== undefined && !isPushEndpoint(oldEndpoint))) {
      // Queda constancia de qué se rechazó y por qué, sin guardar nada del dispositivo: solo el dominio, los tamaños de
      // las claves y el tipo de navegador. Así se ve si el filtro de seguridad deja fuera a algún servicio de push legítimo.
      const k = keys as { p256dh?: unknown; auth?: unknown } | null | undefined;
      console.warn("[push] suscripción rechazada", JSON.stringify({
        dominio: endpointHost(endpoint),
        direccionOk: isPushEndpoint(endpoint),
        clavesOk: isPushKeys(keys),
        bytesClaves: { p256dh: keyBytes(k?.p256dh), auth: keyBytes(k?.auth) },
        dominioAnterior: oldEndpoint === undefined ? null : endpointHost(oldEndpoint),
        navegador: (req.headers.get("user-agent") ?? "").slice(0, 90),
      }));
      return NextResponse.json(INVALID, { status: 400 });
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

    let threshold = parseMinMagnitude(body?.minMagnitude);
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
      return NextResponse.json({ error: "No se pudo guardar la suscripción. Inténtalo de nuevo." }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Suscripción registrada exitosamente" });
  } catch (err: unknown) {
    console.error("Error en /api/push/subscribe:", err);
    return NextResponse.json({ error: "No se pudo procesar la suscripción." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const endpoint = (await readJsonObject(req))?.endpoint;
    if (!isPushEndpoint(endpoint)) {
      return NextResponse.json({ error: "Endpoint requerido" }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ success: true });
    }

    await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
    return NextResponse.json({ success: true, message: "Suscripción eliminada" });
  } catch (err: unknown) {
    console.error("Error en DELETE /api/push/subscribe:", err);
    return NextResponse.json({ error: "No se pudo eliminar la suscripción." }, { status: 500 });
  }
}
