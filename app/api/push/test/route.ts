import { after, NextRequest, NextResponse } from "next/server";
import { sendWebPushToSubscription } from "@/lib/push-service";
import { isPushEndpoint, isPushKeys, readJsonObject } from "@/lib/push-validation";

export const dynamic = "force-dynamic";
// La prueba «con la app cerrada» espera unos segundos antes de enviar: la función tiene que seguir viva ese rato.
export const maxDuration = 60;

// Prueba de envío push a este mismo equipo. Con `delaySeconds: 30` se envía medio minuto después, para que la persona alcance a
// cerrar la app o bloquear el teléfono: es la única forma de comprobar que el aviso llega con la app cerrada, que es lo que
// importa (con la página abierta, ella misma avisa aunque el push no funcione).
const DELAY_SECONDS = 30;
// Una prueba diferida por conexión cada 2 minutos: retiene la función medio minuto y no debe poder usarse para cargar al servidor.
const DELAYED_EVERY_MS = 120_000;
const lastDelayed = new Map<string, number>();

// Qué significa la respuesta del servicio de push, en palabras (solo el código: nunca el detalle, que podría revelar la infraestructura).
function explain(statusCode: number | undefined) {
  if (statusCode === 404 || statusCode === 410) return { code: "expired", error: "La suscripción de este equipo caducó. Toca «Reparar» para crear una nueva." };
  if (statusCode === 401 || statusCode === 403) return { code: "rejected", error: "El servicio de notificaciones rechazó el envío (problema de configuración del servidor). Ya quedó registrado para revisarlo." };
  if (statusCode === 429) return { code: "busy", error: "El servicio de notificaciones está saturado. Inténtalo en unos minutos." };
  return { code: "failed", error: "No se pudo enviar la notificación de prueba. Inténtalo de nuevo." };
}

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
    const delayed = body?.delaySeconds === DELAY_SECONDS;

    const payload = {
      title: "🧪 Prueba de alerta: ¡funciona!",
      body: delayed
        ? "Esta prueba se envió con la app cerrada. Así te llegarán las alertas de sismos en Panamá."
        : "¡Funciona! Recibirás alertas sísmicas de Panamá incluso con la app cerrada.",
      id: "test-" + Date.now(),
      url: "/",
    };
    const subscription = { endpoint, p256dh: keys.p256dh, auth: keys.auth };

    if (delayed) {
      const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "sin-ip";
      const now = Date.now();
      if (now - (lastDelayed.get(ip) ?? 0) < DELAYED_EVERY_MS) {
        return NextResponse.json({ error: "Ya hay una prueba en camino. Espera un par de minutos para pedir otra." }, { status: 429 });
      }
      lastDelayed.set(ip, now);
      if (lastDelayed.size > 5_000) lastDelayed.clear();
      after(async () => {
        await new Promise(resolve => setTimeout(resolve, DELAY_SECONDS * 1000));
        const result = await sendWebPushToSubscription(subscription, payload);
        if (!result.success) console.warn("[push] prueba diferida rechazada:", result.statusCode ?? "sin respuesta", String(result.error ?? "").slice(0, 160));
        else console.log("[push] prueba diferida enviada:", result.statusCode);
      });
      return NextResponse.json({ success: true, scheduled: true, delaySeconds: DELAY_SECONDS }, { status: 202 });
    }

    const result = await sendWebPushToSubscription(subscription, payload);
    if (!result.success) {
      // El detalle del fallo (red, certificados, respuesta del servicio) queda en el registro del servidor; a quien prueba
      // se le dice solo qué significa, para que sepa si es su equipo o el servidor.
      console.warn("[push] prueba rechazada:", result.statusCode ?? "sin respuesta", String(result.error ?? "").slice(0, 160));
      return NextResponse.json(explain(result.statusCode), { status: 502 });
    }

    return NextResponse.json({ success: true, message: "Notificación de prueba enviada exitosamente" });
  } catch (err: unknown) {
    console.error("Error en /api/push/test:", err);
    return NextResponse.json({ error: "No se pudo enviar la notificación push de prueba." }, { status: 500 });
  }
}
