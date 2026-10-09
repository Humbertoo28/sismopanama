import { NextRequest, NextResponse } from "next/server";
import { sendWebPushToSubscription } from "@/lib/push-service";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { endpoint, keys } = (await req.json()) as {
      endpoint?: string;
      keys?: { p256dh?: string; auth?: string };
    };
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return NextResponse.json(
        { error: "Suscripción incompleta. Debe contener endpoint, p256dh y auth." },
        { status: 400 },
      );
    }

    const payload = {
      title: "🧪 Alerta Sísmica Push (Prueba)",
      body: "¡Funciona! Recibirás alertas sísmicas críticas de Panamá incluso con la app cerrada.",
      id: "test-" + Date.now(),
      url: "/",
    };

    const result = await sendWebPushToSubscription(
      { endpoint, p256dh: keys.p256dh, auth: keys.auth },
      payload,
    );

    if (!result.success) {
      return NextResponse.json(
        { error: "No se pudo enviar la notificación push: " + result.error },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, message: "Notificación de prueba enviada exitosamente" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
