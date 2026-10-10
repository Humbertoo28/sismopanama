"use client";

import { useState, useSyncExternalStore } from "react";
import { detectInAppBrowser, type InAppInfo } from "../lib/in-app-browser";
import "./in-app-browser-notice.css";

const DISMISSED = "iab-notice-dismissed";

// El navegador del visitante no cambia mientras la página está abierta: no hay nada a lo que suscribirse.
const subscribe = () => () => {};

// "" = no mostrar; si no, "plataforma|app". En el servidor siempre es "" (no hay navegador que revisar).
function readSnapshot() {
  try {
    if (sessionStorage.getItem(DISMISSED) === "1") return "";
  } catch {
    // Sin almacenamiento (modo privado o vista integrada): se muestra igual.
  }
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  const info = detectInAppBrowser(navigator.userAgent, standalone);
  return info ? `${info.platform}|${info.app}` : "";
}

export default function InAppBrowserNotice() {
  const key = useSyncExternalStore(subscribe, readSnapshot, () => "");
  const [closed, setClosed] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!key || closed) return null;
  const [platform, app] = key.split("|") as [InAppInfo["platform"], string];
  const info = { platform, app };

  const address = window.location.origin;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${address}/`);
      setCopied(true);
    } catch {
      // Algunas vistas integradas no dejan copiar: la dirección se muestra abajo para copiarla a mano.
    }
  };
  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISSED, "1");
    } catch {
      // Da igual: solo se vuelve a mostrar en la próxima visita.
    }
    setClosed(true);
  };

  return (
    <aside className="iab" role="alert" aria-labelledby="iab-title">
      <strong id="iab-title">Ábrelo en tu navegador para recibir las alertas</strong>
      <p>
        Estás viendo esta página dentro de {info.app === "otra aplicación" ? "otra aplicación" : info.app}. Desde aquí el celular
        no deja activar las notificaciones. Con un par de toques puedes abrirla en el navegador:
      </p>
      {info.platform === "ios" ? (
        <ol>
          <li>Toca los tres puntos <b>⋯</b> (o el ícono de compartir) y elige <b>«Abrir en Safari»</b>.</li>
          <li>Ya en Safari, toca <b>Compartir → «Agregar a pantalla de inicio»</b> y abre la app desde su ícono: en iPhone las alertas solo funcionan así.</li>
        </ol>
      ) : (
        <ol>
          <li>Toca los tres puntos <b>⋮</b> y elige <b>«Abrir en Chrome»</b> (o «Abrir en el navegador»).</li>
          <li>Ya en Chrome, pulsa <b>«Activar alertas»</b> y acepta el permiso.</li>
        </ol>
      )}
      <p className="iab-address">¿No te aparece la opción? Copia esta dirección y pégala en tu navegador: <b>{address.replace(/^https?:\/\//, "")}</b></p>
      <div className="iab-actions">
        <button type="button" className="iab-primary" onClick={copy}>{copied ? "✓ Enlace copiado" : "Copiar enlace"}</button>
        <button type="button" onClick={dismiss}>Seguir aquí</button>
      </div>
    </aside>
  );
}
