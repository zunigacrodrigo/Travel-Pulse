/**
 * Pronóstico por hora (Open-Meteo). Solo datos reales: si la fecha está fuera del alcance del
 * pronóstico (16 días) o la fuente falla, el resultado es vacío y la pantalla lo dice.
 */
import { fetchJson, type FetchOptions } from "@/lib/sources/http";

export interface HourWeather {
  /** Hora local 0-23. */
  hour: number;
  rainProb: number | null;
  tempC: number | null;
  precipMm: number | null;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Horas de un día concreto («AAAA-MM-DD», hora local de la ciudad). */
export function parseHourly(raw: unknown, isoDate: string): HourWeather[] {
  if (!isRecord(raw) || !isRecord(raw.hourly) || !Array.isArray(raw.hourly.time)) return [];
  const h = raw.hourly;
  const prob = Array.isArray(h.precipitation_probability) ? h.precipitation_probability : [];
  const temp = Array.isArray(h.temperature_2m) ? h.temperature_2m : [];
  const mm = Array.isArray(h.precipitation) ? h.precipitation : [];
  const out: HourWeather[] = [];
  (h.time as unknown[]).forEach((t, i) => {
    if (typeof t !== "string" || !t.startsWith(`${isoDate}T`)) return;
    const hour = Number(t.slice(11, 13));
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) return;
    out.push({ hour, rainProb: num(prob[i]), tempC: num(temp[i]), precipMm: num(mm[i]) });
  });
  return out.sort((a, b) => a.hour - b.hour);
}

export const RAIN_THRESHOLD = 50;

/** ¿Hay riesgo de lluvia (≥ umbral) en alguna hora que toque el tramo [fromMin, toMin)? */
export function rainRiskBetween(hours: readonly HourWeather[], fromMin: number, toMin: number, threshold = RAIN_THRESHOLD): boolean {
  return hours.some((w) => w.rainProb !== null && w.rainProb >= threshold && w.hour * 60 < toMin && (w.hour + 1) * 60 > fromMin);
}

export interface RainWindow { fromHour: number; toHour: number; maxProb: number }

/** Tramos continuos de horas con riesgo de lluvia. `toHour` es exclusivo. */
export function rainWindows(hours: readonly HourWeather[], threshold = RAIN_THRESHOLD): RainWindow[] {
  const out: RainWindow[] = [];
  let cur: RainWindow | null = null;
  for (const w of hours) {
    const wet = w.rainProb !== null && w.rainProb >= threshold;
    if (wet && cur && cur.toHour === w.hour) { cur.toHour = w.hour + 1; cur.maxProb = Math.max(cur.maxProb, w.rainProb!); }
    else if (wet) { cur = { fromHour: w.hour, toHour: w.hour + 1, maxProb: w.rainProb! }; out.push(cur); }
    else cur = null;
  }
  return out;
}

const MAX_DAYS_AHEAD = 15;

/** Pronóstico del día o `null` si está fuera de alcance. Lanza si la fuente falla. */
export async function fetchDayWeather(
  lat: number,
  lon: number,
  isoDate: string,
  timezone: string,
  now: Date,
  opts: FetchOptions & { base?: string } = {},
): Promise<HourWeather[] | null> {
  const ahead = (Date.parse(`${isoDate}T12:00:00Z`) - now.getTime()) / 86_400_000;
  if (!Number.isFinite(ahead) || ahead > MAX_DAYS_AHEAD || ahead < -1) return null;
  const { base = "https://api.open-meteo.com", ...rest } = opts;
  const url = `${base}/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=precipitation_probability,temperature_2m,precipitation&timezone=${encodeURIComponent(timezone)}&forecast_days=16`;
  const raw = await fetchJson(url, { timeoutMs: 10_000, ...rest });
  const hours = parseHourly(raw, isoDate);
  return hours.length ? hours : null;
}
