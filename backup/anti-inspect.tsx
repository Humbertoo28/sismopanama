"use client";

import { useEffect } from "react";

export default function AntiInspect() {
  useEffect(() => {
    // Solo activar en producción o en cliente
    if (typeof window === "undefined") return;

    // 1. Mensaje de seguridad en consola y anulación de logs informativos
    const banner = () => {
      try {
        console.clear();
        console.log(
          "%c🛑 ACCESO RESTRINGIDO - OJO PANAMÁ",
          "color: #ff334b; font-size: 24px; font-weight: 800; text-shadow: 0 0 10px rgba(255,51,75,0.5);",
        );
        console.log(
          "%cEsta plataforma cuenta con protecciones activas contra extracción de código, scraping automatizado e ingeniería inversa.",
          "font-size: 13px; color: #8fa0b8; font-weight: 600;",
        );
        console.log(
          "%cLos accesos a la API están auditados con detección de anomalías y control de tasa (WAF).",
          "font-size: 11px; color: #64748b;",
        );
      } catch {}
    };

    banner();
    const interval = setInterval(banner, 15_000);

    // 2. Bloqueo de menú contextual (clic derecho) para evitar "Inspeccionar elemento"
    const handleContextMenu = (e: MouseEvent) => {
      // Permitir si se hace clic sobre un campo de texto editable
      const target = e.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;
      e.preventDefault();
    };

    // 3. Bloqueo de atajos de teclado de herramientas de desarrollo
    const handleKeyDown = (e: KeyboardEvent) => {
      // F12
      if (e.key === "F12") {
        e.preventDefault();
        return;
      }

      // Ctrl + Shift + I, Ctrl + Shift + J, Ctrl + Shift + C (Windows/Linux)
      // Cmd + Option + I, Cmd + Option + J, Cmd + Option + C (macOS)
      if ((e.ctrlKey || e.metaKey) && (e.shiftKey || e.altKey)) {
        const k = e.key.toUpperCase();
        if (k === "I" || k === "J" || k === "C") {
          e.preventDefault();
          return;
        }
      }

      // Ctrl + U o Cmd + Option + U (Ver código fuente)
      if ((e.ctrlKey || (e.metaKey && e.altKey)) && e.key.toUpperCase() === "U") {
        e.preventDefault();
        return;
      }

      // Ctrl + S o Cmd + S (Guardar página completa)
      if ((e.ctrlKey || e.metaKey) && e.key.toUpperCase() === "S") {
        e.preventDefault();
        return;
      }
    };

    window.addEventListener("contextmenu", handleContextMenu, { capture: true });
    window.addEventListener("keydown", handleKeyDown, { capture: true });

    return () => {
      clearInterval(interval);
      window.removeEventListener("contextmenu", handleContextMenu, { capture: true });
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
    };
  }, []);

  return null;
}
