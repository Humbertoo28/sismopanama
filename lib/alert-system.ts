import { kmBetween, type Earthquake } from "./earthquakes";

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
const STORAGE_SEEN_KEY = "sismo_panama_seen_v2";

// Un sismo que ocurrió hace más de esto ya no justifica sirena ni voz: se avisa en pantalla y en silencio.
// Así, al reabrir la app o despertar el equipo no suena una alarma por algo que pasó hace rato.
export const ALARM_MAX_AGE_MS = 15 * 60_000;
// Duración de la sirena antes de que la voz hable de inmediato (1.3s para reacción rápida en iPhone)
const SIREN_ALERT_MS = 1300;
const SEEN_LIMIT = 400;

let globalAudioCtx: AudioContext | null = null;
let currentAlarmNodes: { osc1: OscillatorNode; osc2?: OscillatorNode; gain: GainNode } | null = null;
let currentAudioElement: HTMLAudioElement | null = null;
let activeUtterance: SpeechSynthesisUtterance | null = null;
let cachedVoices: SpeechSynthesisVoice[] = [];
let preloadedSiren: HTMLAudioElement | null = null;
// Cada alerta nueva (o cada "silenciar") cambia la tanda: lo que quedó pendiente de la anterior se descarta.
let alarmRun = 0;
let alarmTimer: number | null = null;

// Pre-cargar audio de la sirena en memoria para reproducción sin retardo de red
export function getPreloadedSiren(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (!preloadedSiren) {
    try {
      preloadedSiren = new Audio("/siren.wav");
      preloadedSiren.preload = "auto";
      preloadedSiren.load();
    } catch {}
  }
  return preloadedSiren;
}

// Cargar voces disponibles en el dispositivo tan pronto estén listas
function loadVoices() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return [];
  try {
    const list = window.speechSynthesis.getVoices();
    if (list && list.length > 0) {
      cachedVoices = list;
    }
  } catch {}
  return cachedVoices;
}

if (typeof window !== "undefined") {
  getPreloadedSiren();
  if ("speechSynthesis" in window) {
    loadVoices();
    if ("onvoiceschanged" in window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = () => {
        loadVoices();
      };
    }
  }
}

// Desbloquear audio y síntesis de voz en iOS Safari y Android en la primera interacción
export function unlockAudioAndSpeech() {
  if (typeof window === "undefined") return;
  try {
    const ctx = getAudioContext();
    if (ctx) {
      if (ctx.state === "suspended") {
        ctx.resume().catch(() => {});
      }
      try {
        const buffer = ctx.createBuffer(1, 1, 22050);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start(0);
      } catch {}
    }
    const siren = getPreloadedSiren();
    if (siren) {
      // En iOS Safari, reproducir y pausar inmediatamente en gesto de usuario
      // autoriza el elemento Audio para reproducciones posteriores sin latencia de red ni bloqueo
      siren.volume = 0;
      const playPromise = siren.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            siren.pause();
            siren.currentTime = 0;
            siren.volume = 1.0;
          })
          .catch(() => {
            siren.volume = 1.0;
          });
      }
    }
    if ("speechSynthesis" in window) {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
      loadVoices();
      // Emite un utterance silencioso (" ") para despertar el motor TTS en WebKit/iOS
      const dummy = new SpeechSynthesisUtterance(" ");
      dummy.volume = 0.01;
      dummy.rate = 2.0;
      const quietVoice = pickSpanishVoice(cachedVoices);
      if (quietVoice) {
        dummy.voice = quietVoice;
        dummy.lang = quietVoice.lang;
      }
      window.speechSynthesis.speak(dummy);
    }
  } catch {}
}

