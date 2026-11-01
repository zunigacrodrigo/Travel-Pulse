/**
 * Foto y descripción de un lugar a partir del artículo de Wikipedia que OpenStreetMap enlaza
 * (etiqueta `wikipedia=pt:Museu de Arte de São Paulo`). Las imágenes vienen de Wikimedia Commons con
 * licencias libres: siempre se muestran con enlace a su página para ver autoría y licencia.
 * Verificado con la API real: las miniaturas están en `thumb.wikimedia.org`.
 */
import { fetchJson, type FetchOptions } from "@/lib/sources/http";

export interface Media {
  title: string;
  description: string | null;
  extract: string | null;
  thumbnailUrl: string | null;
  pageUrl: string;
}

const IMAGE_HOSTS = new Set(["upload.wikimedia.org", "thumb.wikimedia.org"]);
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** «pt:Museu de Arte de São Paulo» → { lang, title }. */
export function parseWikipediaTag(tag: string | null | undefined): { lang: string; title: string } | null {
  const m = /^([a-z]{2,3}):(.{2,200})$/.exec((tag ?? "").trim());
  return m ? { lang: m[1]!, title: m[2]!.trim() } : null;
}

/** Primeras frases hasta ~220 caracteres, sin cortar una palabra. */
export function shorten(text: string, max = 220): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("; "));
  if (stop > 80) return cut.slice(0, stop + 1);
  return `${cut.slice(0, cut.lastIndexOf(" "))}…`;
}

export function parseSummary(raw: unknown): Media | null {
  if (!isRecord(raw)) return null;
  const title = str(raw.title);
  const page = isRecord(raw.content_urls) && isRecord(raw.content_urls.desktop) ? str(raw.content_urls.desktop.page) : null;
  if (!title || !page || !/^https:\/\/[a-z]{2,3}\.wikipedia\.org\//.test(page)) return null;
  let thumb: string | null = null;
  if (isRecord(raw.thumbnail)) {
    const src = str(raw.thumbnail.source);
    try {
      const u = src ? new URL(src) : null;
      if (u && u.protocol === "https:" && IMAGE_HOSTS.has(u.hostname)) thumb = u.toString();
    } catch { /* URL inválida: sin foto */ }
  }
  const extract = str(raw.extract);
  return { title, description: str(raw.description), extract: extract ? shorten(extract) : null, thumbnailUrl: thumb, pageUrl: page };
}

const cache = new Map<string, { at: number; media: Media | null }>();
const TTL_MS = 24 * 3_600_000;

/** Foto y descripción del artículo o `null` si no hay (nunca inventa). Un fallo de red también devuelve null. */
export async function fetchMedia(tag: string, opts: FetchOptions & { now?: () => number } = {}): Promise<Media | null> {
  const parsed = parseWikipediaTag(tag);
  if (!parsed) return null;
  const { now = Date.now, ...rest } = opts;
  const key = `${parsed.lang}:${parsed.title}`;
  const hit = cache.get(key);
  if (hit && now() - hit.at < TTL_MS) return hit.media;
  try {
    const raw = await fetchJson(`https://${parsed.lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(parsed.title.replaceAll(" ", "_"))}`, { timeoutMs: 8000, ...rest });
    const media = parseSummary(raw);
    cache.set(key, { at: now(), media });
    return media;
  } catch {
    return null; // sin caché: se reintentará en la próxima consulta
  }
}

export function _resetMediaCache() { cache.clear(); }
