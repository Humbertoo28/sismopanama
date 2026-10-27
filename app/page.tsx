import { after } from "next/server";
import { SINCE, type EarthquakeResponse } from "../lib/earthquakes";
import { fetchPanamaEvents } from "../lib/catalogs";
import Home from "./home";

export const dynamic = "force-dynamic";

const INITIAL_EVENTS = 10;
const FRESH_MS = 30_000;
const STALE_OK_MS = 120_000;
const MIN_REFRESH_GAP_MS = 5_000;
const MAX_WAIT_MS = 1_500;

let cached: { at: number; initial: EarthquakeResponse } | null = null;
let lastRefreshAt = 0;

async function refresh() {
  lastRefreshAt = Date.now();
  try {
    const { events, catalogs } = await fetchPanamaEvents(SINCE);
    const newest = [...events].sort((a, b) => b.properties.time - a.properties.time).slice(0, INITIAL_EVENTS);
    cached = { at: Date.now(), initial: { features: newest, fetchedAt: new Date().toISOString(), catalogs } };
  } catch (error) {
    console.warn("No se pudo precargar el catálogo para el inicio:", error);
  }
}

async function loadInitial() {
  const hit = cached;
  const age = hit ? Date.now() - hit.at : Infinity;
  if (hit && age <= FRESH_MS) return hit.initial;
  if (hit && age <= STALE_OK_MS) {
    if (Date.now() - lastRefreshAt > MIN_REFRESH_GAP_MS) after(refresh);
    return hit.initial;
  }
  const pending = refresh();
  after(() => pending);
  await Promise.race([pending, new Promise(resolve => setTimeout(resolve, MAX_WAIT_MS))]);
  const latest = cached;
  return latest && Date.now() - latest.at <= STALE_OK_MS ? latest.initial : null;
}

export default async function Page() {
  return <Home initial={await loadInitial()} />;
}
