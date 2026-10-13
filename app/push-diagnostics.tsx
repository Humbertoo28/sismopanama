"use client";

import { CheckCircle2, CircleAlert, XCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getExistingPushSubscription, getServiceWorkerStatus, repairPushSubscription, sendTestWebPush, syncPushSubscription } from "../lib/alert-system";

// «¿No te llegan las alertas con la app cerrada?»: revisa paso a paso este equipo (navegador, permiso, suscripción, registro en
// el servidor) y ofrece una prueba real con la app cerrada. Con la página abierta ella misma avisa aunque el push no funcione, así
// que esa es la única prueba que de verdad dice si las alertas van a llegar.

type Check = { label: string; state: "ok" | "bad" | "warn"; detail?: string };
type Platform = "android" | "ios" | "other";

function platformOf(): Platform {
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  return /android/i.test(ua) ? "android" : "other";
}

const installed = () =>
  window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as unknown as { standalone?: boolean }).standalone);

export default function PushDiagnostics({ minMagnitude, onChanged }: { minMagnitude: number; onChanged: () => void }) {
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [platform, setPlatform] = useState<Platform>("other");
  const [run, setRun] = useState(0);

  // El permiso se puede conceder mientras esta revisión está abierta (al tocar «Activar» arriba): sin volver a revisar, seguía
  // diciendo «Falta dar el permiso» con el permiso ya dado. Se compara cada poco y, si cambió, se revisa de nuevo.
  const checkedPermission = useRef<string | null>(null);
  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = "Notification" in window ? Notification.permission : "denied";
      if (checkedPermission.current !== null && checkedPermission.current !== now) setRun(value => value + 1);
    }, 1_500);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let live = true;
    (async () => {
      const os = platformOf();
      const list: Check[] = [];
      const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      let workerActive = true;
      if (os === "ios" && !installed()) {
        list.push({ label: "App instalada en la pantalla de inicio", state: "bad", detail: "En iPhone y iPad las alertas con la app cerrada solo funcionan con la app instalada: toca Compartir → «Agregar a pantalla de inicio», ábrela desde el ícono y actívalas ahí." });
      } else {
        list.push({ label: "Navegador compatible", state: supported ? "ok" : "bad", detail: supported ? undefined : "Este navegador no permite alertas con la app cerrada. Prueba con Chrome (Android) o Safari con la app instalada (iPhone)." });
        if (supported) {
          // Sin service worker no hay suscripción posible: «Conectando…» sin fin suele venir de aquí.
          const worker = await getServiceWorkerStatus();
          workerActive = worker === "active";
          list.push({
            label: "Servicio de alertas de la app",
            state: worker === "active" ? "ok" : "bad",
            detail: worker === "active" ? undefined : worker === "starting" ? "Todavía está arrancando. Cierra la app por completo (desliza hacia arriba en el selector de apps) y ábrela de nuevo." : "No está activo en este equipo. Cierra la app por completo (desliza hacia arriba en el selector de apps) y ábrela de nuevo.",
          });
        }
      }
      const permission = "Notification" in window ? Notification.permission : "denied";
      checkedPermission.current = permission;
      list.push({
        label: "Permiso de notificaciones",
        state: permission === "granted" ? "ok" : "bad",
        detail: permission === "granted" ? undefined : permission === "denied" ? "Está bloqueado. Ábrelo en los ajustes del sitio (el candado junto a la dirección) → Notificaciones → Permitir." : "Falta dar el permiso: toca «Activar» arriba.",
      });
      // Sin servicio de alertas activo no se puede ni preguntar por la suscripción (esperaría en vano): ya lo dice la fila de arriba.
      if (supported && permission === "granted" && workerActive) {
        const sub = await getExistingPushSubscription();
        list.push({ label: "Suscripción en este equipo", state: sub ? "ok" : "bad", detail: sub ? undefined : "No existe: sin ella no llega nada con la app cerrada. Toca «Reparar»." });
        if (sub) {
          const saved = await syncPushSubscription(minMagnitude, true);
          list.push({ label: "Registrado en el servidor", state: saved ? "ok" : "warn", detail: saved ? undefined : "No se pudo confirmar con el servidor. Revisa tu conexión y vuelve a revisar." });
        }
      }
      if (live) {
        setPlatform(os);
        setChecks(list);
      }
    })();
    return () => { live = false; };
  }, [minMagnitude, run]);

  const repair = async () => {
    setBusy("repair");
    setMessage(null);
    const result = await repairPushSubscription(minMagnitude);
    setMessage(result.ok ? { ok: true, text: "Listo: se creó una suscripción nueva. Ahora haz la prueba con la app cerrada." } : { ok: false, text: result.error ?? "No se pudo reparar." });
    setBusy(null);
    setRun(value => value + 1);
    onChanged();
  };

  const test = async (delayed: boolean) => {
    setBusy(delayed ? "delayed" : "now");
    setMessage(null);
    const result = await sendTestWebPush(delayed);
    if (result.ok) {
      setMessage({
        ok: true,
        text: delayed
          ? "Prueba programada: llegará en 30 segundos. Cierra la app (o sal del navegador) y bloquea el teléfono ahora. Si no llega en 2 minutos, revisa los pasos de abajo."
          : "Prueba enviada: debería aparecer en unos segundos.",
      });
    } else {
      setMessage({ ok: false, text: result.error ?? "No se pudo enviar la prueba." });
      if (result.code === "expired" || result.code === "missing") setRun(value => value + 1);
    }
    setBusy(null);
  };

  const allOk = checks?.every(check => check.state === "ok");
  const tips = {
    android: (
      <ul>
        <li><b>Batería:</b> Ajustes → Aplicaciones → Chrome (o «Ojo Panamá» si la instalaste) → Batería → <b>Sin restricciones</b>.</li>
        <li><b>Xiaomi, Redmi, POCO:</b> además activa <b>Inicio automático</b> para Chrome.</li>
        <li><b>Honor y Huawei (MagicOS / EMUI):</b> Ajustes → Batería → <b>Inicio de aplicaciones</b> → Chrome → apaga «Gestionar automáticamente» y activa <b>Inicio automático</b>, <b>Inicio secundario</b> y <b>Ejecutar en segundo plano</b>. Después abre las apps recientes y <b>bloquea Chrome</b> (candado) para que el sistema no lo cierre. Desactiva también el ahorro de energía y reinicia el teléfono.</li>
        <li><b>Samsung:</b> Ajustes → Batería → Límites de uso en segundo plano: quita Chrome de «Apps en suspensión».</li>
        <li>No uses «Forzar detención» con Chrome ni lo cierres con limpiadores de memoria: dejan de llegar los avisos.</li>
        <li>Mantén pulsada una alerta de Ojo Panamá → Ajustes: que esté permitida, con sonido y, si se puede, como <b>Urgente</b>.</li>
        <li>Activa las alertas desde <b>Chrome</b>: el navegador que trae el teléfono de fábrica no está probado.</li>
      </ul>
    ),
    ios: (
      <ul>
        <li>Necesitas iOS 16.4 o más reciente y la app <b>instalada</b> (Compartir → «Agregar a pantalla de inicio»). En una pestaña de Safari no llegan.</li>
        <li>Ajustes → Notificaciones → Ojo Panamá: permitir, con <b>sonidos</b> y entrega <b>inmediata</b> (no en el resumen programado).</li>
        <li>Revisa que el modo <b>Concentración</b> (No molestar, Dormir) no silencie la app.</li>
      </ul>
    ),
    other: (
      <ul>
        <li>En computadora, el navegador tiene que estar abierto (aunque sea sin pestañas) para recibir avisos. En Chrome: Configuración → Sistema → «Seguir ejecutando aplicaciones en segundo plano».</li>
        <li>Revisa que el sistema (Windows o macOS) no tenga las notificaciones del navegador desactivadas o en modo No molestar.</li>
      </ul>
    ),
  };

  return (
    <details className="push-diagnostics" open={allOk === false}>
      <summary>¿No te llegan las alertas con la app cerrada? Revisar este equipo</summary>
      {!checks ? (
        <p className="pd-note" role="status">Revisando…</p>
      ) : (
        <ul className="pd-checks">
          {checks.map(check => (
            <li key={check.label} className={check.state}>
              {check.state === "ok" ? <CheckCircle2 aria-hidden="true" size={20} /> : check.state === "warn" ? <CircleAlert aria-hidden="true" size={20} /> : <XCircle aria-hidden="true" size={20} />}
              <span><strong>{check.label}</strong>{check.state === "ok" ? <span className="sr-only">: correcto</span> : null}{check.detail && <small>{check.detail}</small>}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="pd-actions">
        <button type="button" className="btn btn-primary btn-small" onClick={() => test(true)} disabled={busy !== null || !allOk}>
          {busy === "delayed" ? "Programando…" : "Probar con la app cerrada (30 s)"}
        </button>
        <button type="button" className="btn btn-secondary btn-small" onClick={() => test(false)} disabled={busy !== null || !allOk}>
          {busy === "now" ? "Enviando…" : "Probar ahora"}
        </button>
        <button type="button" className="btn btn-secondary btn-small" onClick={repair} disabled={busy !== null || ("Notification" in window && Notification.permission !== "granted")}>
          {busy === "repair" ? "Reparando…" : "Reparar"}
        </button>
      </div>
      {message && <p className={`pd-message ${message.ok ? "ok" : "bad"}`} role="status">{message.text}</p>}
      <div className="pd-tips">
        <strong>{platform === "android" ? "En Android" : platform === "ios" ? "En iPhone y iPad" : "En computadora"}</strong>
        {tips[platform]}
      </div>
    </details>
  );
}
