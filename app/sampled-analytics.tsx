"use client";

import { useSyncExternalStore } from "react";
import { Analytics } from "@vercel/analytics/next";

// Vercel cobra cada evento de Analytics y el sitio recibe cientos de miles de visitas al día. Solo se mide una de cada
// diez: la misma visita se cuenta o no durante toda la sesión, y a las demás ni siquiera se les carga el script.
// Las cifras del panel de Vercel son una muestra: multiplícalas por 10. Para medir todo, pon SAMPLE_RATE en 1.
const SAMPLE_RATE = 0.1;

let sampled: boolean | null = null;

function computeSampled() {
  try {
    const saved = sessionStorage.getItem("sismo_panama_va_sample");
    if (saved !== null) return saved === "1";
    const pick = Math.random() < SAMPLE_RATE;
    sessionStorage.setItem("sismo_panama_va_sample", pick ? "1" : "0");
    return pick;
  } catch {
    return Math.random() < SAMPLE_RATE;
  }
}

function isSampled() {
  sampled ??= computeSampled();
  return sampled;
}

const subscribeNothing = () => () => {};

export default function SampledAnalytics() {
  const on = useSyncExternalStore(subscribeNothing, isSampled, () => false);
  return on ? <Analytics /> : null;
}
