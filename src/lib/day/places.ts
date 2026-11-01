/**
 * Lugares reales de OpenStreetMap (vía Nominatim). Solo lo que el mapa dice: nombre, coordenadas y las
 * etiquetas que la comunidad cargó (horario, sitio web, wikidata…). No hay reseñas ni puntajes de calidad.
 *
 * Orden: lugares con horario interpretable primero, luego los que tienen sitio web o wikidata, luego la
 * «importancia» que Nominatim calcula a partir de enlaces de Wikipedia. Es una regla de completitud y
 * notoriedad, NO una opinión sobre si el lugar es bueno: eso lo aportan las personas.
 */
import { fetchJson, type FetchOptions } from "@/lib/sources/http";
import { parseOpeningHours, type ParsedHours } from "./openingHours";

export const KINDS = ["museo", "galeria", "restaurante", "pub", "parque"] as const;
export type Kind = (typeof KINDS)[number];

/**
 * `queries`: en OpenStreetMap las galerías de São Paulo casi no están como «galería»: son «centros de arte»
 * (Tomie Ohtake, CCBB, SESC Paulista…), y las galerías de arte salen buscando en portugués. Se consultan ambas.
 */
export const KIND_META: Record<Kind, { label: string; plural: string; queries: readonly string[]; indoor: boolean; durationMin: number }> = {
  museo: { label: "Museo", plural: "Museos", queries: ["museum"], indoor: true, durationMin: 90 },
  galeria: { label: "Galería o centro cultural", plural: "Galerías y centros culturales", queries: ["arts centre", "galeria de arte"], indoor: true, durationMin: 60 },
  restaurante: { label: "Restaurante", plural: "Restaurantes", queries: ["restaurant"], indoor: true, durationMin: 75 },
  pub: { label: "Pub o bar", plural: "Pubs y bares", queries: ["pub"], indoor: true, durationMin: 90 },
  parque: { label: "Parque", plural: "Parques", queries: ["park"], indoor: false, durationMin: 60 },
};

export interface Place {
  id: string;
  name: string;
  kind: Kind;
  lat: number;
  lon: number;
  /** Texto original de OSM, para mostrarlo tal cual. */
  hoursRaw: string | null;
  /** null = «horario sin confirmar». */
  hours: ParsedHours | null;
  website: string | null;
  wikidata: string | null;
  /** Etiqueta de OSM «lang:Título» del artículo de Wikipedia, si existe. */
  wikipedia: string | null;
  cuisine: string | null;
  importance: number;
  indoor: boolean;
}

interface Raw {
  osm_type?: string; osm_id?: number; lat?: string; lon?: string; name?: string;
  category?: string; type?: string; importance?: number; extratags?: Record<string, string> | null;
}

const OK_TYPE: Record<Kind, ReadonlyArray<[string, string]>> = {
  museo: [["tourism", "museum"]],
  galeria: [["tourism", "gallery"], ["amenity", "arts_centre"]],
  restaurante: [["amenity", "restaurant"]],
  pub: [["amenity", "pub"], ["amenity", "bar"]],
  parque: [["leisure", "park"], ["leisure", "garden"]],
};
const GENERIC = /^(restaurant|restaurante|pub|bar|museum|museu|museo|gallery|galeria|galería|park|parque|cafe|café)$/i;
const STREET = /^(rua|avenida|av\.?|travessa|estrada|rodovia|alameda)\s/i;

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const dist = (a: Place, b: Place) => Math.hypot((a.lat - b.lat) * 111_000, (a.lon - b.lon) * 111_000 * Math.cos((a.lat * Math.PI) / 180));

