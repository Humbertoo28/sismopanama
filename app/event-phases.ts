"use client";

import { useEffect, useState } from "react";
import type { EventPhases } from "../lib/usgs-phases";

// Llegadas reales de las ondas a las estaciones (producto «phase-data» del USGS), pedidas al servidor una sola vez por sismo.
const cache = new Map<string, EventPhases | null>();
const pending = new Map<string, Promise<EventPhases | null>>();

// Solo los sismos del USGS traen estas llegadas; los del IGC y el EMSC tienen otro formato de id.
export const hasUsgsId = (id: string) => /^[a-z]{2}[0-9a-z]{6,12}$/.test(id);

export function loadEventPhases(id: string): Promise<EventPhases | null> {
  if (!hasUsgsId(id)) return Promise.resolve(null);
  if (cache.has(id)) return Promise.resolve(cache.get(id) ?? null);
  let request = pending.get(id);
  if (!request) {
    request = fetch(`/api/earthquakes/phases?id=${encodeURIComponent(id)}`)
      .then(response => (response.ok ? (response.json() as Promise<EventPhases>) : null))
      .catch(() => null)
      .then(data => {
        cache.set(id, data);
        pending.delete(id);
        return data;
      });
    pending.set(id, request);
  }
  return request;
}

export function useEventPhases(id: string | null) {
  const [, refresh] = useState(0);
  useEffect(() => {
    if (!id || !hasUsgsId(id) || cache.has(id)) return;
    let alive = true;
    loadEventPhases(id).then(() => alive && refresh(count => count + 1));
    return () => {
      alive = false;
    };
  }, [id]);
  if (!id || !hasUsgsId(id)) return { status: "none" as const, phases: null };
  if (!cache.has(id)) return { status: "loading" as const, phases: null };
  const phases = cache.get(id) ?? null;
  return phases && phases.stations.length > 0 ? { status: "ready" as const, phases } : { status: "none" as const, phases: null };
}
