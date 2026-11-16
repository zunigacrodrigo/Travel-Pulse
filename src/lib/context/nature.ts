/**
 * Aves más registradas cerca del centro (GBIF: observaciones de ciencia ciudadana y museos). Cuenta REGISTROS, no abundancia: refleja dónde y
 * cuánto observa la gente. Solo se muestran especies (se descartan registros que llegan hasta género). Sin nombres comunes: la fuente no los trae.
 */
import { fetchJson, type FetchOptions } from "@/lib/sources/http";

export interface BirdSpecies { scientificName: string; records: number }
export interface NatureResult { cityKey: string; totalRecords: number; species: BirdSpecies[]; yearFrom: number; yearTo: number; areaKm: number; fetchedAt: string; stale: boolean }

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** «Turdus falcklandii Quoy & Gaimard, 1824» → «Turdus falcklandii». Un género solo («Daptrius Vieillot, 1816») → null. */
export function speciesName(full: string): string | null {
  const m = /^([A-Z][a-z]+)\s+([a-z][a-z-]+)(?:\s|$)/.exec(full.trim());
  return m ? `${m[1]} ${m[2]}` : null;
}

export function parseNature(raw: unknown, max = 6): { total: number; species: BirdSpecies[] } {
  if (!isRecord(raw)) return { total: 0, species: [] };
  const total = typeof raw.count === "number" && Number.isFinite(raw.count) ? raw.count : 0;
  const counts = Array.isArray(raw.facets) && isRecord(raw.facets[0]) && Array.isArray(raw.facets[0].counts) ? (raw.facets[0].counts as unknown[]) : [];
  const merged = new Map<string, number>();
  for (const c of counts) {
    if (!isRecord(c) || typeof c.name !== "string" || typeof c.count !== "number") continue;
    const name = speciesName(c.name);
    if (name) merged.set(name, (merged.get(name) ?? 0) + c.count); // subespecies y autores distintos suman a la misma especie
  }
  const species = [...merged].map(([scientificName, records]) => ({ scientificName, records })).sort((a, b) => b.records - a.records).slice(0, max);
  return { total, species };
}

const TTL_MS = 7 * 24 * 3_600_000;
const cache = new Map<string, NatureResult>();
export function _clearNatureCacheForTests() { cache.clear(); }
const HALF_DEG = 0.1; // ≈ 11 km a cada lado

export async function fetchNature(cityKey: string, lat: number, lon: number, now: Date, opts: FetchOptions & { base?: string } = {}): Promise<NatureResult> {
  const hit = cache.get(cityKey);
  if (hit && now.getTime() - Date.parse(hit.fetchedAt) < TTL_MS) return { ...hit, stale: false };
  const { base = "https://api.gbif.org", ...rest } = opts;
  const yearTo = now.getUTCFullYear(), yearFrom = yearTo - 5;
  const q = new URLSearchParams({
    limit: "0", classKey: "212", occurrenceStatus: "PRESENT", facet: "scientificName", facetLimit: "20",
    decimalLatitude: `${lat - HALF_DEG},${lat + HALF_DEG}`, decimalLongitude: `${lon - HALF_DEG},${lon + HALF_DEG}`, year: `${yearFrom},${yearTo}`,
  });
  try {
    const { total, species } = parseNature(await fetchJson(`${base}/v1/occurrence/search?${q}`, { timeoutMs: 10_000, ...rest }));
    const r: NatureResult = { cityKey, totalRecords: total, species, yearFrom, yearTo, areaKm: 22, fetchedAt: now.toISOString(), stale: false };
    if (species.length) cache.set(cityKey, r);
    return r;
  } catch (e) {
    if (hit) return { ...hit, stale: true };
    throw e;
  }
}
