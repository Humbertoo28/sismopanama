import type { SupabaseClient } from "@supabase/supabase-js";
import { broadcastPush, type WebPushPayload } from "./push-service";

// Aviso único a TODAS las suscripciones: que nos sigan en Instagram (@ojopanama507), pedido por quien administra el sitio el 14 de
// octubre de 2026. Lo dispara el cron de cada minuto en producción y solo se envía UNA vez: antes de enviar se reserva una fila en
// `notified_quakes` (la misma tabla y la misma técnica que las alertas), y quien no consigue reservarla se retira. Una vez enviado,
// este archivo y su llamada en el cron se quitan (el texto queda en el README).
//
// Va a todas las suscripciones, sin importar la magnitud mínima que eligió cada persona: el tope de ese ajuste es 10
// (lib/push-validation.ts) y el filtro es `min_magnitude <= 10`. El payload no lleva `magnitude`, para que ni el service worker ni la
// página abierta lo traten como un sismo (sin sirena ni voz); el prefijo «anuncio-» lo excluye public/sw.js de la sirena pase lo que pase.
export const ANNOUNCEMENT_ID = "anuncio-instagram-ojopanama507-2026-10-14";
const CLAIM_ID = `broadcast:${ANNOUNCEMENT_ID}`;
const AUDIENCE_MIN_MAGNITUDE = 10;
const BUDGET_MS = 100_000;

export const ANNOUNCEMENT_PAYLOAD: WebPushPayload = {
  title: "Ojo Panamá en Instagram",
  body: "Síguenos en Instagram: @ojopanama507",
  id: ANNOUNCEMENT_ID,
  url: "/",
};

type Broadcast = typeof broadcastPush;
export type AnnouncementResult =
  | { status: "skipped"; reason: "not-production" | "already-sent" }
  | { status: "retry"; total: number }
  | { status: "sent"; total: number; sent: number; unsent: number };

// Una vez reservado o confirmado que ya se envió, no se vuelve a consultar la base en cada minuto.
let settled = false;

export async function sendAnnouncementOnce(
  supabase: SupabaseClient,
  deps: { broadcast: Broadcast; production: boolean; now: number } = { broadcast: broadcastPush, production: process.env.VERCEL_ENV === "production", now: Date.now() },
): Promise<AnnouncementResult> {
  // Un servidor local o una vista previa cargan las mismas credenciales de Supabase: nunca envían esto.
  if (!deps.production) return { status: "skipped", reason: "not-production" };
  if (settled) return { status: "skipped", reason: "already-sent" };

  const { data: existing, error: readError } = await supabase.from("notified_quakes").select("id").eq("id", CLAIM_ID).limit(1);
  if (readError) throw new Error(`No se pudo leer la reserva del aviso: ${readError.message}`);
  if (existing && existing.length > 0) {
    settled = true;
    return { status: "skipped", reason: "already-sent" };
  }

  // Se reserva ANTES de enviar: si dos ejecuciones se cruzan, solo una consigue insertar la fila.
  const { data: claimed, error } = await supabase
    .from("notified_quakes")
    .upsert([{ id: CLAIM_ID, magnitude: null, place: ANNOUNCEMENT_PAYLOAD.title, time: deps.now, notified_at: new Date(deps.now).toISOString() }], { onConflict: "id", ignoreDuplicates: true })
    .select("id");
  if (error) throw new Error(`No se pudo reservar el aviso: ${error.message}`);
  if (!claimed?.some(row => row.id === CLAIM_ID)) {
    settled = true;
    return { status: "skipped", reason: "already-sent" };
  }

  const result = await deps.broadcast(ANNOUNCEMENT_PAYLOAD, AUDIENCE_MIN_MAGNITUDE, BUDGET_MS);
  // Si había dispositivos y a ninguno llegó (caída del servicio de push), se libera para reintentar en la siguiente ronda.
  if (result.total > 0 && result.sent === 0) {
    await supabase.from("notified_quakes").delete().eq("id", CLAIM_ID);
    return { status: "retry", total: result.total };
  }
  settled = true;
  return { status: "sent", total: result.total, sent: result.sent, unsent: result.unsent };
}