/** Convierte la respuesta de Nominatim en lugares utilizables y descarta lo que no lo es. */
export function normalizePlaces(raw: unknown, kind: Kind): Place[] {
  if (!Array.isArray(raw)) return [];
  const out: Place[] = [];
  for (const r of raw as Raw[]) {
    if (!r || typeof r !== "object") continue;
    const name = typeof r.name === "string" ? r.name.trim() : "";
    const lat = Number(r.lat), lon = Number(r.lon);
    if (name.length < 3 || GENERIC.test(name) || STREET.test(name)) continue;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    if (!OK_TYPE[kind].some(([c, t]) => r.category === c && r.type === t)) continue;
    const e = r.extratags ?? {};
    const hoursRaw = typeof e.opening_hours === "string" && e.opening_hours.trim() ? e.opening_hours.trim() : null;
    const web = e.website ?? e["contact:website"] ?? null;
    out.push({
      id: `${r.osm_type ?? "x"}/${r.osm_id ?? name}`,
      name, kind, lat, lon,
      hoursRaw,
      hours: parseOpeningHours(hoursRaw),
      website: typeof web === "string" && /^https?:\/\//.test(web) ? web : null,
      wikidata: typeof e.wikidata === "string" ? e.wikidata : null,
      wikipedia: typeof e.wikipedia === "string" ? e.wikipedia : null,
      cuisine: typeof e.cuisine === "string" ? e.cuisine : null,
      importance: typeof r.importance === "number" ? r.importance : 0,
      indoor: KIND_META[kind].indoor,
    });
  }
  // Mismo nombre a menos de 150 m = el mismo lugar (OSM suele repetirlo como nodo y como polígono).
  const kept: Place[] = [];
  for (const p of out) if (!kept.some((q) => norm(q.name) === norm(p.name) && dist(q, p) < 150)) kept.push(p);
  return rankPlaces(kept);
}

export function rankPlaces(list: readonly Place[]): Place[] {
  const score = (p: Place) => (p.hours ? 4 : 0) + (p.website ? 2 : 0) + (p.wikidata || p.wikipedia ? 2 : 0);
  return [...list].sort((a, b) => score(b) - score(a) || b.importance - a.importance || a.name.localeCompare(b.name, "es"));
}

export interface Center { lat: number; lon: number }

const cache = new Map<string, { at: number; places: Place[] }>();
const TTL_MS = 6 * 3_600_000;
let lastCall = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Lugares de un tipo alrededor de un punto. Respeta el uso razonable de Nominatim (1 consulta por segundo). */
export async function fetchPlaces(kind: Kind, c: Center, opts: FetchOptions & { base?: string; deltaDeg?: number; now?: () => number; spacingMs?: number } = {}): Promise<Place[]> {
  const { base = "https://nominatim.openstreetmap.org", deltaDeg = 0.06, now = Date.now, spacingMs = 1100, ...rest } = opts;
  const key = `${kind}|${c.lat.toFixed(2)}|${c.lon.toFixed(2)}|${deltaDeg}`;
  const hit = cache.get(key);
  if (hit && now() - hit.at < TTL_MS) return hit.places;
  const wait = lastCall + spacingMs - now();
  if (wait > 0) await sleep(wait);
  lastCall = now();
  const vb = `${(c.lon - deltaDeg).toFixed(4)},${(c.lat + deltaDeg).toFixed(4)},${(c.lon + deltaDeg).toFixed(4)},${(c.lat - deltaDeg).toFixed(4)}`;
  const rows: unknown[] = [];
  for (const [i, query] of KIND_META[kind].queries.entries()) {
    if (i > 0) await sleep(spacingMs);
    lastCall = now();
    const part = await fetchJson(`${base}/search?format=jsonv2&extratags=1&limit=40&bounded=1&viewbox=${vb}&q=${encodeURIComponent(query)}`, { timeoutMs: 12_000, ...rest });
    if (Array.isArray(part)) rows.push(...part);
  }
  const raw = rows;
  const places = normalizePlaces(raw, kind);
  cache.set(key, { at: now(), places });
  return places;
}

/** Solo para pruebas. */
export function _resetPlacesCache() { cache.clear(); lastCall = 0; }
