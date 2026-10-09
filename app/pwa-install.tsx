"use client";

import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export default function PwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(() => {
    if (typeof window === "undefined") return false;
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      Boolean((navigator as unknown as { standalone?: boolean }).standalone)
    );
  });
  const [isIos] = useState(() => {
    if (typeof window === "undefined") return false;
    return /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());
  });
  const [showIosGuide, setShowIosGuide] = useState(false);

  useEffect(() => {
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setDeferredPrompt(null);
        setIsStandalone(true);
      }
    } else if (isIos) {
      setShowIosGuide(true);
    } else {
      // Navegadores de escritorio u otros
      alert("Para instalar la app: en el menú de tu navegador pulsa 'Instalar Sismo Panamá' o 'Agregar a pantalla de inicio'.");
    }
  };

  if (isStandalone) {
    return (
      <div className="pwa-status-pill ok" title="Ejecutándose como aplicación instalada">
        <span aria-hidden="true">✓</span> App Instalada
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        className="pwa-install-btn"
        onClick={handleInstallClick}
        title="Instalar en la pantalla de inicio de tu celular o computadora"
      >
        <svg viewBox="0 0 24 24" fill="none" width="16" height="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="5" y="2" width="14" height="20" rx="3" />
          <line x1="12" y1="18" x2="12.01" y2="18" />
          <line x1="12" y1="8" x2="12" y2="13" />
          <polyline points="9 11 12 14 15 11" />
        </svg>
        <span>Instalar App Web</span>
      </button>

      {showIosGuide && (
        <div className="alert-modal-backdrop" role="dialog" aria-modal="true">
          <div className="alert-modal-card" style={{ maxWidth: 440 }}>
            <header className="alert-modal-header">
              <div className="alert-modal-title-box">
                <span className="alert-bell-icon">📲</span>
                <div>
                  <h2>Instalar en tu iPhone o iPad</h2>
                  <p>Agrégala a tu pantalla de inicio en 2 simples pasos:</p>
                </div>
              </div>
              <button
                type="button"
                className="alert-modal-close"
                onClick={() => setShowIosGuide(false)}
                aria-label="Cerrar guía"
              >
                ✕
              </button>
            </header>
            <div className="alert-modal-body" style={{ gap: 14 }}>
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start", background: "#f8fafc", padding: 12, borderRadius: 10 }}>
                <span style={{ fontSize: 20 }}>1️⃣</span>
                <div>
                  <strong style={{ fontSize: 13, color: "#17253c" }}>Toca el botón Compartir</strong>
                  <p style={{ margin: "3px 0 0", fontSize: 12, color: "#64748b" }}>
                    En la barra inferior de Safari, pulsa el icono de compartir <strong>(el cuadrado con una flecha hacia arriba ⎋)</strong>.
                  </p>
                </div>
              </div>

              <div style={{ display: "flex", gap: 12, alignItems: "flex-start", background: "#f8fafc", padding: 12, borderRadius: 10 }}>
                <span style={{ fontSize: 20 }}>2️⃣</span>
                <div>
                  <strong style={{ fontSize: 13, color: "#17253c" }}>Selecciona &quot;Agregar a inicio&quot;</strong>
                  <p style={{ margin: "3px 0 0", fontSize: 12, color: "#64748b" }}>
                    Desplázate hacia abajo y elige <strong>&quot;Agregar a la pantalla de inicio&quot; (icono ➕)</strong> y luego toca <strong>&quot;Agregar&quot;</strong>.
                  </p>
                </div>
              </div>

              <p style={{ fontSize: 11.5, color: "#64748b", margin: 0, textAlign: "center" }}>
                ¡Y listo! Tendrás el icono de Sismo Panamá en tu pantalla de inicio como cualquier otra aplicación.
              </p>
            </div>
            <footer className="alert-modal-footer">
              <button type="button" className="btn-primary" onClick={() => setShowIosGuide(false)}>
                Entendido
              </button>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}
