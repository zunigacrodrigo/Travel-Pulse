/** Calidad del aire e índice UV por hora (Open-Meteo Air Quality, modelo de pronóstico). */
import { fetchJson, type FetchOptions } from "@/lib/sources/http";
import type { ContextItem } from "./types";

export interface AirHour { hour: number; aqi: number | null; pm25: number | null; uv: number | null }

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function parseAir(raw: unknown, isoDate: string): AirHour[] {
  if (!isRecord(raw) || !isRecord(raw.hourly) || !Array.isArray(raw.hourly.time)) return [];
  const h = raw.hourly;
  const col = (k: string) => (Array.isArray(h[k]) ? (h[k] as unknown[]) : []);
  const aqi = col("us_aqi"), pm = col("pm2_5"), uv = col("uv_index");
  const out: AirHour[] = [];
  (h.time as unknown[]).forEach((t, i) => {
    if (typeof t !== "string" || !t.startsWith(`${isoDate}T`)) return;
    const hour = Number(t.slice(11, 13));
    if (Number.isInteger(hour) && hour >= 0 && hour <= 23) out.push({ hour, aqi: num(aqi[i]), pm25: num(pm[i]), uv: num(uv[i]) });
  });
  return out.sort((a, b) => a.hour - b.hour);
}

const SOURCE = { name: "Open-Meteo Air Quality (modelo CAMS)", url: "https://open-meteo.com/en/docs/air-quality-api" };

/** Escala del índice de calidad del aire de EE. UU. (EPA), la que publica esta fuente. */
export function aqiLabel(aqi: number): string {
  if (aqi <= 50) return "bueno";
  if (aqi <= 100) return "moderado";
  if (aqi <= 150) return "dañino para personas sensibles";
  if (aqi <= 200) return "dañino";
  return "muy dañino";
}

/** Escala de la OMS para el índice UV. */
export function uvLabel(uv: number): string {
  if (uv < 3) return "baja";
  if (uv < 6) return "moderada";
  if (uv < 8) return "alta";
  if (uv < 11) return "muy alta";
  return "extrema";
}

/** Mira el tramo en que se anda por la calle (por defecto 8:00–20:00); fuera de él no importa para el viajero. */
export function airContext(hours: readonly AirHour[], fromHour = 8, toHour = 20): ContextItem[] {
  const day = hours.filter((h) => h.hour >= fromHour && h.hour < toHour);
  const out: ContextItem[] = [];
  const aqis = day.map((h) => h.aqi).filter((x): x is number => x !== null);
  if (aqis.length) {
    const max = Math.max(...aqis);
    out.push({
      id: "aire", kind: "aire", severity: max > 100 ? "aviso" : "info", source: SOURCE, certainty: "pronostico",
      title: `Aire ${aqiLabel(max)} (índice máximo ${Math.round(max)})`,
      detail: max > 100
        ? "El aire puede afectar a personas sensibles (asma, niños, mayores). Considera dejar lo más exigente al aire libre para otro rato o llevar mascarilla. Es un pronóstico de modelo, no una medición en la calle."
        : "Sin problemas esperados para caminar al aire libre. Es un pronóstico de modelo, no una medición en la calle.",
    });
  }
  const uvs = day.map((h) => h.uv).filter((x): x is number => x !== null);
  if (uvs.length) {
    const max = Math.max(...uvs);
    const peak = day.find((h) => h.uv === max)!.hour;
    out.push({
      id: "uv", kind: "uv", severity: max >= 8 ? "aviso" : "info", source: SOURCE, certainty: "pronostico",
      title: `Radiación UV ${uvLabel(max)} (máx. ${max.toFixed(1)} hacia las ${String(peak).padStart(2, "0")}:00)`,
      detail: max >= 6 ? "Protector solar y sombra en las horas centrales; deja las paradas bajo techo para ese rato." : "Sin precauciones especiales más allá de lo habitual.",
    });
  }
  return out;
}

/** El modelo solo publica unos días hacia adelante; más allá devolvemos `null` en vez de inventar. */
export const AIR_MAX_DAYS_AHEAD = 4;

export async function fetchAir(lat: number, lon: number, isoDate: string, timezone: string, now: Date, opts: FetchOptions & { base?: string } = {}): Promise<AirHour[] | null> {
  const ahead = (Date.parse(`${isoDate}T12:00:00Z`) - now.getTime()) / 86_400_000;
  if (!Number.isFinite(ahead) || ahead > AIR_MAX_DAYS_AHEAD || ahead < -1) return null;
  const { base = "https://air-quality-api.open-meteo.com", ...rest } = opts;
  const q = new URLSearchParams({ latitude: String(lat), longitude: String(lon), hourly: "us_aqi,pm2_5,uv_index", timezone, start_date: isoDate, end_date: isoDate });
  return parseAir(await fetchJson(`${base}/v1/air-quality?${q}`, { timeoutMs: 8000, ...rest }), isoDate);
}
