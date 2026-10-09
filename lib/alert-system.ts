import type { Earthquake } from "./earthquakes";

export type AlertPreferences = {
  notificationsEnabled: boolean;
  soundEnabled: boolean;
  voiceEnabled: boolean;
  minMagnitude: number;
};

const DEFAULT_PREFERENCES: AlertPreferences = {
  notificationsEnabled: true,
  soundEnabled: true,
  voiceEnabled: true,
  minMagnitude: 0,
};

const STORAGE_PREFS_KEY = "sismo_panama_alert_prefs_v1";
const STORAGE_SEEN_KEY = "sismo_panama_seen_ids_v1";

let globalAudioCtx: AudioContext | null = null;
let currentAlarmNodes: { osc1: OscillatorNode; osc2?: OscillatorNode; gain: GainNode } | null = null;
let currentAudioElement: HTMLAudioElement | null = null;

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
  if (currentAudioElement) {
    try {
      currentAudioElement.pause();
      currentAudioElement.currentTime = 0;
    } catch {
      // Ignorar si falla
    }
    currentAudioElement = null;
  }
  if (currentAlarmNodes) {
    try {
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

export function playEmergencyAlarmSound() {
  stopAlarmSound();

  // 1. Reproducir primero mediante elemento Audio (/siren.wav) para máxima compatibilidad móvil y escritorio
  if (typeof window !== "undefined") {
    try {
      const audio = new Audio("/siren.wav");
      audio.volume = 1.0;
      currentAudioElement = audio;
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn("Audio play falló, usando Web Audio:", err);
          playSynthesizedSiren();
        });
      }
    } catch (e) {
      console.warn("Error iniciando Audio('/siren.wav'):", e);
      playSynthesizedSiren();
    }
  } else {
    playSynthesizedSiren();
  }
}

function playSynthesizedSiren() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const runSynth = () => {
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

      osc1.start(now);
      osc1.stop(now + duration);

      currentAlarmNodes = { osc1, gain: masterGain };
    } catch (err) {
      console.warn("Error en sintetizador de sirena:", err);
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

export function getSeenEarthquakeIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_SEEN_KEY);
    if (!raw) return new Set();
    const list = JSON.parse(raw);
    return new Set(Array.isArray(list) ? list : []);
  } catch {
    return new Set();
  }
}

export function saveSeenEarthquakeIds(ids: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    // Guardar solo los últimos 200 IDs para no saturar localStorage
    const list = Array.from(ids).slice(-200);
    localStorage.setItem(STORAGE_SEEN_KEY, JSON.stringify(list));
  } catch {
    // Ignorar si falla
  }
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

  // 1. Vibración táctil en teléfonos móviles
  vibrateDevice([400, 200, 400, 200, 800]);

  // 2. Alarma sonora sísmica
  if (prefs.soundEnabled) {
    playEmergencyAlarmSound();
  }

  // 3. Notificación de voz hablada
  if (prefs.voiceEnabled) {
    const voiceMsg = isTest
      ? `Prueba de alerta sísmica en Panamá. El sistema de notificación y audio está funcionando correctamente.`
      : `¡Atención! Alerta sísmica. Nuevo sismo reportado en Panamá de magnitud ${mag} en ${place}. Mantén la calma y mantente a salvo.`;
    window.setTimeout(() => {
      playVoiceAlert(voiceMsg);
    }, 1200);
  }

  // 4. Notificación emergente del sistema en el navegador/celular
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
