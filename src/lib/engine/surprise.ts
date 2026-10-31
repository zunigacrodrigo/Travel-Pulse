/**
 * Send Me Somewhere (sección 4, pantalla 6): un destino que el usuario no
 * consideró, elegido de forma determinista con una semilla.
 */
import { CONFIDENCE_LIMITED, type Dataset, type ScoreResult, type TripRequest } from "@/lib/types";
import { findDestination } from "./data";
import { FLEXIBLE_DATES_FLIGHT_FACTOR } from "./factors";
import { pct, usd } from "./format";
import { rankDestinations } from "./rank";

/** Se excluyen los primeros N del ranking (el usuario ya los vio). */
/** El usuario ya vio el Top 5: la sorpresa nunca repite uno de ellos. */
export const SURPRISE_SKIP_TOP = 5;
/** Score mínimo para sorprender. */
export const SURPRISE_MIN_SCORE = 60;
/** Tamaño del grupo de mejores candidatos entre los que se sortea. */
export const SURPRISE_POOL_SIZE = 5;
/** Peso de sorteo: 1 + etiqueta "desconocido" (0..5), para preferir destinos poco masivos. */
export const SURPRISE_BASE_WEIGHT = 1;
/** Advertencia cuando el vuelo pesa al menos 45% del gasto total. */
export const FLIGHT_SHARE_WARNING = 0.45;

/**
 * Número pseudoaleatorio determinista en [0, 1) para una semilla: mezcla la
 * semilla (hash multiplicativo) y aplica un paso de mulberry32, para que semillas
 * consecutivas no den valores correlacionados.
 */
export function seededRandom(seed: number): number {
  const mixed = Math.imul((Math.trunc(seed) | 0) ^ 0x9e3779b9, 0x85ebca6b);
  let t = (mixed ^ (mixed >>> 13)) + 0x6d2b79f5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * Advertencia tipo Reality Check sobre el peso del vuelo en el gasto. Si no hay
 * fechas flexibles, agrega el ahorro estimado con ellas (vuelo −15%).
 */
export function flightWarning(result: ScoreResult, flexibleDates: boolean): string | null {
  const { flightUsd, totalUsd } = result.cost;
  if (flightUsd === null || totalUsd === null || totalUsd <= 0) return null;
  const share = flightUsd / totalUsd;
  if (share < FLIGHT_SHARE_WARNING) return null;
  const base = `Ojo con el vuelo: es el ${pct(Math.round(share * 100))} del gasto.`;
  if (flexibleDates) return base;
  const saving = Math.round(flightUsd * (1 - FLEXIBLE_DATES_FLIGHT_FACTOR));
  return `${base} Con fechas flexibles podrías ahorrar cerca de ${usd(saving)}.`;
}

/** Elige un elemento con probabilidad proporcional a su peso, usando `r` en [0, 1). */
export function weightedPick<T>(items: readonly T[], weight: (item: T) => number, r: number): T {
  const weights = items.map((i) => Math.max(0, weight(i)));
  const total = weights.reduce((s, w) => s + w, 0);
  if (total <= 0) return items[Math.min(items.length - 1, Math.floor(r * items.length))];
  let acc = 0;
  for (let i = 0; i < items.length; i++) {
    acc += weights[i];
    if (r * total < acc) return items[i];
  }
  return items[items.length - 1];
}

/**
 * Elige un destino fuera del Top 3 y de `exclude`, con confianza ≥ 40 y score ≥ 60.
 * Ordena por etiqueta "desconocido" (luego score), toma los 5 mejores y sortea
 * con la semilla, con peso 1 + "desconocido". Devuelve null si no hay candidatos.
 */
export function surprise(
  req: TripRequest,
  dataset: Dataset,
  now: Date,
  exclude: readonly string[],
  seed: number,
): { result: ScoreResult; warning: string | null } | null {
  const ranking = rankDestinations(req, dataset, now);
  const skip = new Set([...ranking.top.slice(0, SURPRISE_SKIP_TOP).map((r) => r.destinationId), ...exclude]);
  const unknownTag = (id: string): number => findDestination(dataset, id)?.tags.desconocido ?? 0;
  const pool = [...ranking.top, ...ranking.others]
    .filter((r) => !skip.has(r.destinationId))
    .filter((r) => r.confidence >= CONFIDENCE_LIMITED && r.score !== null && r.score >= SURPRISE_MIN_SCORE)
    .sort(
      (a, b) =>
        unknownTag(b.destinationId) - unknownTag(a.destinationId) ||
        b.rawScore - a.rawScore ||
        a.destinationId.localeCompare(b.destinationId),
    )
    .slice(0, SURPRISE_POOL_SIZE);
  if (pool.length === 0) return null;
  const result = weightedPick(pool, (r) => SURPRISE_BASE_WEIGHT + unknownTag(r.destinationId), seededRandom(seed));
  return { result, warning: flightWarning(result, req.flexibleDates) };
}
