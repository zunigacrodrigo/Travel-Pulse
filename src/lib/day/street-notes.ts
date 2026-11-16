/**
 * Personas como sensores, sin usuarios propios: notas ABIERTAS de OpenStreetMap cerca de una parada. Son avisos que
 * cualquiera deja sobre la calle («están agregando semáforos», «este local cerró»). No están verificados: se muestran como tales.
 */
import { fetchJson, type FetchOptions } from "@/lib/sources/http";

export interface StreetNote { id: number; lat: number; lon: number; date: string; text: string; url: string }

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function parseNotes(raw: unknown): StreetNote[] {
  if (!isRecord(raw) || !Array.isArray(raw.features)) return [];
  const out: StreetNote[] = [];
  for (const f of raw.features) {
    if (!isRecord(f) || !isRecord(f.geometry) || !Array.isArray(f.geometry.coordinates) || !isRecord(f.properties)) continue;
    const [lon, lat] = f.geometry.coordinates as unknown[];
    const p = f.properties;
    const first = Array.isArray(p.comments) && isRecord(p.comments[0]) ? p.comments[0] : null;
    const text = first && typeof first.text === "string" ? first.text.replace(/\s+/g, " ").replace(/#\w+/g, "").trim() : "";
    if (typeof lat !== "number" || typeof lon !== "number" || typeof p.id !== "number" || p.status !== "open" || text.length < 8) continue;
    out.push({ id: p.id, lat, lon, date: typeof p.date_created === "string" ? p.date_created.slice(0, 10) : "", text: text.slice(0, 200), url: `https://www.openstreetmap.org/note/${p.id}` });
  }
  return out;
}

const meters = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
  const R = 6_371_000, toRad = Math.PI / 180, dLat = (b.lat - a.lat) * toRad, dLon = (b.lon - a.lon) * toRad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

/** Notas a menos de `radiusM` de cada punto y de los últimos `maxAgeDays` días. */
export function notesNear<T extends { id: string; lat: number; lon: number }>(notes: readonly StreetNote[], points: readonly T[], now: Date, radiusM = 250, maxAgeDays = 120): Record<string, StreetNote[]> {
  const out: Record<string, StreetNote[]> = {};
  const minDate = new Date(now.getTime() - maxAgeDays * 86_400_000).toISOString().slice(0, 10);
  for (const p of points) {
    const near = notes.filter((n) => n.date >= minDate && meters(p, n) <= radiusM).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 2);
    if (near.length) out[p.id] = near;
  }
  return out;
}

/** Nunca lanza. Una sola consulta por caja que cubre todas las paradas. */
export async function fetchNotes(points: readonly { lat: number; lon: number }[], opts: FetchOptions & { base?: string } = {}): Promise<StreetNote[] | null> {
  if (!points.length) return [];
  const pad = 0.004;
  const lats = points.map((p) => p.lat), lons = points.map((p) => p.lon);
  const bbox = [Math.min(...lons) - pad, Math.min(...lats) - pad, Math.max(...lons) + pad, Math.max(...lats) + pad].map((x) => x.toFixed(5)).join(",");
  const { base = "https://api.openstreetmap.org", ...rest } = opts;
  try { return parseNotes(await fetchJson(`${base}/api/0.6/notes.json?bbox=${bbox}&limit=100&closed=0`, { timeoutMs: 7000, ...rest })); } catch { return null; }
}
