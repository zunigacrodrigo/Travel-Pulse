/**
 * Patrimonio cerca del centro de la ciudad (Wikidata: bienes con una declaratoria de protección). Se ordena por cuántos idiomas de Wikipedia
 * tienen artículo sobre el bien: es un indicador de qué tan conocido es, NO de qué tan bueno o visitable es. Wikidata limita a 1 petición por
 * minuto: la caché es obligatoria.
 */
import { fetchJson, type FetchOptions } from "@/lib/sources/http";

export interface HeritageSite { id: string; name: string; designations: string[]; languages: number; lat: number | null; lon: number | null; url: string }
export interface HeritageResult { cityKey: string; radiusKm: number; sites: HeritageSite[]; fetchedAt: string; stale: boolean }

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const val = (b: Record<string, unknown>, k: string): string | null => (isRecord(b[k]) && typeof b[k].value === "string" ? (b[k].value as string) : null);

export function parseHeritage(raw: unknown, max = 10): HeritageSite[] {
  if (!isRecord(raw) || !isRecord(raw.results) || !Array.isArray(raw.results.bindings)) return [];
  const byId = new Map<string, HeritageSite>();
  for (const b of raw.results.bindings) {
    if (!isRecord(b)) continue;
    const uri = val(b, "x"), name = val(b, "xLabel");
    const id = uri?.match(/\/(Q\d+)$/)?.[1];
    if (!id || !name || /^Q\d+$/.test(name)) continue; // sin etiqueta en es/en: no se muestra un código
    const des = val(b, "desLabel");
    let site = byId.get(id);
    if (!site) {
      const lat = Number(val(b, "lat")), lon = Number(val(b, "lon"));
      site = { id, name, designations: [], languages: Number(val(b, "sl")) || 0, lat: Number.isFinite(lat) && val(b, "lat") !== null ? lat : null, lon: Number.isFinite(lon) && val(b, "lon") !== null ? lon : null, url: `https://www.wikidata.org/wiki/${id}` };
      byId.set(id, site);
    }
    if (des && !/^Q\d+$/.test(des) && !site.designations.includes(des)) site.designations.push(des);
  }
  return [...byId.values()].sort((a, b) => b.languages - a.languages || a.name.localeCompare(b.name, "es")).slice(0, max);
}

export function heritageQuery(lat: number, lon: number, radiusKm: number): string {
  return `SELECT ?x ?xLabel ?desLabel ?lat ?lon ?sl WHERE {
 SERVICE wikibase:around { ?x wdt:P625 ?c . bd:serviceParam wikibase:center "Point(${lon} ${lat})"^^geo:wktLiteral . bd:serviceParam wikibase:radius "${radiusKm}" }
 ?x wdt:P1435 ?des . ?x wikibase:sitelinks ?sl .
 BIND(geof:latitude(?c) AS ?lat) BIND(geof:longitude(?c) AS ?lon)
 SERVICE wikibase:label { bd:serviceParam wikibase:language "es,en". } } ORDER BY DESC(?sl) LIMIT 60`;
}

const TTL_MS = 7 * 24 * 3_600_000;
const cache = new Map<string, HeritageResult>();
export function _clearHeritageCacheForTests() { cache.clear(); }

export async function fetchHeritage(cityKey: string, lat: number, lon: number, now: Date, opts: FetchOptions & { base?: string; radiusKm?: number } = {}): Promise<HeritageResult> {
  const hit = cache.get(cityKey);
  if (hit && now.getTime() - Date.parse(hit.fetchedAt) < TTL_MS) return { ...hit, stale: false };
  const { base = "https://query.wikidata.org", radiusKm = 4, ...rest } = opts;
  try {
    const url = `${base}/sparql?format=json&query=${encodeURIComponent(heritageQuery(lat, lon, radiusKm))}`;
    const sites = parseHeritage(await fetchJson(url, { timeoutMs: 20_000, ...rest }));
    const r: HeritageResult = { cityKey, radiusKm, sites, fetchedAt: now.toISOString(), stale: false };
    if (sites.length) cache.set(cityKey, r);
    return r;
  } catch (e) {
    if (hit) return { ...hit, stale: true };
    throw e;
  }
}
