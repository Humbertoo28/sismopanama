"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Earthquake } from "../lib/earthquakes";
import { playVoiceAlert, spokenPlace } from "../lib/alert-system";
import { getLatestQuake, subscribeLatestQuake } from "../lib/latest-quake";
import { spokenWhere } from "../lib/place-of";
import { getThemeChoice, setThemeChoice, subscribeTheme, type ThemeChoice } from "../lib/theme";

// Opciones de accesibilidad que elige cada persona (se guardan solo en su navegador). Cada una se aplica con un atributo en
// <html> (data-a11y-*) o la variable --ts del tamaño de texto, y el CSS (accessibility.css y los font-size de calc(...*var(--ts)))
// hace el resto. El script de app/layout.tsx las aplica antes de pintar la página para que no haya saltos.
type Settings = { scale: number; contrast: boolean; motion: boolean; links: boolean; spacing: boolean };

export const A11Y_KEY = "sismo_panama_a11y_v1";
const SCALES: { value: number; short: string; label: string }[] = [
  { value: 1, short: "A", label: "Texto normal" },
  { value: 1.15, short: "A+", label: "Texto grande (115 %)" },
  { value: 1.3, short: "A++", label: "Texto muy grande (130 %)" },
];
const DEFAULTS: Settings = { scale: 1, contrast: false, motion: false, links: false, spacing: false };

function readSaved(): Settings | null {
  try {
    const raw = JSON.parse(localStorage.getItem(A11Y_KEY) ?? "null");
    return raw && typeof raw === "object" ? { ...DEFAULTS, ...raw } : null;
  } catch {
    return null;
  }
}

function applySettings(settings: Settings) {
  const root = document.documentElement;
  root.style.setProperty("--ts", String(settings.scale));
  root.dataset.a11yScale = settings.scale > 1 ? "large" : "normal";
  root.dataset.a11yContrast = settings.contrast ? "high" : "normal";
  root.dataset.a11yMotion = settings.motion ? "reduce" : "normal";
  root.dataset.a11yLinks = settings.links ? "underline" : "normal";
  root.dataset.a11ySpacing = settings.spacing ? "wide" : "normal";
}

function lastQuakeSpeech(event: Earthquake) {
  const mag = event.properties.mag === null ? "desconocida" : event.properties.mag.toFixed(1).replace(".", " coma ");
  const minutes = Math.max(0, Math.round((Date.now() - event.properties.time) / 60_000));
  const ago = minutes < 2 ? "hace un momento" : minutes < 60 ? `hace ${minutes} minutos` : `hace ${Math.round(minutes / 60)} horas`;
  return `Último sismo registrado en Panamá. Magnitud ${mag}, ${spokenPlace(event.properties.place)}, ${spokenWhere(event)}. Ocurrió ${ago}.`;
}

// Primer elemento al que llega el teclado: salta el menú y lleva directo al contenido de la página.
export function SkipLink() {
  const [target, setTarget] = useState("#contenido");
  // El destino es el <main> de la página (la principal ya lo tiene con id="inicio"; a las demás se les da uno).
  useEffect(() => {
    const main = document.querySelector<HTMLElement>("main");
    if (!main) return;
    if (!main.id) main.id = "contenido";
    main.setAttribute("tabindex", "-1");
    setTarget(`#${main.id}`);
  }, []);
  return (
    <nav aria-label="Saltar al contenido">
      <a
        className="skip-link"
        href={target}
        onClick={event => {
          event.preventDefault();
          const main = document.querySelector<HTMLElement>("main");
          if (!main) return;
          main.focus({ preventScroll: true });
          main.scrollIntoView({ behavior: "auto", block: "start" });
        }}
      >
        Saltar al contenido principal
      </a>
    </nav>
  );
}

