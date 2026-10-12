/**
 * Detección y bloqueo de bots automatizados, scrapers no autorizados y herramientas de extracción.
 */

const BLOCKED_BOT_AGENTS = [
  /python-requests/i,
  /aiohttp/i,
  /scrapy/i,
  /urllib/i,
  /wget/i,
  /httpclient/i,
  /go-http-client/i,
  /postmanruntime/i,
  /headlesschrome/i,
  /phantomjs/i,
  /selenium/i,
  /playwright/i,
  /puppeteer/i,
  /insomnia/i,
  /libwww-perl/i,
  /apache-httpclient/i,
  /node-fetch/i,
  /axios\//i,
];

// Comprueba si la petición proviene de un bot o scraper automatizado conocido
export function isAutomatedBot(userAgent: string | null): boolean {
  if (!userAgent || userAgent.trim().length === 0) return true; // Rechazar peticiones sin User-Agent
  // Permitir agentes oficiales de buscadores para indexación (Google, Bing)
  if (/googlebot|bingbot|duckduckbot/i.test(userAgent)) return false;
  return BLOCKED_BOT_AGENTS.some((pattern) => pattern.test(userAgent));
}

// Verifica que el origen sea legítimo para mutaciones (evita Cross-Site Scripting / CSRF bot attacks)
export function isAllowedOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const host = request.headers.get("host") || "";

  // Si no hay origin ni referer en una llamada de mutación, sospechoso de script CLI
  if (!origin && !referer) {
    // Permitir en local si no está en producción
    if (process.env.NODE_ENV !== "production") return true;
    return false;
  }

  const checkUrl = origin || referer || "";
  try {
    const url = new URL(checkUrl);
    return (
      url.hostname === "www.ojopanama.com" ||
      url.hostname === "ojopanama.com" ||
      url.hostname.endsWith(".vercel.app") ||
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === host.split(":")[0]
    );
  } catch {
    return false;
  }
}
