"use client";

import { Download, X } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { APP_STORE_URL, PLAY_STORE_URL } from "../lib/site";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

type Platform = "android" | "ios" | "other";

// ---------- Estado compartido (el botón del encabezado, el aviso del celular y la ventana de alertas) ----------
// Chrome manda «beforeinstallprompt» una sola vez por carga: se guarda aquí para que cualquier botón lo pueda usar.
let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(listener => listener());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    installed = true;
    notify();
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const media = window.matchMedia("(display-mode: standalone)");
  media.addEventListener("change", listener);
  return () => {
    listeners.delete(listener);
    media.removeEventListener("change", listener);
  };
}

function readPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return "android";
  if (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  return "other";
}

function readStandalone() {
  return installed || window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as { standalone?: boolean }).standalone);
}

const STORES = { android: PLAY_STORE_URL ? { name: "Google Play", url: PLAY_STORE_URL } : null, ios: APP_STORE_URL ? { name: "App Store", url: APP_STORE_URL } : null, other: null };

// Todo se decide en el navegador (el servidor no sabe qué teléfono es): en el servidor y en el primer dibujo del navegador
// no se muestra nada propio del teléfono, y así los dos coinciden.
function usePwaInstall() {
  const platform = useSyncExternalStore(subscribe, readPlatform, () => "other" as Platform);
  const standalone = useSyncExternalStore(subscribe, readStandalone, () => false);
  const canPrompt = useSyncExternalStore(subscribe, () => deferredPrompt !== null, () => false);
  const [guide, setGuide] = useState<Platform | null>(null);

  const install = async () => {
    if (deferredPrompt) {
      const prompt = deferredPrompt;
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === "accepted") {
        deferredPrompt = null;
        installed = true;
        notify();
      }
      return;
    }
    // Sin el aviso de Chrome (Safari, Samsung Internet, Firefox o ya se descartó una vez): se explica cómo hacerlo a mano.
    setGuide(platform);
  };

  return { platform, standalone, canPrompt, store: STORES[platform], install, guide, closeGuide: () => setGuide(null) };
}

const PhoneIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" width="16" height="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="5" y="2" width="14" height="20" rx="3" />
    <line x1="12" y1="18" x2="12.01" y2="18" />
    <line x1="12" y1="8" x2="12" y2="13" />
    <polyline points="9 11 12 14 15 11" />
  </svg>
);

export default function PwaInstall() {
  const { standalone, store, install, guide, closeGuide } = usePwaInstall();

  if (standalone) {
    return (
      <div className="pwa-status-pill ok" title="Ejecutándose como aplicación instalada">
        <span aria-hidden="true">✓</span> App Instalada
      </div>
    );
  }

  // Con la app publicada en la tienda de su sistema, el botón lleva a la tienda en lugar de instalar la web.
  if (store) {
    return (
      <a className="pwa-install-btn" href={store.url} target="_blank" rel="noopener noreferrer" title={`Descargar Ojo Panamá en ${store.name}`}>
        <PhoneIcon />
        <span className="pwa-btn-text">Descargar en {store.name}</span>
        <span className="pwa-btn-short">Descargar</span>
      </a>
    );
  }

  return (
    <>
      <button type="button" className="pwa-install-btn" onClick={install} title="Instalar en la pantalla de inicio de tu celular o computadora">
        <PhoneIcon />
        <span className="pwa-btn-text">Instalar la app</span>
        <span className="pwa-btn-short">Instalar</span>
      </button>
      {guide && <InstallGuide platform={guide} onClose={closeGuide} />}
    </>
  );
}

// ---------- Aviso del celular ----------
// En el celular el botón del encabezado no cabe: este aviso, arriba de la portada, dice cómo instalarla según el teléfono.
// Se puede cerrar; vuelve a estar en el panel «Más» (InstallRow).
const DISMISSED = "ojo-install-card-dismissed";
let dismissed: boolean | null = null;
function readDismissed() {
  if (dismissed === null) {
    try {
      dismissed = localStorage.getItem(DISMISSED) === "1";
    } catch {
      dismissed = false;
    }
  }
  return dismissed;
}

export function InstallCard() {
  const { platform, standalone, store, install, guide, closeGuide } = usePwaInstall();
  const isDismissed = useSyncExternalStore(subscribe, readDismissed, () => true);

  if (platform === "other" || standalone || isDismissed) return guide ? <InstallGuide platform={guide} onClose={closeGuide} /> : null;

  const dismiss = () => {
    dismissed = true;
    try {
      localStorage.setItem(DISMISSED, "1");
    } catch {
      // Sin almacenamiento: se oculta hasta que se recargue la página.
    }
    notify();
  };

  const ios = platform === "ios";
  return (
    <aside className="install-card" aria-labelledby="install-card-title">
      <span className="install-card-icon" aria-hidden="true"><Download size={22} /></span>
      <div className="install-card-text">
        <strong id="install-card-title">{ios ? "Agrega Ojo Panamá a tu iPhone" : "Instala Ojo Panamá en tu Android"}</strong>
        <p>
          {ios
            ? "Ábrela desde tu pantalla de inicio: en iPhone las alertas solo llegan así."
            : "Ábrela desde tu pantalla de inicio, como cualquier app, y recibe las alertas al instante."}
        </p>
        {store ? (
          <a className="install-card-btn" href={store.url} target="_blank" rel="noopener noreferrer">Descargar en {store.name}</a>
        ) : (
          <button type="button" className="install-card-btn" onClick={install}>{ios ? "Cómo agregarla" : "Instalar la app"}</button>
        )}
      </div>
      <button type="button" className="install-card-close" onClick={dismiss} aria-label="Cerrar aviso de instalación">
        <X aria-hidden="true" size={20} />
      </button>
      {guide && <InstallGuide platform={guide} onClose={closeGuide} />}
    </aside>
  );
}

