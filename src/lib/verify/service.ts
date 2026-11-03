/** «Verificar mi itinerario»: pega un itinerario, lo ubica en el mapa real y lo contrasta con horarios, traslados y clima. */
import { z } from "zod";
import { parseItinerary } from "@/lib/trip-twin/import";
import { CITIES } from "@/lib/day/cities";
import { fetchMatrix } from "@/lib/day/routing";
import { leg } from "@/lib/day/routing";
import { fetchDayConditions } from "@/lib/day/weather";
import { describeError } from "@/lib/sources/http";
import { resolvePlace } from "./resolve";
import { verifyItinerary, type StopInput, type Verdict } from "./checks";

export const verifyInputSchema = z.object({
  city: z.string().refine((c) => c in CITIES, "Ciudad no disponible en el piloto."),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Hora a la que el viajero puede empezar (minutos). */
  dayStart: z.number().int().min(0).max(1439).default(750),
  text: z.string().min(3).max(6000),
}).strict();
export type VerifyRequest = z.infer<typeof verifyInputSchema>;

export interface VerifyResponse {
  generatedAt: string;
  city: string;
  date: string;
  verdict: Verdict;
  places: { name: string; lat: number; lon: number }[];
  sources: { name: string; status: "ok" | "error" | "fuera_de_alcance"; detail?: string }[];
  warnings: string[];
}

const MAX_STOPS = 10;

export async function computeVerification(input: VerifyRequest, deps: { fetchImpl?: typeof fetch; now?: Date; spacingMs?: number } = {}): Promise<VerifyResponse> {
  const city = CITIES[input.city]!;
  const now = deps.now ?? new Date();
  const http = { fetchImpl: deps.fetchImpl };
  const sources: VerifyResponse["sources"] = [];
  const parsed = parseItinerary(input.text);
  const warnings = [...parsed.warnings];
  const items = parsed.days.flatMap((d) => d.items).slice(0, MAX_STOPS);
  if (parsed.days.flatMap((d) => d.items).length > MAX_STOPS) warnings.push(`Verifiqué las primeras ${MAX_STOPS} paradas.`);

  const stops: StopInput[] = [];
  let resolveFailed = false;
  for (const it of items) {
    let found = null;
    try {
      found = await resolvePlace(it.name, { name: city.name, center: city.center }, { ...http, spacingMs: deps.spacingMs });
    } catch (e) { resolveFailed = true; warnings.push(`No pude consultar el mapa para «${it.name}»: ${describeError(e)}`); }
    stops.push({
      name: it.name,
      plannedStart: it.startTime ? +it.startTime.slice(0, 2) * 60 + +it.startTime.slice(3, 5) : null,
      durationMin: it.durationMinutes ?? 60,
      found: found && { matchedName: found.matchedName, lat: found.lat, lon: found.lon, category: found.category, type: found.type, hoursRaw: found.hoursRaw, hours: found.hours, confidence: found.confidence },
    });
  }
  sources.push({ name: "OpenStreetMap (Nominatim)", status: resolveFailed ? "error" : "ok" });

  const located = stops.map((s, i) => ({ s, i })).filter((x) => x.s.found);
  const legs: (ReturnType<typeof leg>)[] = new Array(Math.max(stops.length - 1, 0)).fill(null);
  if (located.length >= 2) {
    try {
      const pts = located.map((x) => ({ lat: x.s.found!.lat, lon: x.s.found!.lon }));
      const [foot, car] = await Promise.all([fetchMatrix(pts, "foot", http), fetchMatrix(pts, "car", http)]);
      for (let k = 0; k < located.length - 1; k++) {
        if (located[k + 1]!.i === located[k]!.i + 1) legs[located[k]!.i] = leg(foot, car, k, k + 1);
      }
      sources.push({ name: "OSRM (traslados)", status: foot || car ? "ok" : "error" });
    } catch (e) { sources.push({ name: "OSRM (traslados)", status: "error", detail: describeError(e) }); warnings.push("No pude calcular traslados reales."); }
  }

  let hours = null, sunsetMin: number | null = null;
  try {
    const c = await fetchDayConditions(city.center.lat, city.center.lon, input.date, city.timezone, now, http);
    if (c) { hours = c.hours; sunsetMin = c.sunsetMin; sources.push({ name: "Open-Meteo (clima)", status: "ok" }); }
    else sources.push({ name: "Open-Meteo (clima)", status: "fuera_de_alcance" });
  } catch (e) { sources.push({ name: "Open-Meteo (clima)", status: "error", detail: describeError(e) }); warnings.push("No pude obtener el pronóstico: no sé si lloverá."); }

  const verdict = verifyItinerary({ isoDate: input.date, dayStart: input.dayStart, stops, legs, hours, sunsetMin });
  return {
    generatedAt: now.toISOString(), city: city.name, date: input.date, verdict,
    places: stops.filter((s) => s.found).map((s) => ({ name: s.name, lat: s.found!.lat, lon: s.found!.lon })),
    sources, warnings,
  };
}