if (typeof window !== "undefined") {
  const onFirstInteraction = () => {
    unlockAudioAndSpeech();
    window.removeEventListener("touchstart", onFirstInteraction);
    window.removeEventListener("touchend", onFirstInteraction);
    window.removeEventListener("click", onFirstInteraction);
  };
  window.addEventListener("touchstart", onFirstInteraction, { passive: true });
  window.addEventListener("touchend", onFirstInteraction, { passive: true });
  window.addEventListener("click", onFirstInteraction, { passive: true });
}

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
  if (activeUtterance) {
    activeUtterance.onend = null;
    activeUtterance.onerror = null;
    activeUtterance = null;
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
    // Pausar la sirena al cumplirse el pulso de alarma para que la locución por voz se escuche limpia e inmediata
    if (currentAudioElement) {
      try {
        currentAudioElement.pause();
        currentAudioElement.currentTime = 0;
      } catch {}
    }
    onEnd?.();
  };
  alarmTimer = window.setTimeout(finish, SIREN_ALERT_MS);

  // 1. Primero mediante elemento Audio pre-cargado para 0 latencia en iPhone y Android
  let fellBack = false;
  const fallBack = () => {
    if (fellBack || run !== alarmRun) return;
    fellBack = true;
    playSynthesizedSiren(finish);
  };
  try {
    const audio = getPreloadedSiren() || new Audio("/siren.wav");
    audio.volume = 1.0;
    audio.currentTime = 0;
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
    try {
      const now = ctx.currentTime;
      const duration = 1.3;

      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0.4, now);
      masterGain.gain.linearRampToValueAtTime(0.001, now + duration);
      masterGain.connect(ctx.destination);

      const osc1 = ctx.createOscillator();
      osc1.type = "sawtooth";

      const cycles = Math.floor(duration / 0.3);
      for (let i = 0; i < cycles; i++) {
        const t = now + i * 0.3;
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

// Voces en español: siempre una voz femenina. Los navegadores no dicen el género de una voz, así que se reconoce
// por el nombre. Antes se tomaba la primera voz en español de la lista, que cambia según la pestaña, el
// navegador y si ya cargaron las voces de Google: una pestaña hablaba con una voz de mujer y otra con una de hombre.
const MALE_VOICE =
  /(?<![\p{L}])(pablo|raul|raúl|jorge|juan|diego|carlos|enrique|miguel|pedro|andres|andrés|alvaro|álvaro|antonio|tomas|tomás|jaime|ricardo|fernando|luis|manuel|alberto|alejandro|arturo|gonzalo|ramon|ramón|sergio|jose|josé|ignacio|oscar|óscar|mateo|santiago|lorenzo|emilio|lazaro|lázaro|marcelo|mario|orlando|sebastian|sebastián|rodrigo|roberto|alex|male|masculin\w*|hombre)(?![\p{L}])/iu;
const FEMALE_VOICE =
  /(?<![\p{L}])(sabina|helena|laura|paulina|monica|mónica|dalia|elvira|lucia|lucía|marisol|paloma|paula|paola|esperanza|elena|camila|catalina|sofia|sofía|valentina|salome|salomé|soledad|angelica|angélica|francisca|isabela|mariana|carmela|ximena|marina|nuria|belkys|karla|lupe|margarita|ramona|reina|tania|yolanda|estrella|irene|liliana|larissa|female|femenin\w*|mujer)(?![\p{L}])|google espa/iu;

export function pickSpanishVoice<T extends { name: string; lang: string }>(voices: T[]): T | null {
  const regionRank = (lang: string) => {
    const l = lang.toLowerCase().replace("_", "-");
    if (l === "es-pa") return 0;
    if (l === "es-419") return 1;
    if (l.startsWith("es-mx")) return 2;
    if (l.startsWith("es-us")) return 3;
    if (l.startsWith("es-es")) return 5;
    return l.startsWith("es") ? 4 : 6;
  };
  const spanish = voices.filter(v => v.lang.toLowerCase().replace("_", "-").startsWith("es") || /spanish|español/i.test(v.name));
  if (spanish.length === 0) return null;
  // Femenina conocida primero, luego sin género reconocible (p. ej. las voces de Android), y la masculina solo si
  // no hay otra: una alerta debe hablarse aunque el equipo tenga únicamente una voz masculina.
  const score = (v: T) => (MALE_VOICE.test(v.name) ? 100 : FEMALE_VOICE.test(v.name) ? 0 : 10) + regionRank(v.lang);
  return spanish.reduce((best, v) => (score(v) < score(best) ? v : best));
}

// Si hay varias pestañas o ventanas abiertas (la página y la app instalada), solo una suena por cada alerta.
const STORAGE_AUDIO_CLAIM_KEY = "sismo_panama_audio_claim_v1";
const TAB_ID = Math.random().toString(36).slice(2);
function claimAlertAudio(eventId: string): boolean {
  try {
    const now = Date.now();
    const raw = localStorage.getItem(STORAGE_AUDIO_CLAIM_KEY);
    if (raw) {
      const claim = JSON.parse(raw) as { id?: string; tab?: string; at?: number };
      if (claim.id === eventId && claim.tab !== TAB_ID && now - (claim.at ?? 0) < 60_000) return false;
    }
    localStorage.setItem(STORAGE_AUDIO_CLAIM_KEY, JSON.stringify({ id: eventId, tab: TAB_ID, at: now }));
  } catch {
    // Sin localStorage no se puede coordinar: suena esta pestaña.
  }
  return true;
}

export function playVoiceAlert(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    const synth = window.speechSynthesis;
    if (synth.paused) {
      synth.resume();
    }
    synth.cancel();

    const speak = (attempt: number) => {
      try {
        if (synth.paused) {
          synth.resume();
        }
        // Las voces se piden en el momento de hablar: la lista guardada puede estar incompleta.
        const fresh = synth.getVoices();
        const voices = fresh.length > 0 ? fresh : cachedVoices.length > 0 ? cachedVoices : loadVoices();
        // Sin voces cargadas, hablar usaría la voz por defecto del sistema, que puede ser masculina: se espera un
        // instante a que el navegador termine de cargar las suyas.
        if (voices.length === 0 && attempt < 6) {
          window.setTimeout(() => speak(attempt + 1), 250);
          return;
        }

        const utterance = new SpeechSynthesisUtterance(text);
        activeUtterance = utterance;
        const esVoice = pickSpanishVoice(voices);
        if (esVoice) {
          utterance.voice = esVoice;
          utterance.lang = esVoice.lang;
        } else {
          utterance.lang = "es-ES";
        }

        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        utterance.onend = () => {
          activeUtterance = null;
        };
        utterance.onerror = (err) => {
          activeUtterance = null;
          console.warn("SpeechSynthesis error:", err);
        };

        synth.speak(utterance);
      } catch (err) {
        console.warn("Error en synth.speak:", err);
      }
    };
    // Pequeño retardo (60ms) necesario para WebKit / iOS Safari tras llamar a cancel()
    window.setTimeout(() => speak(0), 60);
  } catch (e) {
    console.warn("No se pudo iniciar voz de alerta:", e);
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
        // Safari no implementa "renotify": una notificación con la misma etiqueta reemplaza a la anterior sin sonido.
        // Se cierra la anterior para que esta suene (por ejemplo, el aviso push del mismo sismo).
        try {
          (await reg.getNotifications({ tag })).forEach(previous => previous.close());
        } catch {
          // Sin soporte: se muestra igual.
        }
        await reg.showNotification(title, {
          body,
          icon: "/icon-192.png",
          badge: "/favicon.svg",
          tag,
          renotify: true,
          // Explícitamente con sonido y vibración: el aviso no debe llegar en silencio por omisión.
          silent: false,
          vibrate: [400, 150, 400, 150, 400],
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

const STORAGE_PUSH_KEY = "sismo_panama_push_v1";

function rememberPushEnabled(enabled: boolean) {
  try {
    if (enabled) localStorage.setItem(STORAGE_PUSH_KEY, "1");
    else localStorage.removeItem(STORAGE_PUSH_KEY);
  } catch {
    // Ignorar si localStorage está bloqueado
  }
}

function pushWasEnabled() {
  try {
    return localStorage.getItem(STORAGE_PUSH_KEY) === "1";
  } catch {
    return false;
  }
}

async function createPushSubscription(reg: ServiceWorkerRegistration) {
  const keyRes = await fetch("/api/push/vapid-public-key");
  const { publicKey } = (await keyRes.json()) as { publicKey?: string };
  if (!publicKey) throw new Error("No se pudo obtener la clave VAPID pública");
  const keyBuffer = urlBase64ToUint8Array(publicKey);

  try {
    return await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBuffer,
    });
  } catch (initialErr) {
    // Si el registro falló por una suscripción previa corrupta o desfasada, desuscribir y reintentar una vez
    try {
      const existing = await reg.pushManager.getSubscription();
      if (existing) {
        await existing.unsubscribe();
        return await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: keyBuffer,
        });
      }
    } catch {
      // Si el reintento falla, propagar el error inicial
    }
    throw initialErr;
  }
}

const LAST_SYNC_KEY = "sismo_panama_push_last_sync";
const SYNC_INTERVAL_MS = 24 * 3_600_000; // 24 horas

// Mantiene al día el "buzón" push de este equipo: solo sincroniza con el servidor si han pasado 24 h
// o si force=true (cambio de magnitud o re-suscripción manual), eliminando cientos de miles de funciones serverless.
export async function syncPushSubscription(minMagnitude: number, force = false): Promise<void> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) return;
  if (Notification.permission !== "granted") return;

  if (!force) {
    try {
      const last = localStorage.getItem(LAST_SYNC_KEY);
      if (last && Date.now() - Number(last) < SYNC_INTERVAL_MS) return;
    } catch {
      // Ignorar si localStorage está deshabilitado
    }
  }

  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub && pushWasEnabled()) sub = await createPushSubscription(reg);
    if (!sub) return;
    const json = sub.toJSON();
    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys, minMagnitude }),
    });
    if (res.ok) {
      try {
        localStorage.setItem(LAST_SYNC_KEY, String(Date.now()));
      } catch {}
    }
  } catch (err) {
    console.warn("No se pudo sincronizar la suscripción push:", err);
  }
}

