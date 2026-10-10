import type { SupabaseClient } from "@supabase/supabase-js";
import type { Earthquake } from "./earthquakes";
import { broadcastPush } from "./push-service";
import { getSupabaseServerClient } from "./supabase";

// Qué sismos se avisan por push y a quién ya se avisó. Lo usan el cron (/api/cron/check-quakes) y la propia
// consulta de sismos de la página, que lo dispara de forma oportunista (ver runQuakeCheckThrottled).

const WINDOW_MS = 3 * 3_600_000;
const MIN_MAGNITUDE = 3.0;
// Un sismo con más antigüedad que esto ya no se avisa: llegaría como alerta vieja (catálogo publicado tarde,
// chequeo que estuvo caído). Sigue visible en la página.
export const PUSH_MAX_AGE_MS = 60 * 60_000;
// Un registro nuevo del mismo sismo (el IGC cambia el id al revisar la hora): casi la misma hora y magnitud.
const SAME_QUAKE_MS = 45_000;
const SAME_QUAKE_MAG = 0.5;
const THROTTLE_MS = 15_000;

export type NotifiedRow = { id: string; magnitude: number | null; time: number };

function sameQuake(a: { time: number; mag: number }, b: { time: number; mag: number }) {
  return Math.abs(a.time - b.time) <= SAME_QUAKE_MS && Math.abs(a.mag - b.mag) <= SAME_QUAKE_MAG;
}

export function selectQuakesToPush(events: Earthquake[], notified: NotifiedRow[], now = Date.now()): Earthquake[] {
  const ids = new Set(notified.map(row => row.id));
  const known = notified.map(row => ({ time: Number(row.time), mag: Number(row.magnitude ?? 0) }));
  const picked: Earthquake[] = [];
  for (const event of events) {
    const mag = event.properties.mag ?? 0;
    if (mag < MIN_MAGNITUDE || now - event.properties.time > PUSH_MAX_AGE_MS) continue;
    if ([event.id, ...(event.properties.aliases ?? [])].some(id => ids.has(id))) continue;
    const current = { time: event.properties.time, mag };
    if (known.some(row => sameQuake(row, current))) continue;
    // Dos registros del mismo sismo en esta misma ronda se avisan una sola vez.
    if (picked.some(other => sameQuake({ time: other.properties.time, mag: other.properties.mag ?? 0 }, current))) continue;
    picked.push(event);
  }
  return picked;
}

function pushPayload(quake: Earthquake, now: number) {
  const mag = quake.properties.mag?.toFixed(1) ?? "?.?";
  const place = quake.properties.place ?? "Panamá";
  const minutes = Math.round((now - quake.properties.time) / 60_000);
  return {
    place,
    payload: {
      title: `🚨 Sismo M${mag} en Panamá`,
      body: `${place}${minutes >= 3 ? ` · hace ${minutes} min` : ""}. Pulsa para ver mapa y recomendaciones de seguridad.`,
      id: quake.id,
      magnitude: quake.properties.mag ?? 3.0,
      place,
      time: quake.properties.time,
      url: `/?focus=${encodeURIComponent(quake.id)}`,
    },
  };
}

async function pushOne(supabase: SupabaseClient, quake: Earthquake, now: number) {
  const ids = [quake.id, ...(quake.properties.aliases ?? [])];
  const { place, payload } = pushPayload(quake, now);

  // Se reserva el sismo ANTES de enviar. Si dos ejecuciones se cruzan (el cron y una consulta de la página al
  // mismo tiempo), solo una consigue insertar la fila y la otra se retira: nadie recibe el aviso dos veces.
  const { data: claimed, error } = await supabase
    .from("notified_quakes")
    .upsert(
      ids.map(id => ({ id, magnitude: quake.properties.mag, place, time: quake.properties.time, notified_at: new Date(now).toISOString() })),
      { onConflict: "id", ignoreDuplicates: true },
    )
    .select("id");
  if (error) throw new Error(`No se pudo reservar el aviso: ${error.message}`);
  if (!claimed?.some(row => row.id === quake.id)) return { id: quake.id, skipped: true, sent: 0 };

  const result = await broadcastPush(payload, quake.properties.mag ?? 3.0);
  // Si había dispositivos y a ninguno llegó (caída del servicio de push), se libera para reintentar en la
  // siguiente ronda en vez de dar el sismo por avisado.
  if (result.total > 0 && result.sent === 0) {
    await supabase.from("notified_quakes").delete().in("id", ids);
    return { id: quake.id, skipped: false, sent: 0, retry: true };
  }
  return { id: quake.id, skipped: false, sent: result.sent };
}

export type QuakeCheckResult = {
  ok: boolean;
  configured: boolean;
  eventsChecked: number;
  newQuakes: number;
  notificationsSent: number;
  message: string;
};

export async function runQuakeCheck(events: Earthquake[], now = Date.now()): Promise<QuakeCheckResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return { ok: false, configured: false, eventsChecked: 0, newQuakes: 0, notificationsSent: 0, message: "Supabase no está conectado todavía. Agrega SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY." };
  }

  const recent = events.filter(event => now - event.properties.time <= WINDOW_MS);
  if (recent.length === 0) {
    return { ok: true, configured: true, eventsChecked: 0, newQuakes: 0, notificationsSent: 0, message: "No hay sismos recientes en la ventana de tiempo." };
  }

  // Solo los avisos de la ventana: antes se leían 500 filas sin orden y, pasado ese número, los recientes
  // quedaban fuera y se repetían avisos.
  const { data, error } = await supabase
    .from("notified_quakes")
    .select("id, magnitude, time")
    .gte("time", now - WINDOW_MS - 10 * 60_000)
    .limit(2000);
  if (error) throw new Error(`No se pudo leer los avisos enviados: ${error.message}`);

  const toPush = selectQuakesToPush(recent, (data ?? []) as NotifiedRow[], now);
  if (toPush.length === 0) {
    return { ok: true, configured: true, eventsChecked: recent.length, newQuakes: 0, notificationsSent: 0, message: "Todos los sismos recientes ya fueron avisados." };
  }

  const results = await Promise.all(toPush.map(quake => pushOne(supabase, quake, now)));
  const notificationsSent = results.reduce((sum, item) => sum + item.sent, 0);
  return {
    ok: true,
    configured: true,
    eventsChecked: recent.length,
    newQuakes: results.filter(item => !item.skipped).length,
    notificationsSent,
    message: `Se procesaron ${toPush.length} sismo(s) nuevo(s).`,
  };
}

// La página consulta /api/earthquakes cada pocos segundos mientras alguien la tiene abierta. Aprovechar esa
// consulta para revisar los push hace que un sismo llegue al celular en segundos si hay tráfico (justo lo que
// pasa cuando ocurre uno), sin depender de que algo externo llame al cron. Con un límite por instancia.
let lastRun = 0;
export async function runQuakeCheckThrottled(events: Earthquake[]) {
  // Solo en producción de Vercel. Un servidor local o una vista previa suelen cargar las mismas credenciales de
  // Supabase (.env.local) y enviarían avisos reales a los dispositivos suscritos con solo abrir la página.
  if (process.env.VERCEL_ENV !== "production") return;
  const now = Date.now();
  if (now - lastRun < THROTTLE_MS || !getSupabaseServerClient()) return;
  lastRun = now;
  try {
    await runQuakeCheck(events, now);
  } catch (error) {
    console.error("Chequeo de push desde la consulta de sismos:", error);
  }
}
