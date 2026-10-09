import { kmBetween, type Earthquake } from "./earthquakes";

export type AlertPreferences = {
  notificationsEnabled: boolean;
  soundEnabled: boolean;
  voiceEnabled?: boolean;
  minMagnitude: number;
};

const DEFAULT_PREFERENCES: AlertPreferences = {
  notificationsEnabled: true,
  soundEnabled: true,
  voiceEnabled: false,
  minMagnitude: 0,
};

const STORAGE_PREFS_KEY = "sismo_panama_alert_prefs_v1";
const STORAGE_SEEN_KEY = "sismo_panama_seen_v2";

// Un sismo que ocurrió hace más de esto ya no justifica sirena: se avisa en pantalla y en silencio.
// Así, al reabrir la app o despertar el equipo no suena una alarma por algo que pasó hace rato.
export const ALARM_MAX_AGE_MS = 15 * 60_000;
const SIREN_MAX_MS = 6000;
const SEEN_LIMIT = 400;

let globalAudioCtx: AudioContext | null = null;
let currentAlarmNodes: { osc1: OscillatorNode; osc2?: OscillatorNode; gain: GainNode } | null = null;
let currentAudioElement: HTMLAudioElement | null = null;
// Cada alerta nueva (o cada "silenciar") cambia la tanda: lo que quedó pendiente de la anterior se descarta.
let alarmRun = 0;
let alarmTimer: number | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!globalAudioCtx) {
    try {
      globalAudioCtx = new AudioCtx();
    } catch (e) {
      console.warn("No se pudo iniciar AudioContext:", e);
    }
  }
  if (globalAudioCtx && globalAudioCtx.state === "suspended") {
    globalAudioCtx.resume().catch(() => {});
  }
  return globalAudioCtx;
}

export function stopAlarmSound() {
  alarmRun++;
  if (typeof window !== "undefined" && alarmTimer !== null) {
    window.clearTimeout(alarmTimer);
    alarmTimer = null;
  }
  if (currentAudioElement) {
    try {
      currentAudioElement.onended = null;
      currentAudioElement.onerror = null;
      currentAudioElement.pause();
      currentAudioElement.currentTime = 0;
    } catch {
      // Ignorar si falla
    }
    currentAudioElement = null;
  }
  if (currentAlarmNodes) {
    try {
      currentAlarmNodes.osc1.onended = null;
      currentAlarmNodes.gain.gain.setValueAtTime(0.0001, globalAudioCtx?.currentTime ?? 0);
      currentAlarmNodes.osc1.stop();
      currentAlarmNodes.osc2?.stop();
    } catch {
      // Ignorar si ya se detuvo
    }
    currentAlarmNodes = null;
  }
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // Ignorar
    }
  }
}

// Reproduce la sirena y llama a `onEnd` cuando termina (o si no se pudo oír), para que la voz hable
// después de ella y no encima. Si llega otra alerta o se silencia, `onEnd` ya no se ejecuta.
export function playEmergencyAlarmSound(onEnd?: () => void) {
  if (typeof window === "undefined") return;
  stopAlarmSound();
  const run = alarmRun;
  let done = false;
  const finish = () => {
    if (done || run !== alarmRun) return;
    done = true;
    if (alarmTimer !== null) {
      window.clearTimeout(alarmTimer);
      alarmTimer = null;
    }
    onEnd?.();
  };
  alarmTimer = window.setTimeout(finish, SIREN_MAX_MS);

  // 1. Primero mediante elemento Audio (/siren.wav) para máxima compatibilidad móvil y escritorio
  let fellBack = false;
  const fallBack = () => {
    if (fellBack || run !== alarmRun) return;
    fellBack = true;
    playSynthesizedSiren(finish);
  };
  try {
    const audio = new Audio("/siren.wav");
    audio.volume = 1.0;
    audio.onended = finish;
    audio.onerror = fallBack;
    currentAudioElement = audio;
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch((err) => {
        console.warn("Audio play falló, usando Web Audio:", err);
        fallBack();
      });
    }
  } catch (e) {
    console.warn("Error iniciando Audio('/siren.wav'):", e);
    fallBack();
  }
}

