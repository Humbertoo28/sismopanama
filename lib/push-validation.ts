// Validación de lo que llega a /api/push/*. Son rutas públicas (cualquiera puede llamarlas) y el servidor
// termina haciendo una petición HTTPS POST a la dirección que recibe (web-push), tanto en la prueba como en cada
// aviso de sismo a todas las suscripciones guardadas. Sin esta validación, cualquiera podía registrar como "buzón
// push" una dirección arbitraria (un servidor propio, un puerto interno...) y hacer que el servidor la llamara.

// Los únicos servicios de push que existen para los navegadores: Chrome/Edge/Brave/Samsung/Opera (FCM), Firefox
// (Mozilla autopush), Safari/iPhone (Apple) y Windows (WNS). Son los mismos que reconoce el registro de envíos.
const PUSH_HOSTS = new Set(["fcm.googleapis.com"]);
const PUSH_HOST_SUFFIXES = [".push.services.mozilla.com", ".push.apple.com", ".notify.windows.com"];

// El host se extrae con esta expresión y no con `new URL`: web-push interpreta la dirección con `url.parse`, que
// no coincide con el estándar WHATWG en casos raros (barras invertidas, `@`, espacios). Aquí no se admite nada
// de eso, así que ambos intérpretes ven el mismo host. Tampoco se admite puerto: los navegadores nunca lo ponen.
const ENDPOINT = /^https:\/\/([a-z0-9.-]+)\/[^\s\\@]*$/i;
const MAX_ENDPOINT_LENGTH = 2048;

export function isPushEndpoint(value: unknown): value is string {
  if (typeof value !== "string" || value.length > MAX_ENDPOINT_LENGTH) return false;
  const host = ENDPOINT.exec(value)?.[1]?.toLowerCase();
  return Boolean(host && (PUSH_HOSTS.has(host) || PUSH_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))));
}

const BASE64URL = /^[A-Za-z0-9_-]+={0,2}$/;

function decodedLength(value: unknown): number {
  if (typeof value !== "string" || value.length > 200 || !BASE64URL.test(value)) return -1;
  return Buffer.from(value, "base64url").length;
}

// Claves de la suscripción: el punto público P-256 sin comprimir mide 65 bytes y el secreto de autenticación 16.
export const isPushPublicKey = (value: unknown): value is string => decodedLength(value) === 65;
export const isPushAuthSecret = (value: unknown): value is string => decodedLength(value) === 16;

// Solo para el registro de rechazos: bytes que mide una clave (-1 si no es base64url válida). Nunca el valor.
export const keyBytes = decodedLength;

// Solo el dominio de una dirección (sin ruta, que lleva el identificador del dispositivo, ni credenciales).
export function endpointHost(value: unknown): string {
  if (typeof value !== "string") return `(${typeof value})`;
  const match = /^(https?):\/\/([^/?#\s]*)/i.exec(value);
  return match ? `${match[1].toLowerCase()}://${match[2].split("@").pop()}`.slice(0, 80) : "(no es una dirección web)";
}

export function isPushKeys(value: unknown): value is { p256dh: string; auth: string } {
  const keys = value as { p256dh?: unknown; auth?: unknown } | null | undefined;
  return isPushPublicKey(keys?.p256dh) && isPushAuthSecret(keys?.auth);
}

// Umbral de magnitud pedido por el dispositivo. Lo no numérico vale 0 (la ruta lo reemplaza por el valor por defecto).
export function parseMinMagnitude(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(Math.max(n, 0), 10) : 0;
}

// Cuerpo JSON con tope de tamaño: una suscripción real pesa menos de 1 KB. Devuelve null si no es un objeto válido.
export async function readJsonObject(req: Request, maxBytes = 4096): Promise<Record<string, unknown> | null> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > maxBytes) return null;
  const text = await req.text();
  if (text.length > maxBytes) return null;
  try {
    const body: unknown = JSON.parse(text);
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
