import { NextRequest, NextResponse } from "next/server";
import { sendWebPushToSubscription } from "@/lib/push-service";
import { isPushEndpoint, isPushKeys, readJsonObject } from "@/lib/push-validation";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await readJsonObject(req);
    const endpoint = body?.endpoint;
    const keys = body?.keys;
    // Esta ruta hace que el servidor llame a la dirección recibida: solo se admiten los servicios de push reales.
    if (!isPushEndpoint(endpoint) || !isPushKeys(keys)) {
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
      // El detalle del fallo (red, certificados, respuesta del servicio) queda en el registro del servidor y no
      // se devuelve: a un tercero le serviría para explorar a qué puede conectarse el servidor.
      console.warn("[push] prueba rechazada:", result.statusCode ?? "sin respuesta", String(result.error ?? "").slice(0, 160));
      return NextResponse.json(
        { error: "No se pudo enviar la notificación push de prueba." },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, message: "Notificación de prueba enviada exitosamente" });
  } catch (err: unknown) {
    console.error("Error en /api/push/test:", err);
    return NextResponse.json({ error: "No se pudo enviar la notificación push de prueba." }, { status: 500 });
  }
}
