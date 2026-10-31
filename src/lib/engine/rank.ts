/**
 * Ranking de destinos (sección 5, "Orden de resultados" y "Umbral de confianza")
 * y ayuda para resultados vacíos.
 */
import {
  ENGINE_VERSION,
  type Dataset,
  type EmptyHelp,
  type Exclusion,
  type RankingResult,
  type ScoreResult,
  type TripRequest,
} from "@/lib/types";
import { estimateCost } from "./factors";
import { usd } from "./format";
import { isExclusion, MAX_RISK_LEVEL, scoreDestination } from "./score";

/** Cantidad de resultados en el Top. */
export const TOP_SIZE = 5;
/** Sugerencia "subir presupuesto": costo del más barato + 15%, redondeado al siguiente múltiplo de 100. */
export const RAISE_BUDGET_MARGIN = 0.15;
export const BUDGET_ROUNDING_USD = 100;
/** Sugerencia "menos días": restar 3 días, con mínimo 3. */
export const FEWER_DAYS_STEP = 3;
export const MIN_DAYS = 3;

interface Collected {
  candidates: ScoreResult[];
  excluded: Exclusion[];
}

function collect(req: TripRequest, dataset: Dataset, now: Date): Collected {
  const candidates: ScoreResult[] = [];
  const excluded: Exclusion[] = [];
  for (const d of dataset.destinations) {
    const r = scoreDestination(req, d, dataset, now);
    if (isExclusion(r)) excluded.push(r);
    else candidates.push(r);
  }
  candidates.sort(compareResults);
  return { candidates, excluded };
}

/**
 * Orden de resultados (sección 5): por score (rawScore) descendente; empates por
 * menor costo total (costo desconocido al final) y luego por id para ser determinista.
 */
export function compareResults(a: ScoreResult, b: ScoreResult): number {
  if (b.rawScore !== a.rawScore) return b.rawScore - a.rawScore;
  const ca = a.cost.totalUsd ?? Number.POSITIVE_INFINITY;
  const cb = b.cost.totalUsd ?? Number.POSITIVE_INFINITY;
  if (ca !== cb) return ca - cb;
  return a.destinationId.localeCompare(b.destinationId);
}

/**
 * Top 5: los primeros 5 candidatos por score; los de confianza < 40 ("limited")
 * se mueven al final del Top porque se muestran sin ranking numérico (sección 4).
 */
export function splitTop(sorted: readonly ScoreResult[]): { top: ScoreResult[]; others: ScoreResult[] } {
  const first = sorted.slice(0, TOP_SIZE);
  const top = [...first.filter((r) => r.confidenceBand !== "limited"), ...first.filter((r) => r.confidenceBand === "limited")];
  return { top, others: sorted.slice(TOP_SIZE) };
}

/** Cantidad de resultados publicables (no excluidos y con score numérico, confianza ≥ 40). */
export function countResults(req: TripRequest, dataset: Dataset, now: Date): number {
  return collect(req, dataset, now).candidates.filter((r) => r.score !== null).length;
}

/** Destino más barato con costo conocido, excluyendo aviso máximo y sin vuelo desde el origen. */
export function cheapestDestination(
  req: TripRequest,
  dataset: Dataset,
  now: Date,
): { destinationId: string; name: string; totalUsd: number } | null {
  let best: { destinationId: string; name: string; totalUsd: number } | null = null;
  for (const destination of dataset.destinations) {
    if (destination.riskLevel.value === MAX_RISK_LEVEL || !destination.connectivity[req.origin]) continue;
    const total = estimateCost({ req, destination, dataset, now }).totalUsd;
    if (total === null) continue;
    if (!best || total < best.totalUsd || (total === best.totalUsd && destination.id < best.destinationId)) {
      best = { destinationId: destination.id, name: destination.name, totalUsd: total };
    }
  }
  return best;
}

/** Presupuesto sugerido: costo × 1,15 redondeado hacia arriba al siguiente múltiplo de US$100. */
export function suggestedBudget(totalUsd: number): number {
  return Math.ceil((totalUsd * (1 + RAISE_BUDGET_MARGIN)) / BUDGET_ROUNDING_USD) * BUDGET_ROUNDING_USD;
}

/**
 * Ayuda para resultados vacíos: destino más barato y sugerencias (subir
 * presupuesto, menos días, fechas flexibles). Cada sugerencia trae la consulta
 * modificada y su cantidad de resultados; se omiten las que no dan resultados.
 */
export function buildEmptyHelp(req: TripRequest, dataset: Dataset, now: Date): EmptyHelp {
  const cheapest = cheapestDestination(req, dataset, now);
  const options: EmptyHelp["suggestions"] = [];
  if (cheapest) {
    const budget = suggestedBudget(cheapest.totalUsd);
    if (budget > req.budgetUsd) {
      const request = { ...req, budgetUsd: budget };
      options.push({ kind: "raise_budget", label: `Subir a ${usd(budget)}`, request, resultCount: countResults(request, dataset, now) });
    }
  }
  const days = Math.max(MIN_DAYS, req.days - FEWER_DAYS_STEP);
  if (days < req.days) {
    const request = { ...req, days };
    options.push({ kind: "fewer_days", label: `Viajar ${days} días en vez de ${req.days}`, request, resultCount: countResults(request, dataset, now) });
  }
  if (!req.flexibleDates) {
    const request = { ...req, flexibleDates: true };
    options.push({ kind: "flexible_dates", label: "Activar fechas flexibles", request, resultCount: countResults(request, dataset, now) });
  }
  return { cheapest, suggestions: options.filter((s) => s.resultCount > 0) };
}

/**
 * Ranking completo de una consulta (sección 5): filtra, puntúa, ordena por score
 * con desempate por costo, arma Top 5 (limitados al final) y, si el Top no tiene
 * ningún resultado con score numérico (vacío o solo "Información limitada"),
 * agrega `emptyHelp`.
 */
export function rankDestinations(req: TripRequest, dataset: Dataset, now: Date): RankingResult {
  const { candidates, excluded } = collect(req, dataset, now);
  const { top, others } = splitTop(candidates);
  return {
    top,
    others,
    excluded,
    emptyHelp: top.every((r) => r.score === null) ? buildEmptyHelp(req, dataset, now) : null,
    computedAt: now.toISOString(),
    engineVersion: ENGINE_VERSION,
  };
}