// Fila del panel «Más» (solo en teléfonos y si la app no está instalada).
export function InstallRow({ onDone }: { onDone: () => void }) {
  const { platform, standalone, store, install, guide, closeGuide } = usePwaInstall();
  if (platform === "other" || standalone) return null;
  const label = platform === "ios" ? "Agregar a tu iPhone" : "Instalar en tu Android";
  const detail = store ? `Descargar en ${store.name}` : "Ábrela desde tu pantalla de inicio";
  const content = (
    <>
      <span className="more-sheet-icon" aria-hidden="true"><Download size={22} /></span>
      <span className="more-sheet-text"><strong>{label}</strong><small>{detail}</small></span>
    </>
  );
  return (
    <li>
      {store ? (
        <a href={store.url} target="_blank" rel="noopener noreferrer" onClick={onDone}>{content}</a>
      ) : (
        // El panel es un <dialog> modal: se cierra primero para que la guía (o el aviso de Chrome) quede encima y se pueda usar.
        <button type="button" onClick={() => { onDone(); install(); }}>{content}</button>
      )}
      {guide && <InstallGuide platform={guide} onClose={closeGuide} />}
    </li>
  );
}

// ---------- Pasos a mano ----------
const GUIDES: Record<Platform, { title: string; steps: [string, React.ReactNode][] }> = {
  ios: {
    title: "Agregar a tu iPhone o iPad",
    steps: [
      ["Toca Compartir", <>En Safari, pulsa el ícono <b>Compartir</b> (el cuadrado con la flecha hacia arriba), abajo o arriba de la pantalla.</>],
      ["Agregar a inicio", <>Baja en el menú, elige <b>«Agregar a pantalla de inicio»</b> y toca <b>Agregar</b>.</>],
      ["Ábrela desde el ícono y activa las alertas", <>Abre <b>Ojo Panamá</b> desde tu pantalla de inicio y toca <b>Alertas</b>. Solo así llegan los avisos con la app cerrada (iOS 16.4 o superior).</>],
    ],
  },
  android: {
    title: "Instalar en tu Android",
    steps: [
      ["Abre el menú del navegador", <>En Chrome, toca los tres puntos <b>⋮</b> arriba a la derecha. En Samsung Internet, el menú <b>≡</b> de abajo.</>],
      ["Instala la app", <>Elige <b>«Instalar app»</b> o <b>«Agregar a pantalla principal»</b> y confirma.</>],
      ["Ábrela desde el ícono", <>Busca <b>Ojo Panamá</b> en tu pantalla de inicio y toca <b>Alertas</b> para recibir los avisos.</>],
    ],
  },
  other: {
    title: "Instalar en tu computadora",
    steps: [
      ["Abre el menú del navegador", <>En Chrome o Edge, busca el ícono de instalar en la barra de direcciones o abre el menú <b>⋮</b>.</>],
      ["Instala la app", <>Elige <b>«Instalar Ojo Panamá»</b> y confirma.</>],
    ],
  },
};

function InstallGuide({ platform, onClose }: { platform: Platform; onClose: () => void }) {
  const guide = GUIDES[platform];
  // Va directo en <body>: así no la recorta ni la esconde el contenedor donde está el botón.
  return createPortal(
    <div className="alert-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="install-guide-title" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="alert-modal-card install-guide" style={{ maxWidth: 440 }}>
        <header className="alert-modal-header">
          <div className="alert-modal-title-box">
            <span className="alert-bell-icon" aria-hidden="true">📲</span>
            <div>
              <h2 id="install-guide-title">{guide.title}</h2>
              <p>Agrégala a tu pantalla de inicio en {guide.steps.length} pasos:</p>
            </div>
          </div>
          <button type="button" className="alert-modal-close" onClick={onClose} aria-label="Cerrar guía">✕</button>
        </header>
        <ol className="alert-modal-body install-guide-steps">
          {guide.steps.map(([title, detail]) => (
            <li key={title}><strong>{title}</strong><p>{detail}</p></li>
          ))}
        </ol>
        <footer className="alert-modal-footer">
          <button type="button" className="btn-primary" onClick={onClose}>Entendido</button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