function playSynthesizedSiren(onEnd: () => void) {
  const ctx = getAudioContext();
  if (!ctx) {
    onEnd();
    return;
  }

  const runSynth = () => {
    // Con el audio bloqueado por el navegador no habrá sonido: no se hace esperar a la voz.
    if (ctx.state !== "running") {
      onEnd();
      return;
    }
    try {
      const now = ctx.currentTime;
      const duration = 3.8;

      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0.35, now);
      masterGain.gain.setValueAtTime(0.35, now + duration - 0.3);
      masterGain.gain.linearRampToValueAtTime(0.001, now + duration);
      masterGain.connect(ctx.destination);

      const osc1 = ctx.createOscillator();
      osc1.type = "sawtooth";

      const cycles = Math.floor(duration / 0.35);
      for (let i = 0; i < cycles; i++) {
        const t = now + i * 0.35;
        osc1.frequency.setValueAtTime(i % 2 === 0 ? 880 : 660, t);
      }

      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(1400, now);

      osc1.connect(filter);
      filter.connect(masterGain);

      osc1.onended = onEnd;
      osc1.start(now);
      osc1.stop(now + duration);

      currentAlarmNodes = { osc1, gain: masterGain };
    } catch (err) {
      console.warn("Error en sintetizador de sirena:", err);
      onEnd();
    }
  };

  if (ctx.state === "suspended") {
    ctx.resume().then(runSynth).catch(runSynth);
  } else {
    runSynth();
  }
}

export function playVoiceAlert(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "es-PA";
    utterance.rate = 1.05;
    utterance.pitch = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const esVoice = voices.find(v => v.lang.startsWith("es-PA") || v.lang.startsWith("es-MX") || v.lang.startsWith("es"));
    if (esVoice) utterance.voice = esVoice;

    window.speechSynthesis.speak(utterance);
  } catch (e) {
    console.warn("No se pudo reproducir voz de alerta:", e);
  }
}

export function vibrateDevice(pattern: number[] = [400, 200, 400, 200, 800]) {
  if (typeof window === "undefined" || !("vibrate" in navigator)) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // Algunos navegadores requieren gesto previo del usuario
  }
}

export function getNotificationPermissionStatus(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  try {
    // Desbloquear AudioContext al hacer clic del usuario
    getAudioContext();
    const permission = await Notification.requestPermission();
    return permission === "granted";
  } catch (err) {
    console.warn("Error al solicitar permisos de notificación:", err);
    return false;
  }
}

