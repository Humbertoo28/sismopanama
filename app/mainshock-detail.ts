"use client";

import { useSyncExternalStore } from "react";
import type { MainshockDetail } from "../lib/usgs-detail";

// Los productos del USGS (mecanismo, falla, «¿Lo sentiste?») pesan ~30 KB y casi nadie los mira: no se piden al abrir
// la página, sino la primera vez que alguien activa una capa, la vista 3D o abre la ficha. Una sola copia para todos.
export type DetailState = { status: "idle" | "loading" | "ready" | "error"; detail: MainshockDetail | null };

let state: DetailState = { status: "idle", detail: null };
const listeners = new Set<() => void>();
const IDLE: DetailState = state;

function set(next: DetailState) {
  state = next;
  listeners.forEach(listener => listener());
}

export function loadMainshockDetail() {
  if (state.status === "loading" || state.status === "ready") return;
  set({ status: "loading", detail: null });
  fetch("/api/earthquakes/detail")
    .then(response => (response.ok ? (response.json() as Promise<MainshockDetail>) : Promise.reject(new Error(String(response.status)))))
    .then(detail => set({ status: "ready", detail }))
    .catch(() => set({ status: "error", detail: null }));
}

export function useMainshockDetail(): DetailState {
  return useSyncExternalStore(
    listener => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    () => state,
    () => IDLE,
  );
}
