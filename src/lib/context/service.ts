import { CITIES } from "@/lib/day/cities";
import { describeError, type FetchOptions } from "@/lib/sources/http";
import { airContext, fetchAir, AIR_MAX_DAYS_AHEAD } from "./air";
import { fetchHolidays, holidayContext } from "./holidays";
import type { DayContext, SourceGap } from "./types";

/** Reúne el contexto del día en una ciudad. Cada fuente falla por separado y se informa; nada se inventa. */
export async function computeDayContext(cityKey: string, isoDate: string, deps: { now?: Date; fetchImpl?: FetchOptions["fetchImpl"] } = {}): Promise<DayContext | null> {
  const city = CITIES[cityKey];
  if (!city) return null;
  const now = deps.now ?? new Date();
  const opts: FetchOptions = deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {};
  const gaps: SourceGap[] = [];
  const items: DayContext["items"] = [];
  const year = Number(isoDate.slice(0, 4));
  const years = isoDate.endsWith("-12-31") ? [year, year + 1] : [year]; // la víspera de un 1 de enero es del año siguiente

  const [hol, air] = await Promise.allSettled([
    Promise.all(years.map((y) => fetchHolidays(city.countryCode, y, opts))).then((x) => x.flat()),
    fetchAir(city.center.lat, city.center.lon, isoDate, city.timezone, now, opts),
  ]);
  if (hol.status === "fulfilled") items.push(...holidayContext(hol.value, isoDate));
  else gaps.push({ source: "Feriados (Nager.Date)", reason: describeError(hol.reason) });
  if (air.status === "fulfilled") {
    if (air.value === null) gaps.push({ source: "Calidad del aire y UV (Open-Meteo)", reason: `Solo hay pronóstico hasta ${AIR_MAX_DAYS_AHEAD} días adelante.` });
    else if (air.value.length === 0) gaps.push({ source: "Calidad del aire y UV (Open-Meteo)", reason: "La fuente no devolvió datos para ese día." });
    else items.push(...airContext(air.value));
  } else gaps.push({ source: "Calidad del aire y UV (Open-Meteo)", reason: describeError(air.reason) });

  items.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "aviso" ? -1 : 1));
  return { cityKey, date: isoDate, items, gaps, fetchedAt: now.toISOString() };
}
