/**
 * Tiempos de traslado reales entre lugares (OSRM de FOSSGIS, datos de OpenStreetMap).
 * IMPORTANTE: el servidor de demostración de project-osrm.org ignora el modo y siempre devuelve
 * tiempos EN AUTO (verificado: 9,6 min para 2,6 km «a pie»). Por eso se usa el servidor de FOSSGIS,
 * que tiene perfil peatonal y de auto separados. Los tiempos en auto NO incluyen tráfico.
 */
import { fetchJson, type FetchOptions } from "@/lib/sources/http";

export type Mode = "foot" | "car";
export interface Point { lat: number; lon: number }

const HOST = "https://routing.openstreetmap.de";
const PATH: Record<Mode, string> = { foot: "routed-foot/table/v1/foot", car: "routed-car/table/v1/driving" };

/** Matriz de minutos (redondeada hacia arriba) o null si la respuesta no es válida o hay pares sin ruta. */
export function parseMatrix(raw: unknown, n: number): number[][] | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as { code?: unknown; durations?: unknown };
  if (r.code !== "Ok" || !Array.isArray(r.durations) || r.durations.length !== n) return null;
  const out: number[][] = [];
  for (const row of r.durations) {
    if (!Array.isArray(row) || row.length !== n) return null;
    if (row.some((v) => typeof v !== "number" || !Number.isFinite(v) || v < 0)) return null;
    out.push(row.map((s: number) => Math.ceil(s / 60)));
  }
  return out;
}

export async function fetchMatrix(points: readonly Point[], mode: Mode, opts: FetchOptions & { base?: string } = {}): Promise<number[][] | null> {
  if (points.length < 2) return points.length === 1 ? [[0]] : null;
  const { base = HOST, ...rest } = opts;
  const coords = points.map((p) => `${p.lon.toFixed(5)},${p.lat.toFixed(5)}`).join(";");
  const raw = await fetchJson(`${base}/${PATH[mode]}/${coords}?annotations=duration`, { timeoutMs: 12_000, ...rest });
  return parseMatrix(raw, points.length);
}

/** Máximo de minutos a pie que se considera razonable antes de pasar a auto. */
export const MAX_WALK_MIN = 20;

/** Tiempo de un tramo según las dos matrices: a pie si es corto, si no en auto (sin tráfico). */
export function leg(foot: number[][] | null, car: number[][] | null, i: number, j: number): { minutes: number; mode: Mode } | null {
  const f = foot?.[i]?.[j];
  const c = car?.[i]?.[j];
  if (f !== undefined && f <= MAX_WALK_MIN) return { minutes: f, mode: "foot" };
  if (c !== undefined) return { minutes: c, mode: "car" };
  if (f !== undefined) return { minutes: f, mode: "foot" };
  return null;
}