export async function sendSystemNotification({
  title,
  body,
  tag = "sismo-panama-alert",
  url = "/",
}: {
  title: string;
  body: string;
  tag?: string;
  url?: string;
}) {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission !== "granted") return false;

  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && reg.showNotification) {
        await reg.showNotification(title, {
          body,
          icon: "/favicon.svg",
          badge: "/favicon.svg",
          tag,
          renotify: true,
          data: { url },
        } as unknown as NotificationOptions);
        return true;
      }
    }

    const notif = new Notification(title, {
      body,
      icon: "/favicon.svg",
      tag,
    });
    notif.onclick = () => {
      window.focus();
      notif.close();
    };
    return true;
  } catch (err) {
    console.warn("No se pudo enviar la notificación del sistema:", err);
    return false;
  }
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function getExistingPushSubscription(): Promise<PushSubscription | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    return null;
  }
  try {
    const reg = await navigator.serviceWorker.ready;
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

export async function subscribeToWebPush(minMagnitude = 3.0): Promise<{ ok: boolean; error?: string }> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    return { ok: false, error: "Tu navegador no soporta notificaciones Web Push en segundo plano." };
  }

  try {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") {
      return { ok: false, error: "Permiso de notificaciones denegado." };
    }

    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();

    if (!sub) {
      const keyRes = await fetch("/api/push/vapid-public-key");
      const { publicKey } = (await keyRes.json()) as { publicKey?: string };
      if (!publicKey) throw new Error("No se pudo obtener la clave VAPID pública");

      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }

    const subJson = sub.toJSON();
    const saveRes = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: subJson.endpoint,
        keys: subJson.keys,
        minMagnitude,
      }),
    });

    const data = (await saveRes.json()) as { error?: string };
    if (!saveRes.ok) {
      return { ok: false, error: data.error || "No se pudo registrar la suscripción en el servidor." };
    }

    return { ok: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

export async function sendTestWebPush(): Promise<{ ok: boolean; error?: string }> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return { ok: false, error: "Web Push no disponible en este entorno" };
  }
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) {
      return { ok: false, error: "No tienes una suscripción Push activa aún. Activa las alertas primero." };
    }
    const subJson = sub.toJSON();
    const res = await fetch("/api/push/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: subJson.endpoint,
        keys: subJson.keys,
      }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      return { ok: false, error: data.error || "Error al enviar la prueba" };
    }
    return { ok: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

export function loadAlertPreferences(): AlertPreferences {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES;
  try {
    const raw = localStorage.getItem(STORAGE_PREFS_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_PREFERENCES, ...parsed };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function saveAlertPreferences(prefs: AlertPreferences) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // LocalStorage deshabilitado o lleno
  }
}

// Sismos que este dispositivo ya conoce. Se guardan con hora y posición, y no solo con su id: los catálogos
// revisan el sismo (el id del IGC lleva el segundo exacto, que cambia al revisarlo) y un id nuevo del mismo
// sismo no debe volver a sonar como si fuera otro. Se comparten entre pestañas por localStorage.
export type SeenQuake = { ids: string[]; time: number; lat: number; lng: number };

function matchesSeen(event: Earthquake, record: SeenQuake) {
  if ([event.id, ...(event.properties.aliases ?? [])].some(id => record.ids.includes(id))) return true;
  const [lng, lat] = event.geometry.coordinates;
  // Mismo criterio que sameEvent: menos de un minuto de diferencia y a menos de 120 km.
  return Math.abs(event.properties.time - record.time) <= 60_000 && kmBetween(lat, lng, record.lat, record.lng) <= 120;
}

export function isSeenQuake(event: Earthquake, seen: SeenQuake[]) {
  return seen.some(record => matchesSeen(event, record));
}

export function rememberQuakes(seen: SeenQuake[], events: Earthquake[]): SeenQuake[] {
  const next = seen.map(record => ({ ...record, ids: [...record.ids] }));
  for (const event of events) {
    const ids = [event.id, ...(event.properties.aliases ?? [])];
    const [lng, lat] = event.geometry.coordinates;
    const hit = next.find(record => matchesSeen(event, record));
    if (hit) {
      // Se actualiza con la última revisión para que una cadena de revisiones siga coincidiendo.
      hit.ids = Array.from(new Set([...hit.ids, ...ids]));
      hit.time = event.properties.time;
      hit.lat = lat;
      hit.lng = lng;
    } else {
      next.push({ ids, time: event.properties.time, lat, lng });
    }
  }
  return next.sort((a, b) => a.time - b.time).slice(-SEEN_LIMIT);
}

export function loadSeenQuakes(): SeenQuake[] {
  if (typeof window === "undefined") return [];
  try {
    const list = JSON.parse(localStorage.getItem(STORAGE_SEEN_KEY) ?? "[]");
    if (!Array.isArray(list)) return [];
    return list.filter(
      (item): item is SeenQuake =>
        !!item && Array.isArray(item.ids) && Number.isFinite(item.time) && Number.isFinite(item.lat) && Number.isFinite(item.lng),
    );
  } catch {
    return [];
  }
}

export function saveSeenQuakes(seen: SeenQuake[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_SEEN_KEY, JSON.stringify(seen));
  } catch {
    // Ignorar si falla
  }
}

const COMPASS: Record<string, string> = {
  N: "norte", S: "sur", E: "este", W: "oeste",
  NE: "noreste", NW: "noroeste", SE: "sureste", SW: "suroeste",
  NNE: "norte-noreste", ENE: "este-noreste", ESE: "este-sureste", SSE: "sur-sureste",
  SSW: "sur-suroeste", WSW: "oeste-suroeste", WNW: "oeste-noroeste", NNW: "norte-noroeste",
};

