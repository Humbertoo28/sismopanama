import { getSupabaseServerClient } from "./supabase";
import type { ReportRow } from "./felt-reports";

// Dónde se guardan los reportes «¿Lo sentiste?»: la tabla felt_reports de Supabase (ver supabase/schema.sql). Sin Supabase,
// y solo fuera de producción, se guardan en memoria para poder probar la página en local (se pierden al reiniciar).

export type StoredReport = ReportRow & { reporter: string; ip_key: string; flagged: string | null };
export type InsertResult = "ok" | "duplicate" | "limited" | "unavailable";

// Tope de reportes por conexión (IP cifrada) y hora: deja a una familia reportar varios sismos y frena el envío masivo.
export const REPORTS_PER_HOUR = 30;
const PAGE = 1000;
const MAX_ROWS = 50_000;
const COLUMNS = "event_id, event_time, event_mag, event_place, event_lat, event_lng, felt, intensity, place_id, created_at";

type Memory = { rows: StoredReport[] };
const memory = (): Memory | null => {
  if (process.env.NODE_ENV === "production") return null;
  const store = globalThis as typeof globalThis & { __feltReports?: Memory };
  return (store.__feltReports ??= { rows: [] });
};

const strip = (row: StoredReport): ReportRow => ({
  event_id: row.event_id, event_time: row.event_time, event_mag: row.event_mag, event_place: row.event_place, event_lat: row.event_lat,
  event_lng: row.event_lng, felt: row.felt, intensity: row.intensity, place_id: row.place_id, created_at: row.created_at,
});

export function reportsAvailable() {
  return Boolean(getSupabaseServerClient() || memory());
}

export async function insertReport(report: StoredReport): Promise<InsertResult> {
  const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    const mem = memory();
    if (!mem) return "unavailable";
    if (mem.rows.some(row => row.event_id === report.event_id && row.reporter === report.reporter)) return "duplicate";
    if (mem.rows.filter(row => row.ip_key === report.ip_key && row.created_at >= hourAgo).length >= REPORTS_PER_HOUR) return "limited";
    mem.rows.push(report);
    return "ok";
  }
  const { count, error: countError } = await supabase
    .from("felt_reports")
    .select("id", { count: "exact", head: true })
    .eq("ip_key", report.ip_key)
    .gte("created_at", hourAgo);
  if (countError) throw new Error(`No se pudo revisar el límite: ${countError.message}`);
  if ((count ?? 0) >= REPORTS_PER_HOUR) return "limited";
  const { error } = await supabase.from("felt_reports").insert(report);
  // 23505: ya hay un reporte de este dispositivo para este sismo (índice único event_id + reporter).
  if (error?.code === "23505") return "duplicate";
  if (error) throw new Error(`No se pudo guardar el reporte: ${error.message}`);
  return "ok";
}

// Reportes de los sismos ocurridos desde `since` (o de los sismos con esos ids), sin el identificador del dispositivo y sin los
// apartados por los controles contra datos falsos.
export async function listReports(filter: { since: number } | { eventIds: string[] }): Promise<ReportRow[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    const rows = memory()?.rows ?? [];
    return rows.filter(row => ("since" in filter ? row.event_time >= filter.since : filter.eventIds.includes(row.event_id))).map(strip);
  }
  const rows: ReportRow[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    // Los reportes apartados por los controles (fuera del país, poco creíbles) no se publican.
    let query = supabase.from("felt_reports").select(COLUMNS).order("id", { ascending: true }).range(from, from + PAGE - 1);
    query = "since" in filter ? query.gte("event_time", filter.since) : query.in("event_id", filter.eventIds);
    const { data, error } = await query;
    if (error) throw new Error(`No se pudieron leer los reportes: ${error.message}`);
    rows.push(...((data ?? []) as ReportRow[]));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}
