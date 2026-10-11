// Titulares de dos medios panameños (Telemetro y TVN) sobre el sismo, desde el 9 de octubre. Se leen de lo que cada medio
// publica para ser leído por programas: el RSS de portada de TVN y el mapa de noticias (Google News sitemap) de Telemetro.
// Solo se toma el título, la fecha y el enlace a la nota; no se copia ni se resume el texto de nadie, y no es información oficial.
//
// Lo que llega de fuera se trata como texto sin confianza: se le quitan las etiquetas, el enlace solo se acepta si apunta al
// dominio de ese mismo medio por HTTPS, y la pantalla lo muestra siempre como texto.

import { SINCE } from "./earthquakes";
import { SEISMIC_TITLE, cleanText, officialUrl, withRetry } from "./news";

export type MediaId = "telemetro" | "tvn";

export interface MediaSource {
  id: MediaId;
  name: string;
  /** Página principal del medio. */
  url: string;
  feed: string;
  /** Únicos dominios a los que puede apuntar un enlace de este medio. */
  hosts: ReadonlySet<string>;
}

export const MEDIA: Record<MediaId, MediaSource> = {
  telemetro: {
    id: "telemetro",
    name: "Telemetro",
    url: "https://www.telemetro.com/",
    feed: "https://www.telemetro.com/sitemap-news.xml",
    hosts: new Set(["www.telemetro.com", "telemetro.com"]),
  },
  tvn: {
    id: "tvn",
    name: "TVN",
    url: "https://www.tvn-2.com/",
    feed: "https://www.tvn-2.com/rss/",
    hosts: new Set(["www.tvn-2.com", "tvn-2.com"]),
  },
};

export interface MediaItem {
  source: MediaId;
  title: string;
  url: string;
  /** Instante de publicación (ISO, UTC). */
  publishedAt: string;
}

export interface MediaNews {
  /** Qué medios respondieron esta vez. */
  available: Record<MediaId, boolean>;
  /** Los titulares más recientes que hablan de un sismo, temblor, terremoto, réplica o tsunami. */
  items: MediaItem[];
  /** Cuántos titulares así hay desde el 9 de octubre en total (puede ser más que los mostrados) y de cada medio. */
  total: number;
  perSource: Record<MediaId, number>;
  fetchedAt: string;
}

const SHOWN = 30;
const MAX_BYTES = 2_000_000;
const TIMEOUT_MS = 10_000;
const MAX_TITLE = 220;

// Contenido de una etiqueta XML, con o sin CDATA.
function tag(block: string, name: string): string | null {
  const found = new RegExp(`<${name}>\\s*(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([^<]*))\\s*</${name}>`, "i").exec(block);
  return found ? (found[1] ?? found[2] ?? "") : null;
}

function toItem(source: MediaSource, rawTitle: string | null, rawLink: string | null, rawDate: string | null, now: number): MediaItem | null {
  const url = officialUrl(rawLink?.trim(), source.hosts);
  const published = rawDate ? Date.parse(rawDate.trim()) : NaN;
  if (!url || !Number.isFinite(published) || published > now + 86_400_000) return null;
  let title = cleanText(rawTitle ?? "");
  if (title.length > MAX_TITLE) title = `${title.slice(0, MAX_TITLE).replace(/\s+\S*$/, "")}…`;
  return title ? { source: source.id, title, url, publishedAt: new Date(published).toISOString() } : null;
}

/** RSS de TVN: <item> con <title>, <link> y <pubDate>. */
export function parseTvn(xml: string, now = Date.now()): MediaItem[] {
  const items: MediaItem[] = [];
  for (const [, block] of xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
    const item = toItem(MEDIA.tvn, tag(block, "title"), tag(block, "link"), tag(block, "pubDate"), now);
    if (item) items.push(item);
  }
  return items;
}

/** Mapa de noticias de Telemetro: <url> con <loc>, <news:title> y <news:publication_date>. */
export function parseTelemetro(xml: string, now = Date.now()): MediaItem[] {
  const items: MediaItem[] = [];
  for (const [, block] of xml.matchAll(/<url>([\s\S]*?)<\/url>/gi)) {
    const item = toItem(MEDIA.telemetro, tag(block, "news:title"), tag(block, "loc"), tag(block, "news:publication_date"), now);
    if (item) items.push(item);
  }
  return items;
}

async function getFeed(source: MediaSource): Promise<string> {
  const response = await fetch(source.feed, {
    headers: { Accept: "application/xml, text/xml", "User-Agent": "SismoPanama/1.0 (+https://sismopanama.vercel.app)" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    next: { revalidate: 300 },
  });
  if (!response.ok) throw new Error(`${source.name} respondió ${response.status}`);
  const text = await response.text();
  if (text.length > MAX_BYTES) throw new Error(`La respuesta de ${source.name} es más grande de lo esperado`);
  return text;
}

async function load(source: MediaSource, parse: (xml: string) => MediaItem[]): Promise<MediaItem[]> {
  const items = parse(await getFeed(source));
  // Si el medio devuelve contenido y ninguna entrada sirve, es que cambió el formato: se avisa en vez de mostrar una lista vacía.
  if (items.length === 0) throw new Error(`${source.name} no devolvió titulares con el formato esperado`);
  return items;
}

/** Los titulares que hablan del sismo, publicados desde el 9 de octubre, del más reciente al más antiguo. */
export function seismicSince(items: MediaItem[]): MediaItem[] {
  const seen = new Set<string>();
  return items
    .filter(item => Date.parse(item.publishedAt) >= SINCE && SEISMIC_TITLE.test(item.title))
    .filter(item => (seen.has(item.url) ? false : (seen.add(item.url), true)))
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

export async function fetchMediaNews(): Promise<MediaNews> {
  const [telemetro, tvn] = await Promise.allSettled([withRetry(() => load(MEDIA.telemetro, parseTelemetro)), withRetry(() => load(MEDIA.tvn, parseTvn))]);
  if (telemetro.status === "rejected") console.error("[noticias] Telemetro no respondió:", telemetro.reason);
  if (tvn.status === "rejected") console.error("[noticias] TVN no respondió:", tvn.reason);
  const all = seismicSince([...(telemetro.status === "fulfilled" ? telemetro.value : []), ...(tvn.status === "fulfilled" ? tvn.value : [])]);
  return {
    available: { telemetro: telemetro.status === "fulfilled", tvn: tvn.status === "fulfilled" },
    items: all.slice(0, SHOWN),
    total: all.length,
    perSource: {
      telemetro: all.filter(item => item.source === "telemetro").length,
      tvn: all.filter(item => item.source === "tvn").length,
    },
    fetchedAt: new Date().toISOString(),
  };
}
