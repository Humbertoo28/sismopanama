import https from "node:https";
import webPush from "web-push";
import { getSupabaseServerClient } from "./supabase";

export const DEFAULT_VAPID_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
  "BBcuXEeaAhLByNGNzF9t6eXgxNUYUAbTPBwuZFn09is6iLJfN9vX3XVz4hiwOx8s6H0OTRv2rvT1eF05dech4mM";

export const DEFAULT_VAPID_PRIVATE_KEY =
  process.env.VAPID_PRIVATE_KEY || "XuMz-bt6fsdad5-THsmkrewGRJp_RZbETwI6FCzJOyo";

export const VAPID_SUBJECT =
  process.env.VAPID_SUBJECT || "mailto:alerta@sismopanama.com";

// Conexiones reutilizadas hacia Google, Apple y Mozilla: maxSockets alto para despachar en paralelo a miles de dispositivos en segundos.
const pushAgent = new https.Agent({ keepAlive: true, maxSockets: 500 });

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

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

  // Un envío que falla por la red (conexión reutilizada que el servicio ya cerró, corte momentáneo) o por un error
  // temporal del servicio (429, 5xx) se reintenta una vez: antes ese aviso se perdía sin más. Los errores definitivos
  // (404/410 suscripción caducada, 400/401/403) no se reintentan.
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await webPush.sendNotification(
        pushSubscription,
        JSON.stringify(payload),
        {
          TTL: 60 * 60, // 1 hora de validez
          urgency: "high",
          // Un servicio de push lento no debe retener la respuesta del resto de dispositivos.
          timeout: 10_000,
          agent: pushAgent,
        },
      );
      return { success: true, statusCode: res.statusCode };
    } catch (err: unknown) {
      const pushError = err as { statusCode?: number; message?: string };
      const statusCode = pushError.statusCode;
      if (attempt < 2 && (statusCode === undefined || RETRYABLE_STATUS.has(statusCode))) {
        await new Promise((resolve) => setTimeout(resolve, statusCode === 429 ? 1_000 : 150));
        continue;
      }
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
}

type PushSubscriptionRow = { id: string; endpoint: string; p256dh: string; auth: string; min_magnitude: number };
const SUBSCRIPTION_PAGE = 1000;
const MAX_CONCURRENT_SENDS = 350;
// Tiempo máximo para despachar (en Vercel Pro con maxDuration ampliado).
export const PUSH_BUDGET_MS = 90_000;