export async function subscribeToWebPush(minMagnitude = 3.0): Promise<{ ok: boolean; error?: string }> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    // En iPhone y iPad el push solo existe para la app instalada en la pantalla de inicio, no en una pestaña de Safari.
    const iosTab =
      /iphone|ipad|ipod/i.test(navigator.userAgent) &&
      !(navigator as unknown as { standalone?: boolean }).standalone &&
      !window.matchMedia("(display-mode: standalone)").matches;
    return {
      ok: false,
      error: iosTab
        ? "En iPhone primero instala la app: toca Compartir → Agregar a pantalla de inicio, ábrela desde el ícono y pulsa Activar 24/7 otra vez."
        : "Tu navegador no soporta notificaciones Web Push en segundo plano.",
    };
  }

  try {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") {
      return { ok: false, error: "Permiso de notificaciones denegado en tu navegador." };
    }

    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) ?? (await createPushSubscription(reg));

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

    rememberPushEnabled(true);
    return { ok: true };
  } catch (err: unknown) {
    const raw = err instanceof Error ? err.message : String(err);
    let friendly = raw;

    if (/push service error/i.test(raw)) {
      friendly =
        "El servicio de alertas de tu celular (Google Play/FCM) no respondió. Si usas Brave activa los servicios de Google en Configuración, desactiva el ahorro de batería o modo incógnito, o pulsa Activar 24/7 de nuevo.";
    } else if (/permission denied|denied/i.test(raw)) {
      friendly = "Permiso de notificaciones bloqueado en los ajustes de tu navegador.";
    }

    return { ok: false, error: friendly };
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

// Lo que manda el servidor en un push, convertido en un sismo para que la página lo trate igual que uno propio.
export type PushedQuake = { id?: string; magnitude?: number; place?: string; time?: number; lat?: number; lng?: number; depth?: number };
export function earthquakeFromPush(quake: PushedQuake): Earthquake | null {
  if (!quake.id || !Number.isFinite(quake.time)) return null;
  return {
    id: quake.id,
    properties: { mag: Number.isFinite(quake.magnitude) ? quake.magnitude! : null, place: quake.place ?? null, time: quake.time!, url: null },
    geometry: { coordinates: [Number.isFinite(quake.lng) ? quake.lng! : -80.4, Number.isFinite(quake.lat) ? quake.lat! : 8.46, quake.depth] },
  };
}

export async function broadcastEarthquakeAlert(
  event: Earthquake,
  count: number,
  prefs: AlertPreferences,
  isTest = false,
  // El push ya mostró su notificación: no se muestra otra encima (volvería a sonar).
  skipNotification = false,
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

  // 2. Sirena de alarma y locución por voz en español
  const voiceMsg = isTest
    ? `Prueba de alerta sísmica en Panamá. Sirena, voz y notificaciones activas.`
    : `Alerta sísmica en Panamá. Sismo de magnitud ${event.properties.mag === null ? "desconocida" : event.properties.mag.toFixed(1).replace(".", " coma ")}, ${spokenPlace(event.properties.place)}. Mantén la calma.`;

  const speak = () => {
    if (prefs.voiceEnabled) {
      playVoiceAlert(voiceMsg);
    }
  };

  // Con otra pestaña o ventana ya sonando por este mismo sismo, esta no repite sirena ni voz.
  const audible = isTest || claimAlertAudio(event.id);
  if (!audible) {
    // nada que reproducir aquí
  } else if (prefs.soundEnabled) {
    playEmergencyAlarmSound(speak);
  } else {
    speak();
  }

  // 3. Notificación emergente del sistema en el navegador/celular
  if (!skipNotification && prefs.notificationsEnabled && getNotificationPermissionStatus() === "granted") {
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
