import { getSupabaseServerClient } from "./supabase";

// Archivo de lo que el IGC ha publicado. Su tabla solo guarda los últimos 7 días: sin esto, al salir un sismo de la tabla ya no se
// puede saber si el IGC lo confirmó, y la regla «solo se muestra lo que el IGC confirma» dejaba de valer para él (un sismo que solo
// traía el EMSC y estaba oculto volvía a aparecer, y uno que el IGC sí publicó quedaba «sin confirmar» o desaparecía).
// Cada vez que se lee la tabla se guardan sus filas en Supabase (tabla `igc_events`, ver supabase/schema.sql) y se borran las que el
// IGC quitó de su tabla estando todavía dentro de sus 7 días (preliminares que reemplazó o sismos que retiró).
// Si la tabla de Supabase no existe o no responde, todo sigue como antes de este archivo.

export type IgcArchiveRow = {
  id: string;
  time: number;
  mag: number | null;
  place: string | null;
  lat: number;
  lng: number;
  depth: number | null;
  reviewed: boolean;
  nearby: boolean;
};

// `from` y `until`: hora del sismo más antiguo y del más nuevo guardados. Entre esas dos horas el archivo dice qué confirmó el IGC.
export type IgcArchive = { rows: IgcArchiveRow[]; from: number; until: number };

const TABLE = "igc_events";
const PAGE = 1000;
const READ_EVERY_MS = 10 * 60_000;
const RETRY_READ_MS = 60_000;
const SYNC_EVERY_MS = 5 * 60_000;
const TIMEOUT_MS = 6_000;
// Guardar no debe retrasar la consulta de sismos: si Supabase tarda, se deja para el próximo intento.
const WRITE_TIMEOUT_MS = 3_000;

let cache: { at: number; archive: Promise<IgcArchive | null>; failed: boolean } | null = null;

async function readArchive(): Promise<IgcArchive | null> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;
  const rows: IgcArchiveRow[] = [];
  for (let start = 0; ; start += PAGE) {
    const { data, error } = await supabase
      .from(TABLE)
      .select("id, time, mag, place, lat, lng, depth, reviewed, nearby")
      .order("time", { ascending: true })
      .order("id", { ascending: true })
      .range(start, start + PAGE - 1)
      .abortSignal(AbortSignal.timeout(TIMEOUT_MS));
    if (error) throw new Error(error.message);
    for (const item of data ?? []) {
      const row: IgcArchiveRow = {
        id: String(item.id),
        time: Number(item.time),
        mag: item.mag === null ? null : Number(item.mag),
        place: item.place === null ? null : String(item.place),
        lat: Number(item.lat),
        lng: Number(item.lng),
        depth: item.depth === null ? null : Number(item.depth),
        reviewed: item.reviewed === true,
        nearby: item.nearby === true,
      };
      if (Number.isFinite(row.time) && Number.isFinite(row.lat) && Number.isFinite(row.lng)) rows.push(row);
    }
    if ((data?.length ?? 0) < PAGE) break;
  }
  // Vacío (recién creado, o leído con una clave sin permiso): no hay con qué confirmar nada.
  if (rows.length === 0) return null;
  return { rows, from: rows[0].time, until: rows[rows.length - 1].time };
}

export function loadIgcArchive(): Promise<IgcArchive | null> {
  const now = Date.now();
  if (cache && now - cache.at < (cache.failed ? RETRY_READ_MS : READ_EVERY_MS)) return cache.archive;
  const entry = {
    at: now,
    failed: false,
    archive: readArchive().then(
      archive => {
        if (!archive) entry.failed = true;
        return archive;
      },
      error => {
        entry.failed = true;
        console.error("Archivo del IGC no disponible:", error);
        return null;
      },
    ),
  };
  cache = entry;
  return entry.archive;
}

let lastSync: { at: number; signature: string } | null = null;
let retryAfter = 0;

// Solo en producción de Vercel: un servidor local o una vista previa cargan las mismas credenciales de Supabase (.env.local) y no deben
// escribir en la base real. `windowStart`: hora de la fila más antigua de la tabla del IGC.
export async function saveIgcTable(rows: IgcArchiveRow[], windowStart: number | null): Promise<void> {
  if (process.env.VERCEL_ENV !== "production" || rows.length === 0 || windowStart === null) return;
  const supabase = getSupabaseServerClient();
  if (!supabase) return;
  const signature = rows.map(row => `${row.id}|${row.mag}|${row.depth}|${row.reviewed}|${row.place}`).sort().join("\n");
  const now = Date.now();
  if (now < retryAfter) return;
  // Sin cambios no se escribe, salvo un repaso cada pocos minutos (otra instancia pudo guardar una versión más vieja de la tabla).
  if (lastSync && lastSync.signature === signature && now - lastSync.at < SYNC_EVERY_MS) return;
  const previous = lastSync;
  lastSync = { at: now, signature };
  try {
    // Lo que el IGC ya no lista dentro de sus propios 7 días lo quitó él: no se conserva como confirmado.
    const ids = rows.map(row => `"${row.id.replace(/[^\w:.-]/g, "")}"`).join(",");
    const [saved, removed] = await Promise.all([
      supabase
        .from(TABLE)
        .upsert(rows.map(row => ({ ...row, updated_at: new Date(now).toISOString() })), { onConflict: "id" })
        .abortSignal(AbortSignal.timeout(WRITE_TIMEOUT_MS)),
      supabase
        .from(TABLE)
        .delete()
        .gte("time", windowStart)
        .not("id", "in", `(${ids})`)
        .abortSignal(AbortSignal.timeout(WRITE_TIMEOUT_MS)),
    ]);
    const failure = saved.error ?? removed.error;
    if (failure) throw new Error(failure.message);
  } catch (error) {
    // Tras un fallo (por ejemplo, la tabla aún no existe) se espera un minuto antes de volver a intentarlo.
    lastSync = previous;
    retryAfter = now + RETRY_READ_MS;
    console.error("No se pudo guardar la tabla del IGC:", error);
  }
}
