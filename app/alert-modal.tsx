"use client";

import { SITE_URL } from "../lib/site";
import { useEffect, useState } from "react";
import type { Earthquake } from "../lib/earthquakes";
import {
  broadcastEarthquakeAlert,
  getExistingPushSubscription,
  getNotificationPermissionStatus,
  getTelegramShareUrl,
  getWhatsAppShareUrl,
  loadAlertPreferences,
  requestNotificationPermission,
  saveAlertPreferences,
  sendTestWebPush,
  syncPushSubscription,
  stopAlarmSound,
  subscribeToWebPush,
  unlockAudioAndSpeech,
  type AlertPreferences,
} from "../lib/alert-system";
import PwaInstall from "./pwa-install";

type AlertModalProps = {
  isOpen: boolean;
  onClose: () => void;
  latestEvent: Earthquake | null;
  onTriggerTest?: () => void;
};

export default function AlertModal({ isOpen, onClose, latestEvent }: AlertModalProps) {
  const [prefs, setPrefs] = useState<AlertPreferences>(loadAlertPreferences);
  const [permStatus, setPermStatus] = useState<NotificationPermission | "unsupported">(() => getNotificationPermissionStatus());
  const [isTesting, setIsTesting] = useState(false);
  const [isPushSubscribed, setIsPushSubscribed] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushMsg, setPushMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      getExistingPushSubscription().then((sub) => {
        setIsPushSubscribed(Boolean(sub));
      });
    }
  }, [isOpen]);

  const updatePref = <K extends keyof AlertPreferences>(key: K, value: AlertPreferences[K]) => {
    const updated = { ...prefs, [key]: value };
    setPrefs(updated);
    saveAlertPreferences(updated);
    // El umbral también lo usa el servidor para decidir a quién enviar el push: se mantiene al día.
    if (key === "minMagnitude") syncPushSubscription(Number(value));
  };

  const handleRequestPermission = async () => {
    const granted = await requestNotificationPermission();
    setPermStatus(getNotificationPermissionStatus());
    if (granted) {
      updatePref("notificationsEnabled", true);
      // Auto-suscribir a Web Push si el usuario concede permiso
      handleTogglePush();
    }
  };

  const handleTogglePush = async () => {
    setPushLoading(true);
    setPushMsg(null);
    const res = await subscribeToWebPush(prefs.minMagnitude);
    if (res.ok) {
      setIsPushSubscribed(true);
      setPushMsg("✓ ¡Suscrito con éxito a alertas en segundo plano!");
    } else {
      setPushMsg(`✕ ${res.error}`);
    }
    setPushLoading(false);
  };

  const handleTestPush = async () => {
    setPushLoading(true);
    setPushMsg(null);
    const res = await sendTestWebPush();
    if (res.ok) {
      setPushMsg("✓ Notificación push enviada. Revisa la barra de tu dispositivo.");
    } else {
      setPushMsg(`✕ ${res.error}`);
    }
    setPushLoading(false);
  };

  const handleTestAlert = async () => {
    setIsTesting(true);
    unlockAudioAndSpeech();
    const now = Date.now();
    // Simular un evento de prueba
    const testEvent: Earthquake = latestEvent ?? {
      id: `test-${now}`,
      properties: {
        mag: 4.8,
        place: "15 km al sur de Los Santos, Panamá",
        time: now,
        url: "https://earthquake.usgs.gov/",
        tsunami: 0,
      },
      geometry: { coordinates: [-80.4, 7.8, 12] },
    };

    await broadcastEarthquakeAlert(testEvent, 1, prefs, true);
    window.setTimeout(() => setIsTesting(false), 12_000);
  };

  if (!isOpen) return null;

  const currentUrl = typeof window !== "undefined" ? window.location.href : SITE_URL;
  const shareEvent: Earthquake = latestEvent ?? {
    id: "sample",
    properties: {
      mag: 4.5,
      place: "Panamá",
      time: 1760000000000,
      url: null,
    },
    geometry: { coordinates: [-80.4, 8.4, 15] },
  };

  const whatsAppUrl = getWhatsAppShareUrl(shareEvent, currentUrl);
  const telegramUrl = getTelegramShareUrl(shareEvent, currentUrl);

  return (
    <div className="alert-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="alert-modal-title">
      <div className="alert-modal-card">
        <header className="alert-modal-header">
          <div className="alert-modal-title-box">
            <span className="alert-bell-icon" aria-hidden="true">🔔</span>
            <div>
              <h2 id="alert-modal-title">Alertas Sísmicas</h2>
              <p>Avisos sonoros y notificaciones inmediatas para Panamá.</p>
            </div>
          </div>
          <button type="button" className="alert-modal-close" onClick={() => { stopAlarmSound(); onClose(); }} aria-label="Cerrar modal">
            ✕
          </button>
        </header>

        <div className="alert-modal-body">
          {/* Sección de Notificaciones del Sistema */}
          <div className="alert-setting-row">
            <div className="alert-setting-info">
              <strong>Notificaciones en pantalla</strong>
              <span>Avisos visuales en tu celular o computadora.</span>
              <div className="perm-badge-wrap">
                {permStatus === "granted" && <span className="perm-badge ok">✓ Activadas</span>}
                {permStatus === "denied" && <span className="perm-badge danger">✕ Bloqueadas en tu navegador</span>}
                {permStatus === "default" && <span className="perm-badge warning">⚠ Requiere permiso</span>}
                {permStatus === "unsupported" && <span className="perm-badge muted">No soportadas en este navegador</span>}
              </div>
            </div>
            {permStatus === "granted" ? (
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={prefs.notificationsEnabled}
                  onChange={e => updatePref("notificationsEnabled", e.target.checked)}
                />
                <span className="toggle-slider" />
              </label>
            ) : (
              <button
                type="button"
                className="perm-req-btn"
                onClick={handleRequestPermission}
                disabled={permStatus === "denied" || permStatus === "unsupported"}
              >
                Activar
              </button>
            )}
          </div>

          {/* Sección de Web Push (Segundo plano / App cerrada) */}
          <div className="alert-setting-row" style={{ background: "rgba(14, 165, 233, 0.08)", border: "1px solid rgba(14, 165, 233, 0.25)", borderRadius: "10px", padding: "14px 12px" }}>
            <div className="alert-setting-info">
              <strong style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span>📲</span> Alertas con la app cerrada
                <span style={{ fontSize: "10px", background: "#0284c7", color: "#fff", padding: "2px 6px", borderRadius: "4px", fontWeight: "700" }}>24/7</span>
              </strong>
              <span>
                Recibe avisos aunque no tengas la página web abierta.
              </span>
              <div className="perm-badge-wrap" style={{ marginTop: "6px" }}>
                {isPushSubscribed ? (
                  <span className="perm-badge ok">✓ Activo en segundo plano</span>
                ) : (
                  <span className="perm-badge warning">⚠ No activado</span>
                )}
              </div>
              {pushMsg && (
                <div style={{ marginTop: "6px", fontSize: "11px", color: pushMsg.startsWith("✓") ? "#34d399" : "#f87171" }}>
                  {pushMsg}
                </div>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", alignItems: "flex-end" }}>
              <button
                type="button"
                className="perm-req-btn"
                style={{
                  background: isPushSubscribed ? "#047857" : "#0284c7",
                  fontSize: "11px",
                  padding: "8px 12px",
                  whiteSpace: "nowrap",
                }}
                onClick={handleTogglePush}
                disabled={pushLoading}
              >
                {pushLoading ? "Conectando…" : isPushSubscribed ? "✓ Actualizar" : "Activar 24/7"}
              </button>
              {isPushSubscribed && (
                <button
                  type="button"
                  style={{
                    background: "rgba(255,255,255,0.08)",
                    border: "1px solid rgba(255,255,255,0.2)",
                    borderRadius: "6px",
                    color: "#fff",
                    fontSize: "10px",
                    padding: "5px 8px",
                    cursor: "pointer",
                  }}
                  onClick={handleTestPush}
                  disabled={pushLoading}
                >
                  Probar envío
                </button>
              )}
            </div>
          </div>

          {/* Sección de Sonido de Emergencia */}
          <div className="alert-setting-row">
            <div className="alert-setting-info">
              <strong>Sirena de alarma</strong>
              <span>Alarma sonora inmediata si ocurre un temblor.</span>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={prefs.soundEnabled}
                onChange={e => updatePref("soundEnabled", e.target.checked)}
              />
              <span className="toggle-slider" />
            </label>
          </div>

          {/* Sección de Voz en Español */}
          <div className="alert-setting-row">
            <div className="alert-setting-info">
              <strong>Voz en español</strong>
              <span>Anuncia la magnitud y ubicación del sismo en voz alta.</span>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={prefs.voiceEnabled}
                onChange={e => updatePref("voiceEnabled", e.target.checked)}
              />
              <span className="toggle-slider" />
            </label>
          </div>

          {/* Filtro por magnitud */}
          <div className="alert-setting-row">
            <div className="alert-setting-info">
              <strong>Magnitud mínima</strong>
              <span>Filtra temblores leves o solo sismos perceptibles.</span>
            </div>
            {/* El valor guardado es un número (5) y React lo compara como texto con el de la opción: "5" no es igual a
                "5.0", así que el selector volvía a mostrar "Todos" aunque la elección sí se guardaba. Los valores de
                las opciones se escriben igual que el número: 0, 3, 4, 5. */}
            <select
              className="mag-threshold-select"
              value={String(prefs.minMagnitude)}
              onChange={e => updatePref("minMagnitude", Number(e.target.value))}
            >
              <option value="0">Todos los sismos (M ≥ 0.0)</option>
              <option value="3">Sismos perceptibles (M ≥ 3.0)</option>
              <option value="4">Moderados a fuertes (M ≥ 4.0)</option>
              <option value="5">Solo sismos mayores (M ≥ 5.0)</option>
            </select>
          </div>

          {/* Instalar App Web */}
          <div className="alert-setting-row">
            <div className="alert-setting-info">
              <strong>Instalar acceso directo</strong>
              <span>Agrégala a tu pantalla de inicio para abrirla rápido.</span>
            </div>
            <PwaInstall />
          </div>

          {/* Probar la alerta */}
          <div className="alert-test-box">
            <div>
              <strong>Probar alerta</strong>
              <p>Prueba la sirena, la voz y la notificación en este equipo.</p>
            </div>
            <div className="alert-test-actions">
              <button
                type="button"
                className={`btn-test-alert${isTesting ? " testing" : ""}`}
                onClick={handleTestAlert}
                disabled={isTesting}
              >
                {isTesting ? "🔊 Sonando…" : "🔊 Probar alerta"}
              </button>
              {isTesting && (
                <button
                  type="button"
                  className="btn-stop-alert"
                  onClick={() => { stopAlarmSound(); setIsTesting(false); }}
                >
                  Detener
                </button>
              )}
            </div>
          </div>

          {/* Difundir alerta a todos por WhatsApp / Telegram */}
          <div className="broadcast-box">
            <div className="broadcast-header">
              <span className="broadcast-icon">📢</span>
              <div>
                <strong>Avisar a familiares</strong>
                <p>Comparte los datos de este sismo por WhatsApp o Telegram.</p>
              </div>
            </div>
            <div className="broadcast-buttons">
              <a
                href={whatsAppUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-broadcast whatsapp"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18" aria-hidden="true">
                  <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0 0 12.04 2m.01 1.67c2.2 0 4.26.86 5.82 2.41a8.173 8.173 0 0 1 2.4 5.83c0 4.54-3.7 8.24-8.24 8.24-1.45 0-2.87-.38-4.12-1.11l-.3-.17-3.12.82.83-3.04-.19-.31a8.217 8.217 0 0 1-1.26-4.43c0-4.54 3.7-8.24 8.24-8.24m4.52 11.66c-.25-.13-1.47-.72-1.7-.81-.23-.08-.39-.13-.56.13-.17.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.13-1.06-.39-2.03-1.25-.75-.67-1.26-1.5-1.41-1.75-.14-.25-.02-.39.11-.51.11-.11.25-.29.37-.43.13-.15.17-.25.25-.42.08-.17.04-.31-.02-.44-.06-.13-.56-1.35-.77-1.85-.2-.49-.41-.42-.56-.43h-.48c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.1 0 1.24.9 2.44 1.03 2.61.13.17 1.77 2.7 4.29 3.79.6.26 1.07.41 1.43.53.6.19 1.15.16 1.58.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.15-1.18-.06-.11-.23-.17-.48-.3" />
                </svg>
                Enviar alerta por WhatsApp
              </a>
              <a
                href={telegramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-broadcast telegram"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18" aria-hidden="true">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2m4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 0 0-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.52 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .33" />
                </svg>
                Compartir por Telegram
              </a>
            </div>
          </div>
        </div>

        <footer className="alert-modal-footer">
          <button type="button" className="btn-primary" onClick={() => { stopAlarmSound(); onClose(); }}>
            Listo, mantener monitoreo
          </button>
        </footer>
      </div>
    </div>
  );
}