// El USGS nombra el lugar en inglés ("12 km WSW of Pitaloza Arriba, Panama") y la voz en español lo
// destrozaría. Se traduce a una frase que se entienda al oído; los demás catálogos traen un texto distinto.
export function spokenPlace(place: string | null | undefined) {
  const text = (place ?? "").trim();
  const usgs = /^(\d+)\s*km\s+([NSEW]{1,3})\s+of\s+(.+?)(?:,\s*Panam[aá])?$/i.exec(text);
  const direction = usgs ? COMPASS[usgs[2].toUpperCase()] : undefined;
  if (usgs && direction) return `a ${usgs[1]} kilómetros al ${direction} de ${usgs[3]}`;
  // EMSC solo da coordenadas ("Panamá (8.12°N, 80.12°O)"): leerlas no ayuda a nadie.
  if (!text || /\d\s*°/.test(text)) return "en Panamá";
  return `en ${text.replace(/,\s*Panam[aá]$/i, "")}`;
}

export function formatDateTimePanama(timestamp: number) {
  return new Intl.DateTimeFormat("es-PA", {
    timeZone: "America/Panama",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    day: "numeric",
    month: "short",
  }).format(new Date(timestamp));
}

export function getWhatsAppShareText(event: Earthquake, currentUrl: string): string {
  const mag = event.properties.mag === null ? "Desconocida" : event.properties.mag.toFixed(1);
  const place = event.properties.place || "Panamá";
  const depth = Number.isFinite(event.geometry.coordinates[2])
    ? `${Math.round(event.geometry.coordinates[2]!)} km`
    : "No disponible";
  const time = formatDateTimePanama(event.properties.time);
  const cleanUrl = currentUrl.split("#")[0];

  return [
    `🚨 *¡ALERTA SÍSMICA EN PANAMÁ!* 🚨`,
    ``,
    `🔴 *Magnitud:* M ${mag}`,
    `📍 *Lugar:* ${place}`,
    `🕒 *Hora:* ${time} (hora de Panamá)`,
    `📏 *Profundidad:* ${depth}`,
    event.properties.tsunami === 1 ? `⚠️ *Alerta:* Posible riesgo de tsunami (tsunami.gov)` : ``,
    ``,
    `⚠️ *Recomendaciones:*`,
    `• Mantén la calma y aléjate de ventanas o estantes.`,
    `• Agáchate, cúbrete y sujétate si continúa el temblor.`,
    `• Atiende únicamente avisos oficiales de SINAPROC.`,
    ``,
    `📡 *Consulta el mapa en vivo y réplicas:*`,
    cleanUrl,
  ].filter(Boolean).join("\n");
}

export function getWhatsAppShareUrl(event: Earthquake, currentUrl: string): string {
  const text = getWhatsAppShareText(event, currentUrl);
  return `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
}

export function getTelegramShareUrl(event: Earthquake, currentUrl: string): string {
  const text = getWhatsAppShareText(event, currentUrl);
  return `https://t.me/share/url?url=${encodeURIComponent(currentUrl.split("#")[0])}&text=${encodeURIComponent(text)}`;
}

export async function broadcastEarthquakeAlert(
  event: Earthquake,
  count: number,
  prefs: AlertPreferences,
  isTest = false,
) {
  const mag = event.properties.mag === null ? "—" : event.properties.mag.toFixed(1);
  const place = event.properties.place || "Panamá";
  const depth = Number.isFinite(event.geometry.coordinates[2])
    ? `${Math.round(event.geometry.coordinates[2]!)} km`
    : "No disponible";
  const timeStr = formatDateTimePanama(event.properties.time);

  // Se corta cualquier sirena o sonido que quedara de una alerta anterior antes de empezar esta.
  stopAlarmSound();

  // 1. Vibración táctil en teléfonos móviles
  vibrateDevice([400, 200, 400, 200, 800]);

  // 2. Sirena de alarma de emergencia
  if (prefs.soundEnabled) {
    playEmergencyAlarmSound();
  }

  // 3. Notificación emergente del sistema en el navegador/celular
  if (prefs.notificationsEnabled && getNotificationPermissionStatus() === "granted") {
    const title = isTest
      ? `🧪 [PRUEBA] Alerta sísmica activa en Panamá`
      : `🚨 ¡ALERTA SÍSMICA EN PANAMÁ! · M ${mag}`;
    const body = isTest
      ? `El sistema de alertas de sismos funciona correctamente con sonido y notificaciones.`
      : `${place} · Profundidad: ${depth} · ${timeStr}. Mantén la calma y consulta el mapa.`;

    await sendSystemNotification({
      title,
      body,
      tag: `sismo-${event.id}`,
      url: typeof window !== "undefined" ? window.location.href : "/",
    });
  }
}
