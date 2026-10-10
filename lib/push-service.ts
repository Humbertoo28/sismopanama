import webPush from "web-push";
import { getSupabaseServerClient } from "./supabase";

export const DEFAULT_VAPID_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
  "BBcuXEeaAhLByNGNzF9t6eXgxNUYUAbTPBwuZFn09is6iLJfN9vX3XVz4hiwOx8s6H0OTRv2rvT1eF05dech4mM";

export const DEFAULT_VAPID_PRIVATE_KEY =
  process.env.VAPID_PRIVATE_KEY || "XuMz-bt6fsdad5-THsmkrewGRJp_RZbETwI6FCzJOyo";

export const VAPID_SUBJECT =
  process.env.VAPID_SUBJECT || "mailto:alerta@sismopanama.com";

let vapidConfigured = false;
function ensureVapidConfig() {
  if (!vapidConfigured) {
    webPush.setVapidDetails(
      VAPID_SUBJECT,
      DEFAULT_VAPID_PUBLIC_KEY,
      DEFAULT_VAPID_PRIVATE_KEY,
    );
    vapidConfigured = true;
  }
}

export type WebPushPayload = {
  title: string;
  body: string;
  id?: string;
  url?: string;
  magnitude?: number;
  place?: string;
  time?: number;
  lat?: number;
  lng?: number;
  depth?: number;
};

export type PushSubscriptionRecord = {
  id?: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  min_magnitude?: number;
};

export async function sendWebPushToSubscription(
  sub: { endpoint: string; p256dh: string; auth: string },
  payload: WebPushPayload,
): Promise<{ success: boolean; statusCode?: number; error?: string; expired?: boolean }> {
  ensureVapidConfig();

  const pushSubscription = {
    endpoint: sub.endpoint,
    keys: {
      p256dh: sub.p256dh,
      auth: sub.auth,
    },
  };

  try {
    const res = await webPush.sendNotification(
      pushSubscription,
      JSON.stringify(payload),
      {
        TTL: 60 * 60, // 1 hora de validez
        urgency: "high",
        // Un servicio de push lento no debe retener la respuesta del resto de dispositivos.
        timeout: 10_000,
      },
    );
    return { success: true, statusCode: res.statusCode };
  } catch (err: unknown) {
    const pushError = err as { statusCode?: number; message?: string };
    const statusCode = pushError.statusCode;
    // 404 o 410 indica que la suscripción caducó o el usuario revocó permisos
    const expired = statusCode === 404 || statusCode === 410;
    return {
      success: false,
      statusCode,
      expired,
      error: pushError.message || String(err),
    };
  }
}

export async function broadcastPush(
  payload: WebPushPayload,
  minMagnitude: number = 3.0,
): Promise<{ total: number; sent: number; failed: number; cleaned: number }> {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase no está configurado");
  }

  // Obtenemos todas las suscripciones activas cuyo umbral sea <= a la magnitud del sismo
  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth, min_magnitude")
    .lte("min_magnitude", payload.magnitude ?? minMagnitude);

  if (error || !subs || subs.length === 0) {
    return { total: 0, sent: 0, failed: 0, cleaned: 0 };
  }

  let sent = 0;
  let failed = 0;
  const expiredEndpoints: string[] = [];

  await Promise.allSettled(
    subs.map(async (row) => {
      const res = await sendWebPushToSubscription(
        { endpoint: row.endpoint, p256dh: row.p256dh, auth: row.auth },
        payload,
      );
      if (res.success) {
        sent++;
      } else {
        failed++;
        if (res.expired) {
          expiredEndpoints.push(row.endpoint);
        }
      }
    }),
  );

  // Limpiar suscripciones caducadas para mantener la base de datos limpia
  let cleaned = 0;
  if (expiredEndpoints.length > 0) {
    const { error: delError } = await supabase
      .from("push_subscriptions")
      .delete()
      .in("endpoint", expiredEndpoints);
    if (!delError) cleaned = expiredEndpoints.length;
  }

  return { total: subs.length, sent, failed, cleaned };
}
