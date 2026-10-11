// Noticias oficiales: los comunicados que publican en sus sitios web SINAPROC (Protección Civil) y MEDUCA (Ministerio de
// Educación). Se leen de la API pública de WordPress de cada sitio, la misma que usan sus páginas. No se inventa, resume ni
// reescribe nada: se muestra el título y el extracto que publica cada entidad, con el enlace al texto completo.
//
// Lo que llega de fuera se trata como texto sin confianza: se le quitan las etiquetas, el enlace solo se acepta si apunta al
// dominio oficial de esa misma entidad por HTTPS, y la pantalla lo muestra siempre como texto (nunca como HTML).

import https from "node:https";
import { rootCertificates } from "node:tls";
import { SECTIGO_DV_R36_PEM } from "./news-certs";

export type SourceId = "sinaproc" | "meduca";

export interface NewsSource {
  id: SourceId;
  name: string;
  fullName: string;
  /** Página principal de la entidad. */
  url: string;
  api: string;
  /** Únicos dominios a los que puede apuntar un enlace de esta fuente. */
  hosts: ReadonlySet<string>;
  /** Certificado intermedio que el servidor de la entidad no envía. Se suma a los de confianza solo para sus peticiones. */
  extraCa?: string;
}

export const SOURCES: Record<SourceId, NewsSource> = {
  sinaproc: {
    id: "sinaproc",
    name: "SINAPROC",
    fullName: "Sistema Nacional de Protección Civil",
    url: "https://www.sinaproc.gob.pa/",
    api: "https://www.sinaproc.gob.pa/wp-json/wp/v2/posts",
    hosts: new Set(["www.sinaproc.gob.pa", "sinaproc.gob.pa"]),
  },
  meduca: {
    id: "meduca",
    name: "MEDUCA",
    fullName: "Ministerio de Educación",
    url: "https://www.meduca.gob.pa/",
    api: "https://www.meduca.gob.pa/wp-json/wp/v2/posts",
    hosts: new Set(["www.meduca.gob.pa", "meduca.gob.pa"]),
    extraCa: SECTIGO_DV_R36_PEM,
  },
};

export interface NewsItem {
  /** Único entre fuentes: "<fuente>-<número>". */
  id: string;
  source: SourceId;
  title: string;
  summary: string;
  url: string;
  /** Instante de publicación (ISO, UTC). */
  publishedAt: string;
  /** El título habla de un sismo, réplica o tsunami. */
  sismico: boolean;
  /** El título avisa que se suspenden o se reanudan las clases. */
  clases: boolean;
}

export interface OfficialNews {
  /** Qué fuentes respondieron esta vez. Si una falla, sus secciones lo dicen en vez de quedar vacías sin explicación. */
  available: Record<SourceId, boolean>;
  seismic: NewsItem[];
  classes: NewsItem[];
  /** Últimos comunicados de SINAPROC, sean o no sobre sismos. */
  latest: NewsItem[];
  /** Fecha de la publicación más antigua de MEDUCA que se revisó: hasta dónde llega la búsqueda de avisos de clases. */
  meducaCoversSince: string | null;
  fetchedAt: string;
}

const LATEST_COUNT = 12;
const SEISMIC_COUNT = 8;
const CLASSES_COUNT = 6;
// La búsqueda de SINAPROC mira el texto completo, así que trae también notas que solo mencionan "sismo" de pasada
// (simulacros, rescates en otros países). Se usa solo para encontrar candidatas; se queda la que lo dice en el título.
const SINAPROC_SEISMIC_CANDIDATES = 40;
// MEDUCA publica de todo (concursos, deportes): se revisan sus últimas publicaciones y se quedan las de clases o sismos.
const MEDUCA_SCAN = 100;
const MAX_BODY_BYTES = 600_000;
const TIMEOUT_MS = 10_000;
const RETRY_DELAY_MS = 800;
const MAX_TITLE = 200;
const MAX_SUMMARY = 280;

