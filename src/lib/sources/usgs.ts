/**
 * Sismos del USGS (feed GeoJSON de resumen, se actualiza cada minuto).
 * Forma verificada en la documentación oficial del feed:
 *   FeatureCollection { metadata{generated,url,title,api,count,status}, features[] }
 *   feature.properties: mag, place, time (ms desde 1970), updated, url, tsunami…
 *   feature.geometry.coordinates: [longitud, latitud, profundidad]
 */
import { fetchJson, type FetchOptions } from "./http";

export const USGS_SOURCE_ID = "usgs";
export const USGS_DEFAULT_BASE = "https://earthquake.usgs.gov";
export type QuakeFeed = "4.5_week" | "4.5_month";

export interface Quake {
  id: string;
  mag: number;
  place: string;
  /** ISO 8601 UTC. */
  time: string;
  lat: number;
  lon: number;
  depthKm: number | null;
  url: string | null;
  tsunami: boolean;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * Interpreta el GeoJSON. Descarta eventos sin magnitud, hora o coordenadas
 * válidas (el USGS puede publicar eventos incompletos). Más recientes primero.
 * Devuelve null si la respuesta no es un FeatureCollection.
 */
export function parseQuakes(raw: unknown): Quake[] | null {
  if (!isRecord(raw) || raw.type !== "FeatureCollection" || !Array.isArray(raw.features)) return null;
  const out: Quake[] = [];
  for (const f of raw.features) {
    if (!isRecord(f) || !isRecord(f.properties) || !isRecord(f.geometry)) continue;
    const coords = f.geometry.coordinates;
    if (!Array.isArray(coords)) continue;
    const lon = num(coords[0]);
    const lat = num(coords[1]);
    const mag = num(f.properties.mag);
    const ms = num(f.properties.time);
    if (lon === null || lat === null || mag === null || ms === null) continue;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    out.push({
      id: typeof f.id === "string" ? f.id : `${ms}-${lat}-${lon}`,
      mag,
      place: typeof f.properties.place === "string" ? f.properties.place : "Ubicación no informada",
      time: new Date(ms).toISOString(),
      lat,
      lon,
      depthKm: num(coords[2]),
      url: typeof f.properties.url === "string" ? f.properties.url : null,
      tsunami: f.properties.tsunami === 1,
    });
  }
  return out.sort((a, b) => b.time.localeCompare(a.time));
}

export async function fetchQuakes(feed: QuakeFeed, opts: FetchOptions & { base?: string } = {}): Promise<Quake[]> {
  const { base = USGS_DEFAULT_BASE, ...rest } = opts;
  const raw = await fetchJson(`${base}/earthquakes/feed/v1.0/summary/${feed}.geojson`, { timeoutMs: 8000, ...rest });
  const quakes = parseQuakes(raw);
  if (!quakes) throw new Error("Respuesta USGS no interpretable");
  return quakes;
}

const EARTH_RADIUS_KM = 6371;
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

export interface QuakesNear {
  radiusKm: number;
  days: number;
  minMag: number;
  count: number;
  maxMag: number | null;
  strongest: (Quake & { distanceKm: number }) | null;
}

/** Sismos a menos de `radiusKm` de un punto en los últimos `days` días. */
export function quakesNear(
  quakes: readonly Quake[],
  lat: number,
  lon: number,
  now: Date,
  { radiusKm = 300, days = 30, minMag = 4.5 }: { radiusKm?: number; days?: number; minMag?: number } = {},
): QuakesNear {
  const since = now.getTime() - days * 86_400_000;
  let count = 0;
  let strongest: QuakesNear["strongest"] = null;
  for (const q of quakes) {
    if (q.mag < minMag || Date.parse(q.time) < since || Date.parse(q.time) > now.getTime()) continue;
    const distanceKm = haversineKm(lat, lon, q.lat, q.lon);
    if (distanceKm > radiusKm) continue;
    count += 1;
    if (!strongest || q.mag > strongest.mag) strongest = { ...q, distanceKm: Math.round(distanceKm) };
  }
  return { radiusKm, days, minMag, count, maxMag: strongest?.mag ?? null, strongest };
}
