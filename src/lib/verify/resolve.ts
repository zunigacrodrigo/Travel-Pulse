/**
 * Ubica en el mapa real un lugar nombrado en un itinerario (p. ej. el de ChatGPT) y trae lo que OpenStreetMap
 * sabe: coordenadas, horario y artículo de Wikipedia. Nunca elige en silencio: informa con qué nombre lo
 * encontró y qué tan segura es la coincidencia.
 */
import { fetchJson, type FetchOptions } from "@/lib/sources/http";
import { parseOpeningHours, type ParsedHours } from "@/lib/day/openingHours";

export interface Resolved {
  osmId: string;
  matchedName: string;
  lat: number;
  lon: number;
  category: string;
  type: string;
  hoursRaw: string | null;
  hours: ParsedHours | null;
  wikipedia: string | null;
  website: string | null;
  /** «alta»: el nombre coincide; «dudosa»: el mapa devolvió otra cosa y hay que confirmarlo. */
  confidence: "alta" | "dudosa";
  /** Consulta con la que se encontró. */
  query: string;
}

interface Raw { osm_type?: string; osm_id?: number; lat?: string; lon?: string; name?: string; display_name?: string; category?: string; type?: string; extratags?: Record<string, string> | null }

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const STOP = new Set(["de", "da", "do", "del", "la", "el", "los", "las", "sao", "paulo", "the", "mercado"].filter((w) => w !== "mercado"));
const tokens = (s: string) => fold(s).split(/[^a-z0-9]+/).filter((t) => t.length >= 3 && !STOP.has(t));

/** Parecido (0..1) entre el nombre buscado y el que devolvió el mapa. */
export function nameScore(wanted: string, found: string): number {
  const a = new Set(tokens(wanted)), b = new Set(tokens(found));
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / Math.min(a.size, b.size);
}

const km = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const r = Math.PI / 180, x = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(x));
};

/** Elige el mejor candidato cerca de la ciudad. Devuelve null si ninguno sirve. */
export function pickBest(raw: unknown, wanted: string, center: { lat: number; lon: number }, maxKm = 45): Resolved | null {
  if (!Array.isArray(raw)) return null;
  let best: { r: Raw; score: number } | null = null;
  for (const r of raw as Raw[]) {
    const lat = Number(r?.lat), lon = Number(r?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || km(lat, lon, center.lat, center.lon) > maxKm) continue;
    const name = r.name ?? "";
    const score = Math.max(nameScore(wanted, name), nameScore(wanted, r.display_name?.split(",")[0] ?? ""));
    if (!best || score > best.score) best = { r, score };
  }
  if (!best) return null;
  const r = best.r, e = r.extratags ?? {};
  const hoursRaw = typeof e.opening_hours === "string" && e.opening_hours.trim() ? e.opening_hours.trim() : null;
  return {
    osmId: `${r.osm_type ?? "x"}/${r.osm_id ?? "?"}`,
    matchedName: (r.name ?? r.display_name?.split(",")[0] ?? wanted).trim(),
    lat: Number(r.lat), lon: Number(r.lon),
    category: r.category ?? "", type: r.type ?? "",
    hoursRaw, hours: parseOpeningHours(hoursRaw),
    wikipedia: typeof e.wikipedia === "string" ? e.wikipedia : null,
    website: typeof e.website === "string" && /^https?:\/\//.test(e.website) ? e.website : null,
    confidence: best.score >= 0.5 ? "alta" : "dudosa",
    query: wanted,
  };
}

const cache = new Map<string, { at: number; value: Resolved | null }>();
const TTL_MS = 6 * 3_600_000;
let lastCall = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function resolvePlace(
  name: string, city: { name: string; center: { lat: number; lon: number } }, opts: FetchOptions & { base?: string; address?: string; spacingMs?: number; now?: () => number } = {},
): Promise<Resolved | null> {
  const { base = "https://nominatim.openstreetmap.org", address, spacingMs = 1100, now = Date.now, ...rest } = opts;
  const key = `${city.name}|${name}|${address ?? ""}`;
  const hit = cache.get(key);
  if (hit && now() - hit.at < TTL_MS) return hit.value;
  // Primero por nombre; si no aparece y hay dirección, por la dirección.
  const queries = [`${name}, ${city.name}`, ...(address ? [address] : [])];
  let found: Resolved | null = null;
  for (const q of queries) {
    const wait = lastCall + spacingMs - now();
    if (wait > 0) await sleep(wait);
    lastCall = now();
    const raw = await fetchJson(`${base}/search?format=jsonv2&extratags=1&limit=5&q=${encodeURIComponent(q)}`, { timeoutMs: 12_000, ...rest });
    found = pickBest(raw, name, city.center);
    if (found) break;
  }
  cache.set(key, { at: now(), value: found });
  return found;
}

export function _resetResolveCache() { cache.clear(); lastCall = 0; }