export default function Accessibility() {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [ready, setReady] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const latest = useSyncExternalStore(subscribeLatestQuake, getLatestQuake, () => null);
  const themeChoice = useSyncExternalStore(subscribeTheme, getThemeChoice, (): ThemeChoice => "auto");
  const fab = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  // Sin nada guardado se parte de lo que pide el dispositivo (más contraste, menos movimiento).
  useEffect(() => {
    const saved = readSaved();
    setSettings(saved ?? {
      ...DEFAULTS,
      contrast: window.matchMedia("(prefers-contrast: more)").matches,
      motion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    });
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready) applySettings(settings);
  }, [settings, ready]);

  const change = (patch: Partial<Settings>) =>
    setSettings(previous => {
      const next = { ...previous, ...patch };
      try {
        localStorage.setItem(A11Y_KEY, JSON.stringify(next));
      } catch {
        // Sin almacenamiento la opción vale solo para esta visita.
      }
      return next;
    });

  // Escape cierra el panel y devuelve el foco al botón; al abrirse el foco entra en el panel.
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => panel.current?.querySelector<HTMLElement>("button")?.focus(), 0);
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      fab.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!speaking) return;
    const timer = window.setInterval(() => {
      if (!window.speechSynthesis?.speaking) setSpeaking(false);
    }, 500);
    return () => window.clearInterval(timer);
  }, [speaking]);

  const toggleSpeech = () => {
    if (!latest || !("speechSynthesis" in window)) return;
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    playVoiceAlert(lastQuakeSpeech(latest));
    setSpeaking(true);
  };

  const switches: { key: "contrast" | "motion" | "links" | "spacing"; label: string; hint: string }[] = [
    { key: "contrast", label: "Alto contraste", hint: "Textos más oscuros y bordes marcados" },
    { key: "motion", label: "Reducir animaciones", hint: "Sin temblor del mapa ni efectos de movimiento" },
    { key: "links", label: "Subrayar enlaces", hint: "Los enlaces siempre se ven subrayados" },
    { key: "spacing", label: "Más espacio en el texto", hint: "Más separación entre letras, palabras y líneas" },
  ];

  return (
    <aside aria-label="Opciones de accesibilidad">
      <button
        ref={fab}
        type="button"
        className="a11y-fab"
        aria-label="Accesibilidad"
        aria-expanded={open}
        aria-controls="a11y-panel"
        onClick={() => setOpen(value => !value)}
      >
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
          <circle cx="12" cy="4.2" r="2.2" fill="currentColor" />
          <path d="M4 8.2h16v2.1h-6.2v3.1l2.4 6.6-2 .8-2.2-6h-.1l-2.2 6-2-.8 2.4-6.6v-3.1H4z" fill="currentColor" />
        </svg>
        <span>Accesibilidad</span>
      </button>
      {open && (
        <div id="a11y-panel" ref={panel} className="a11y-panel" role="dialog" aria-label="Opciones de accesibilidad">
          <div className="a11y-head">
            <strong>Accesibilidad</strong>
            <button type="button" className="a11y-close" onClick={() => { setOpen(false); fab.current?.focus(); }} aria-label="Cerrar opciones de accesibilidad">✕</button>
          </div>
          <div className="a11y-group" role="group" aria-label="Tamaño del texto">
            <span className="a11y-label">Tamaño del texto</span>
            <div className="a11y-scales">
              {SCALES.map(item => (
                <button key={item.value} type="button" aria-pressed={settings.scale === item.value} aria-label={item.label} className={settings.scale === item.value ? "on" : ""} onClick={() => change({ scale: item.value })}>
                  {item.short}
                </button>
              ))}
            </div>
          </div>
          <div className="a11y-group" role="group" aria-label="Apariencia">
            <span className="a11y-label">Apariencia</span>
            <div className="a11y-scales a11y-themes">
              {([["auto", "Automático"], ["light", "Claro"], ["dark", "Oscuro"]] as const).map(([value, label]) => (
                <button key={value} type="button" aria-pressed={themeChoice === value} className={themeChoice === value ? "on" : ""} onClick={() => setThemeChoice(value)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          {switches.map(item => (
            <button key={item.key} type="button" role="switch" aria-checked={settings[item.key]} className="a11y-switch" onClick={() => change({ [item.key]: !settings[item.key] })}>
              <span className="a11y-switch-text"><strong>{item.label}</strong><small>{item.hint}</small></span>
              <span className="a11y-track" aria-hidden="true"><i /></span>
            </button>
          ))}
          <button type="button" className="a11y-action" onClick={toggleSpeech} disabled={!latest}>
            <span aria-hidden="true">{speaking ? "⏹" : "🔊"}</span> {speaking ? "Detener la lectura" : "Escuchar el último sismo"}
          </button>
          {!latest && <p className="a11y-note">La lectura en voz alta está disponible en la página principal.</p>}
          <Link href="/resumen" className="a11y-link" onClick={() => setOpen(false)}>Resumen en texto sencillo</Link>
          <button type="button" className="a11y-reset" onClick={() => change({ ...DEFAULTS })}>Restablecer</button>
        </div>
      )}
    </aside>
  );
}
