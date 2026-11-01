/**
 * «Mi día en la ciudad»: junta lugares reales (OpenStreetMap), traslados reales (OSRM de FOSSGIS),
 * pronóstico por hora (Open-Meteo) y el planificador. Cada fuente que falla se informa en `warnings`
 * y el día se arma con lo que sí hay; nada se rellena con datos inventados.
 */
import { z } from "zod";
import { describeError } from "@/lib/sources/http";
import { fetchMedia, type Media } from "./media";
import { KINDS, KIND_META, fetchPlaces, type Kind, type Place } from "./places";
import { buildDay, type DayPlan, type TravelData } from "./planner";
import { fetchMatrix, type Point } from "./routing";
import { fetchDayWeather, rainWindows, type HourWeather, type RainWindow } from "./weather";

import { CITIES, type City } from "./cities";
export { CITIES, type City } from "./cities";

export const dayInputSchema = z
  .object({
    city: z.string().refine((c) => c in CITIES, "Ciudad no disponible en el piloto."),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    startMin: z.number().int().min(0).max(1439),
    endMin: z.number().int().min(60).max(1440),
    wishes: z
      .array(z.object({ kind: z.enum(KINDS), pin: z.string().max(80).optional(), minStart: z.number().int().min(0).max(1439).optional() }).strict())
      .min(1)
      .max(8),
  })
  .strict()
  .refine((v) => v.endMin - v.startMin >= 60, { message: "El día debe durar al menos una hora.", path: ["endMin"] })
  .refine((v) => !Number.isNaN(Date.parse(`${v.date}T12:00:00Z`)), { message: "Fecha inválida.", path: ["date"] });
export type DayInput = z.infer<typeof dayInputSchema>;

export interface SourceNote { name: string; url: string; status: "ok" | "error" | "fuera_de_alcance"; detail?: string }

export interface DayResponse {
  generatedAt: string;
  city: City;
  date: string;
  startMin: number;
  endMin: number;
  plan: DayPlan;
  candidates: Record<Kind, Place[]>;
  /** Foto y descripción de Wikipedia por id de lugar (solo para las paradas que tienen artículo). */
  media: Record<string, Media>;
  weather: { hours: HourWeather[]; windows: RainWindow[] } | null;
  sources: SourceNote[];
  warnings: string[];
}

const TOP_PER_KIND = 8;

export interface Deps { fetchImpl?: typeof fetch; now?: Date; spacingMs?: number }

export async function computeDayPlan(input: DayInput, deps: Deps = {}): Promise<DayResponse> {
  const city = CITIES[input.city]!;
  const now = deps.now ?? new Date();
  const http = { fetchImpl: deps.fetchImpl };
  const warnings: string[] = [];
  const sources: SourceNote[] = [];
  const kinds = [...new Set(input.wishes.map((w) => w.kind))];

  // Lugares: una consulta por tipo, en serie y con pausa (uso razonable de Nominatim).
  const candidates: Record<Kind, Place[]> = { museo: [], galeria: [], restaurante: [], pub: [], parque: [] };
  let placesOk = 0;
  for (const kind of kinds) {
    try {
      const all = await fetchPlaces(kind, city.center, { ...http, spacingMs: deps.spacingMs });
      const top = all.slice(0, TOP_PER_KIND);
      for (const w of input.wishes) {
        if (w.kind === kind && w.pin && !top.some((p) => p.id === w.pin)) {
          const pinned = all.find((p) => p.id === w.pin);
          if (pinned) top.push(pinned);
        }
      }
      candidates[kind] = top;
      placesOk++;
    } catch (e) {
      warnings.push(`No pudimos consultar ${KIND_META[kind].plural.toLowerCase()} en OpenStreetMap (${describeError(e)}).`);
    }
  }
  sources.push({ name: "OpenStreetMap (Nominatim)", url: "https://www.openstreetmap.org/copyright", status: placesOk === kinds.length ? "ok" : "error", ...(placesOk < kinds.length ? { detail: `${kinds.length - placesOk} consulta(s) fallaron` } : {}) });

  // Traslados reales entre todos los puntos.
  const flat = kinds.flatMap((k) => candidates[k]);
  const ids = ["origen", ...flat.map((p) => p.id)];
  const points: Point[] = [city.center, ...flat];
  let foot: number[][] | null = null;
  let car: number[][] | null = null;
  if (flat.length) {
    const [f, c] = await Promise.allSettled([fetchMatrix(points, "foot", http), fetchMatrix(points, "car", http)]);
    foot = f.status === "fulfilled" ? f.value : null;
    car = c.status === "fulfilled" ? c.value : null;
    if (!foot && !car) warnings.push("No pudimos calcular los traslados: se reservaron 30 minutos entre actividades.");
    sources.push({ name: "OSRM (rutas de OpenStreetMap, FOSSGIS)", url: "https://routing.openstreetmap.de/", status: foot || car ? "ok" : "error" });
  }
  const travel: TravelData = { ids, foot, car };

  // Pronóstico por hora.
  let weather: HourWeather[] | null = null;
  try {
    weather = await fetchDayWeather(city.center.lat, city.center.lon, input.date, city.timezone, now, http);
    sources.push({ name: "Open-Meteo", url: "https://open-meteo.com/", status: weather ? "ok" : "fuera_de_alcance", ...(weather ? {} : { detail: "El pronóstico por hora llega hasta unos 15 días." }) });
    if (!weather) warnings.push("No hay pronóstico por hora para esa fecha todavía: no se evaluó la lluvia.");
  } catch (e) {
    sources.push({ name: "Open-Meteo", url: "https://open-meteo.com/", status: "error", detail: describeError(e) });
    warnings.push(`No pudimos consultar el pronóstico (${describeError(e)}): no se evaluó la lluvia.`);
  }

  const plan = buildDay({ date: input.date, startMin: input.startMin, endMin: input.endMin, wishes: input.wishes, candidates, travel, weather });

  // Fotos y descripciones: solo de las paradas elegidas y solo si OpenStreetMap enlaza un artículo. Sin foto no es un error.
  const media: Record<string, Media> = {};
  const withArticle = plan.stops.filter((s) => s.place.wikipedia);
  if (withArticle.length) {
    const found = await Promise.all(withArticle.map(async (s) => [s.place.id, await fetchMedia(s.place.wikipedia!, http)] as const));
    for (const [id, m] of found) if (m) media[id] = m;
    sources.push({ name: "Wikipedia y Wikimedia Commons", url: "https://commons.wikimedia.org/", status: Object.keys(media).length ? "ok" : "error", ...(Object.keys(media).length ? {} : { detail: "no respondió; los lugares se muestran sin foto" }) });
  }
  return {
    generatedAt: now.toISOString(), city, date: input.date, startMin: input.startMin, endMin: input.endMin,
    plan, candidates, media, weather: weather ? { hours: weather, windows: rainWindows(weather) } : null, sources, warnings,
  };
}
