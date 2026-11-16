/**
 * Personas como sensores, sin usuarios propios: cuánta gente LEYÓ sobre un lugar en Wikipedia los últimos 30 días.
 * Es interés real y público (Wikimedia Pageviews, solo lectores humanos). Mide atención, NO calidad ni afluencia en el lugar.
 * Un lugar sin artículo queda como «desconocido», no como «cero».
 */
import { fetchJson, type FetchOptions } from "@/lib/sources/http";
import { parseWikipediaTag } from "./media";

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Suma de lecturas del período; `null` si la respuesta no trae días válidos. */
export function parsePageviews(raw: unknown): number | null {
  if (!isRecord(raw) || !Array.isArray(raw.items)) return null;
  let total = 0, days = 0;
  for (const it of raw.items) if (isRecord(it) && typeof it.views === "number" && Number.isFinite(it.views) && it.views >= 0) { total += it.views; days++; }
  return days ? total : null;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");
const TTL_MS = 24 * 3_600_000;
const cache = new Map<string, { at: number; views: number | null }>();
export function _resetInterestCache() { cache.clear(); }

/** Lecturas de los últimos 30 días para una etiqueta de OSM «es:Título». Nunca lanza: sin dato → null. */
export async function fetchViews30(tag: string, now: Date, opts: FetchOptions & { base?: string } = {}): Promise<number | null> {
  const ref = parseWikipediaTag(tag);
  if (!ref) return null;
  const key = `${ref.lang}:${ref.title}`;
  const hit = cache.get(key);
  if (hit && now.getTime() - hit.at < TTL_MS) return hit.views;
  const { base = "https://wikimedia.org", ...rest } = opts;
  const end = new Date(now.getTime() - 86_400_000), start = new Date(end.getTime() - 29 * 86_400_000);
  try {
    const url = `${base}/api/rest_v1/metrics/pageviews/per-article/${ref.lang}.wikipedia/all-access/user/${encodeURIComponent(ref.title.replace(/ /g, "_"))}/daily/${ymd(start)}/${ymd(end)}`;
    const views = parsePageviews(await fetchJson(url, { timeoutMs: 6000, ...rest }));
    cache.set(key, { at: now.getTime(), views });
    return views;
  } catch { return null; }
}