const SEISMIC_TITLE = /sismo|s[ií]smic|tembl|terremot|tsunami|r[eé]plica/i;
// Avisos de clases: "suspende clases", "clases seguirán suspendidas", "se retoman las clases", "retornan a los centros educativos".
const CLASS_WORDS = /clases|jornada|centros educativos|escuelas|colegios|aulas/i;
const SUSPENDED = /suspend|suspens/i;
const RESUMED = /(retoman|reanud\w*|retornan|regresan|vuelven)[^.]{0,40}(clases|centros educativos|escuelas|aulas)|(clases|jornada)[^.]{0,40}(reanud|retom|normalidad)/i;
const isClassNotice = (title: string) => (SUSPENDED.test(title) && CLASS_WORDS.test(title)) || RESUMED.test(title);

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…", ndash: "–", mdash: "—",
  laquo: "«", raquo: "»", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”",
};

function decodeEntity(match: string, body: string): string {
  if (body[0] === "#") {
    const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
    return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
  }
  return NAMED_ENTITIES[body.toLowerCase()] ?? match;
}

// HTML de WordPress → texto plano. Primero se quitan las etiquetas y después se decodifican las entidades.
export function cleanText(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, decodeEntity)
    .replace(/\s+/g, " ")
    .trim();
}

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:.\-–—]+$/, "")}…`;
}

// Solo se enlaza a páginas del dominio oficial de la propia fuente, por HTTPS y sin puerto ni credenciales.
export function officialUrl(value: unknown, hosts: ReadonlySet<string>): string | null {
  if (typeof value !== "string" || value.length > 400) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !hosts.has(url.hostname) || url.port || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);
const rendered = (value: unknown) => (isObject(value) && typeof value.rendered === "string" ? value.rendered : null);

const GMT_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;

// Convierte la respuesta de la API en noticias. Las entradas mal formadas se descartan una a una; si llega una lista con
// contenido y ninguna sirve, es que la API cambió: se lanza un error para no publicar una página vacía por error.
export function parsePosts(data: unknown, source: NewsSource, now = Date.now()): NewsItem[] {
  if (!Array.isArray(data)) throw new Error(`${source.name} devolvió algo distinto a una lista de comunicados`);
  const items: NewsItem[] = [];
  for (const raw of data) {
    if (!isObject(raw)) continue;
    const { id, date_gmt: date } = raw;
    const title = rendered(raw.title);
    const excerpt = rendered(raw.excerpt);
    const url = officialUrl(raw.link, source.hosts);
    if (!Number.isInteger(id) || (id as number) <= 0 || typeof date !== "string" || !GMT_DATE.test(date) || title === null || !url) continue;
    const published = Date.parse(`${date}Z`);
    if (!Number.isFinite(published) || published > now + 86_400_000) continue;
    const cleanTitle = clip(cleanText(title), MAX_TITLE);
    if (!cleanTitle) continue;
    const summary = clip(cleanText(excerpt ?? "").replace(/\s*\[…\]$/, "…"), MAX_SUMMARY);
    items.push({
      id: `${source.id}-${id}`,
      source: source.id,
      title: cleanTitle,
      summary,
      url,
      publishedAt: new Date(published).toISOString(),
      sismico: SEISMIC_TITLE.test(cleanTitle),
      clases: isClassNotice(cleanTitle),
    });
  }
  if (data.length > 0 && items.length === 0) throw new Error(`Ningún comunicado de ${source.name} tenía el formato esperado`);
  return items;
}

// GET por HTTPS con la verificación del certificado siempre activada. Se usa `node:https` y no `fetch` para poder añadir el
// certificado intermedio que le falta a MEDUCA (ver news-certs.ts). Sin redirecciones: la API responde directamente, y si
// algún día redirige se trata como un fallo y la página lo avisa. El cuerpo tiene tope de tamaño.
function getText(url: URL, source: NewsSource): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: { Accept: "application/json", "User-Agent": "SismoPanama/1.0 (+https://sismopanama.vercel.app)" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        agent: false,
        ...(source.extraCa && { ca: [...rootCertificates, source.extraCa] }),
      },
      response => {
        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`${source.name} respondió ${response.statusCode}`));
          return;
        }
        response.setEncoding("utf8");
        let body = "";
        let bytes = 0;
        response.on("data", (chunk: string) => {
          bytes += Buffer.byteLength(chunk);
          if (bytes > MAX_BODY_BYTES) {
            request.destroy(new Error(`La respuesta de ${source.name} es más grande de lo esperado`));
            return;
          }
          body += chunk;
        });
        response.on("end", () => resolve(body));
        response.on("error", reject);
      },
    );
    request.on("error", reject);
  });
}

async function getPosts(source: NewsSource, params: Record<string, string | number>): Promise<NewsItem[]> {
  const url = new URL(source.api);
  url.searchParams.set("_fields", "id,date_gmt,link,title,excerpt");
  url.searchParams.set("orderby", "date");
  url.searchParams.set("order", "desc");
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  return parsePosts(JSON.parse(await getText(url, source)), source);
}

// Un reintento corto evita que un tropiezo momentáneo de la entidad deje la sección vacía durante los 10 minutos siguientes.
async function withRetry<T>(task: () => Promise<T>): Promise<T> {
  try {
    return await task();
  } catch {
    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
    return task();
  }
}

async function loadSinaproc() {
  const source = SOURCES.sinaproc;
  const [latest, candidates] = await Promise.all([
    getPosts(source, { per_page: LATEST_COUNT }),
    getPosts(source, { search: "sismo", per_page: SINAPROC_SEISMIC_CANDIDATES }),
  ]);
  if (latest.length === 0) throw new Error("SINAPROC no devolvió comunicados recientes");
  return { latest, pool: [...latest, ...candidates] };
}

async function loadMeduca() {
  const scanned = await getPosts(SOURCES.meduca, { per_page: MEDUCA_SCAN });
  if (scanned.length === 0) throw new Error("MEDUCA no devolvió publicaciones");
  return { pool: scanned, coversSince: scanned[scanned.length - 1].publishedAt };
}

const byNewest = (a: NewsItem, b: NewsItem) => b.publishedAt.localeCompare(a.publishedAt);

function unique(items: NewsItem[]): NewsItem[] {
  return [...new Map(items.map(item => [item.id, item])).values()].sort(byNewest);
}

// Si una fuente falla, las demás se muestran igual y la página avisa cuál no respondió. Solo si fallan todas se lanza el
// error: así Next conserva la última copia buena de la página en lugar de reemplazarla por una vacía.
export async function fetchOfficialNews(): Promise<OfficialNews> {
  const [sinaproc, meduca] = await Promise.allSettled([withRetry(loadSinaproc), withRetry(loadMeduca)]);
  if (sinaproc.status === "rejected") console.error("[noticias] SINAPROC no respondió:", sinaproc.reason);
  if (meduca.status === "rejected") console.error("[noticias] MEDUCA no respondió:", meduca.reason);
  if (sinaproc.status === "rejected" && meduca.status === "rejected") throw sinaproc.reason;

  const pool = [...(sinaproc.status === "fulfilled" ? sinaproc.value.pool : []), ...(meduca.status === "fulfilled" ? meduca.value.pool : [])];
  return {
    available: { sinaproc: sinaproc.status === "fulfilled", meduca: meduca.status === "fulfilled" },
    seismic: unique(pool.filter(item => item.sismico)).slice(0, SEISMIC_COUNT),
    classes: unique(pool.filter(item => item.source === "meduca" && item.clases)).slice(0, CLASSES_COUNT),
    latest: sinaproc.status === "fulfilled" ? sinaproc.value.latest : [],
    meducaCoversSince: meduca.status === "fulfilled" ? meduca.value.coversSince : null,
    fetchedAt: new Date().toISOString(),
  };
}
