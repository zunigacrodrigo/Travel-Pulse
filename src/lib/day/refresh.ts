/**
 * «Revisar con datos de hoy»: vuelve a consultar lo que puede haber cambiado desde que se armó el día.
 *  - Horarios: una sola consulta de Nominatim por id de OpenStreetMap (`lookup`), con `extratags`.
 *  - Pronóstico por hora: Open-Meteo, solo si la fecha está dentro de su alcance.
 * Cada fuente que falla se declara en `warnings`; la otra se entrega igual. Nada se rellena con datos inventados.
 */
import { z } from "zod";
import { describeError, fetchJson, type FetchOptions } from "@/lib/sources/http";
import { CITIES } from "./cities";
import { fetchDayWeather, type HourWeather } from "./weather";

const NOMINATIM = "https://nominatim.openstreetmap.org";
const OSM_ID = /^(node|way|relation)\/\d+$/;
const LETTER = { node: "N", way: "W", relation: "R" } as const;
/** Nominatim acepta hasta 50 ids por consulta. */
const MAX_IDS = 50;

export const reviewInputSchema = z.object({
  city: z.string().refine((c) => c in CITIES, "Ciudad no disponible en el piloto."),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  places: z.array(z.string().regex(OSM_ID)).max(MAX_IDS),
}).strict();
export type ReviewInput = z.infer<typeof reviewInputSchema>;

/** «way/1», «node/2» → «W1,N2». Los ids con otro formato se descartan: nunca llegan a la API. */
export function toLookupIds(ids: readonly string[]): string {
  return ids.filter((id) => OSM_ID.test(id)).slice(0, MAX_IDS).map((id) => {
    const [type, n] = id.split("/") as [keyof typeof LETTER, string];
    return `${LETTER[type]}${n}`;
  }).join(",");
}

export interface FreshHours { hoursRaw: string | null }

interface LookupRow { osm_type?: string; osm_id?: number; extratags?: Record<string, string> | null }

/** Horario actual de cada lugar. Un lugar que la fuente no devuelve se omite (no se afirma nada sobre él). */
export async function fetchFreshHours(ids: readonly string[], opts: FetchOptions & { base?: string } = {}): Promise<Record<string, FreshHours>> {
  const list = toLookupIds(ids);
  if (!list) return {};
  const { base = NOMINATIM, ...rest } = opts;
  const raw = await fetchJson(`${base}/lookup?format=jsonv2&extratags=1&osm_ids=${list}`, { timeoutMs: 12_000, ...rest });
  if (!Array.isArray(raw)) return {};
  const out: Record<string, FreshHours> = {};
  for (const r of raw as LookupRow[]) {
    if (!r || typeof r.osm_type !== "string" || typeof r.osm_id !== "number") continue;
    const oh = r.extratags?.opening_hours;
    out[`${r.osm_type}/${r.osm_id}`] = { hoursRaw: typeof oh === "string" && oh.trim() ? oh.trim() : null };
  }
  return out;
}

export interface ReviewData {
  checkedAt: string;
  weather: HourWeather[] | null;
  hours: Record<string, FreshHours>;
  sources: { name: string; url: string; status: "ok" | "error" | "fuera_de_alcance"; detail?: string }[];
  warnings: string[];
}

export async function computeReviewData(input: ReviewInput, deps: { fetchImpl?: typeof fetch; now?: Date } = {}): Promise<ReviewData> {
  const now = deps.now ?? new Date();
  const city = CITIES[input.city]!;
  const http = { fetchImpl: deps.fetchImpl };
  const out: ReviewData = { checkedAt: now.toISOString(), weather: null, hours: {}, sources: [], warnings: [] };

  try {
    out.hours = await fetchFreshHours(input.places, http);
    out.sources.push({ name: "OpenStreetMap (Nominatim)", url: "https://nominatim.openstreetmap.org/", status: "ok" });
  } catch (e) {
    out.sources.push({ name: "OpenStreetMap (Nominatim)", url: "https://nominatim.openstreetmap.org/", status: "error", detail: describeError(e) });
    out.warnings.push(`No pudimos volver a consultar los horarios (${describeError(e)}): se conservan los que ya tenías.`);
  }

  try {
    out.weather = await fetchDayWeather(city.center.lat, city.center.lon, input.date, city.timezone, now, http);
    out.sources.push({ name: "Open-Meteo", url: "https://open-meteo.com/", status: out.weather ? "ok" : "fuera_de_alcance", ...(out.weather ? {} : { detail: "El pronóstico por hora llega hasta unos 15 días." }) });
    if (!out.weather) out.warnings.push("No hay pronóstico por hora para esa fecha: no se evaluó la lluvia.");
  } catch (e) {
    out.sources.push({ name: "Open-Meteo", url: "https://open-meteo.com/", status: "error", detail: describeError(e) });
    out.warnings.push(`No pudimos consultar el pronóstico (${describeError(e)}): no se evaluó la lluvia.`);
  }
  return out;
}
