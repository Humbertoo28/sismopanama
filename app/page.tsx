import { after } from "next/server";
import { SINCE, type EarthquakeResponse } from "../lib/earthquakes";
import { fetchPanamaEvents } from "../lib/catalogs";
import Home from "./home";

export const dynamic = "force-dynamic";

const INITIAL_EVENTS = 10;
const FRESH_MS = 30_000;
const STALE_OK_MS = 120_000;
const MAX_WAIT_MS = 1_500;

let cached: { at: number; initial: EarthquakeResponse } | null = null;
let refreshing: Promise<void> | null = null;

function refresh() {
  refreshing ??= fetchPanamaEvents(SINCE)
    .then(({ events, catalogs }) => {
      const newest = [...events].sort((a, b) => b.properties.time - a.properties.time).slice(0, INITIAL_EVENTS);
      cached = { at: Date.now(), initial: { features: newest, fetchedAt: new Date().toISOString(), catalogs } };
    })
    .catch(() => undefined)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

async function loadInitial() {
  const hit = cached;
  const age = hit ? Date.now() - hit.at : Infinity;
  if (hit && age <= FRESH_MS) return hit.initial;
  const pending = refresh();
  if (hit && age <= STALE_OK_MS) {
    after(() => pending);
    return hit.initial;
  }
  await Promise.race([pending, new Promise(resolve => setTimeout(resolve, MAX_WAIT_MS))]);
  return cached?.initial ?? null;
}

export default async function Page() {
  return <Home initial={await loadInitial()} />;
}