export async function broadcastPush(
  payload: WebPushPayload,
  minMagnitude: number = 3.0,
  budgetMs: number = PUSH_BUDGET_MS,
): Promise<{ total: number; sent: number; failed: number; cleaned: number; unsent: number; outcomes: Record<string, number> }> {
  const startedAt = Date.now();
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase no está configurado");
  }

  // Obtenemos la primera página y el conteo total en paralelo para despachar sin demoras.
  const { data: firstPage, error: firstErr, count } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth, min_magnitude", { count: "exact" })
    .lte("min_magnitude", payload.magnitude ?? minMagnitude)
    .order("created_at", { ascending: false })
    .range(0, SUBSCRIPTION_PAGE - 1);

  if (firstErr) {
    console.error("[push] no se pudo leer las suscripciones:", firstErr.message);
    return { total: 0, sent: 0, failed: 0, cleaned: 0, unsent: 0, outcomes: {} };
  }

  const subs: PushSubscriptionRow[] = (firstPage as PushSubscriptionRow[]) ?? [];
  const totalCount = count ?? subs.length;

  // Descargar todas las páginas restantes EN PARALELO simultáneo (1 solo viaje de red)
  if (totalCount > SUBSCRIPTION_PAGE) {
    const pagePromises = [];
    for (let from = SUBSCRIPTION_PAGE; from < totalCount; from += SUBSCRIPTION_PAGE) {
      pagePromises.push(
        supabase
          .from("push_subscriptions")
          .select("id, endpoint, p256dh, auth, min_magnitude")
          .lte("min_magnitude", payload.magnitude ?? minMagnitude)
          .order("created_at", { ascending: false })
          .range(from, Math.min(from + SUBSCRIPTION_PAGE - 1, totalCount - 1))
      );
    }
    const pages = await Promise.all(pagePromises);
    for (const page of pages) {
      if (page.data) subs.push(...(page.data as PushSubscriptionRow[]));
    }
  }

  if (subs.length === 0) {
    return { total: 0, sent: 0, failed: 0, cleaned: 0, unsent: 0, outcomes: {} };
  }

  let sent = 0;
  let failed = 0;
  const expiredIds: string[] = [];
  // Qué respondió cada servicio (Apple, Google...) para poder ver por qué un celular no recibe: "apple:201",
  // "apple:403", "fcm:410"... Sin esto un envío rechazado era invisible.
  const outcomes: Record<string, number> = {};
  const errorSamples: string[] = [];
  const serviceOf = (endpoint: string) => {
    let host = "";
    try {
      host = new URL(endpoint).host;
    } catch {
      // Una dirección guardada que ya no se puede leer se cuenta como "otro" y no detiene el resto.
    }
    return host.includes("apple") ? "apple" : host.includes("googleapis") || host.endsWith(".google.com") ? "fcm" : host.includes("mozilla") ? "mozilla" : host.includes("windows") ? "windows" : "otro";
  };

  // Con un máximo de envíos simultáneos: miles de conexiones a la vez agotarían los recursos de la función y
  // retrasarían el aviso a todos. Con pocos dispositivos (lo normal) se envían todos a la vez, igual que antes.
  let next = 0;
  const worker = async () => {
    while (next < subs.length && Date.now() - startedAt < budgetMs) {
      const row = subs[next++];
      const res = await sendWebPushToSubscription(
        { endpoint: row.endpoint, p256dh: row.p256dh, auth: row.auth },
        payload,
      );
      const outcome = `${serviceOf(row.endpoint)}:${res.success ? "ok" : (res.statusCode ?? "error")}`;
      outcomes[outcome] = (outcomes[outcome] ?? 0) + 1;
      if (res.success) {
        sent++;
      } else {
        failed++;
        if (errorSamples.length < 3) errorSamples.push(`${outcome} ${String(res.error ?? "").slice(0, 120)}`);
        if (res.expired) {
          expiredIds.push(row.id);
        }
      }
    }
  };
  await Promise.allSettled(Array.from({ length: Math.min(MAX_CONCURRENT_SENDS, subs.length) }, worker));

  // Dar de baja las suscripciones caducadas (404/410). Antes se borraban todas en una sola consulta con las direcciones
  // completas: con miles de ellas la petición era demasiado grande, fallaba sin dejar rastro («0 dados de baja») y cada aviso
  // seguía gastando una cuarta parte de los envíos en direcciones muertas. Ahora va por id, en tandas.
  let cleaned = 0;
  const CLEAN_BATCH = 150;
  for (let from = 0; from < expiredIds.length; from += CLEAN_BATCH * 4) {
    const batches = [0, 1, 2, 3]
      .map(k => expiredIds.slice(from + k * CLEAN_BATCH, from + (k + 1) * CLEAN_BATCH))
      .filter(batch => batch.length > 0);
    const results = await Promise.all(batches.map(batch => supabase.from("push_subscriptions").delete().in("id", batch)));
    results.forEach((result, k) => {
      if (result.error) console.error("[push] no se pudieron dar de baja suscripciones caducadas:", result.error.message);
      else cleaned += batches[k].length;
    });
  }

  const unsent = subs.length - next;
  if (unsent > 0) console.error(`[push] TIEMPO AGOTADO en ${payload.id ?? "?"}: ${unsent} de ${subs.length} dispositivos quedaron sin aviso`);

  console.log(`[push] ${payload.id ?? "?"} M${payload.magnitude ?? "?"}: ${sent}/${subs.length} aceptados, ${failed} rechazados, ${cleaned} dados de baja`, JSON.stringify(outcomes), errorSamples.length ? JSON.stringify(errorSamples) : "");
  return { total: subs.length, sent, failed, cleaned, unsent, outcomes };
}
