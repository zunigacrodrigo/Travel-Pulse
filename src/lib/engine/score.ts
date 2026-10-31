/**
 * Opportunity Score de un destino (sección 5): filtros duros, personalización,
 * reponderación por datos faltantes, confianza, Opportunity Index y razón.
 */
import {
  BASE_WEIGHTS,
  CONFIDENCE_LIMITED,
  CONFIDENCE_NORMAL,
  ENGINE_VERSION,
  FACTOR_KEYS,
  FACTOR_LABELS,
  type ConfidenceBand,
  type Dataset,
  type Destination,
  type Exclusion,
  type FactorKey,
  type FactorResult,
  type Interest,
  type ScoreResult,
  type TripRequest,
} from "@/lib/types";
import { findMonthly, findTrend } from "./data";
import { estimateCost, evaluateFactors, type CostEstimate, type FactorContext, type FactorEval } from "./factors";
import { capitalize, joinEs, lowerFirst, usd } from "./format";

/* ---------------------------- Constantes ---------------------------- */

/** Filtro duro: se excluye si el costo total supera 110% del presupuesto (11/10, en enteros para evitar errores de coma flotante). */
export const OVER_BUDGET_NUM = 11;
export const OVER_BUDGET_DEN = 10;
/** Nivel oficial de riesgo que excluye el destino. */
export const MAX_RISK_LEVEL = 4;
/** Personalización: puntos de peso que suma cada interés elegido a Experiencia. */
export const EXPERIENCE_WEIGHT_PER_INTEREST = 0.025;
/** Personalización: peso final máximo de Experiencia (sección 5: "hasta un máximo de 30%"). */
export const EXPERIENCE_WEIGHT_CAP = 0.3;
/** Opportunity Index: vuelo al menos 10% bajo su precio habitual. */
export const OPPORTUNITY_MIN_BELOW = 0.1;
/** Razón: largo máximo, cantidad de factores fuertes y umbrales. */
export const REASON_MAX_CHARS = 90;
const REASON_MAX_STRONG = 3;
const REASON_STRONG_MIN = 60;
const REASON_WEAK_MAX = 40;

/* ---------------------------- Pesos -------------------------------- */

/**
 * Pesos personalizados (sección 5, "Personalización"): Experiencia pasa de 20% a
 * 20% + 2,5 puntos por interés elegido, con tope 30%; el resto se escala
 * proporcionalmente para que todo sume 1.
 */
export function personalizedWeights(interests: readonly Interest[]): Record<FactorKey, number> {
  const n = new Set(interests).size;
  const exp = Math.min(EXPERIENCE_WEIGHT_CAP, BASE_WEIGHTS.experiencia + EXPERIENCE_WEIGHT_PER_INTEREST * n);
  const othersBase = 1 - BASE_WEIGHTS.experiencia;
  const scale = (1 - exp) / othersBase;
  const out = {} as Record<FactorKey, number>;
  for (const key of FACTOR_KEYS) out[key] = key === "experiencia" ? exp : BASE_WEIGHTS[key] * scale;
  return out;
}

/** Banda de confianza (sección 5, "Umbral de confianza"): <40 limited, 40..69 warning, ≥70 normal. */
export function confidenceBand(confidence: number): ConfidenceBand {
  if (confidence < CONFIDENCE_LIMITED) return "limited";
  if (confidence < CONFIDENCE_NORMAL) return "warning";
  return "normal";
}

/**
 * Score S = Σ w_i f_i / Σ w_i sobre los factores con dato (sección 5: si falta un
 * factor, los demás se reponderan). Devuelve 0 si no hay ninguno.
 */
export function weightedScore(values: Record<FactorKey, number | null>, weights: Record<FactorKey, number>): number {
  let num = 0;
  let den = 0;
  for (const key of FACTOR_KEYS) {
    const v = values[key];
    if (v === null) continue;
    num += weights[key] * v;
    den += weights[key];
  }
  return den === 0 ? 0 : num / den;
}

/** Confianza C = 100 × Σ w_i q_i sobre los 8 factores (faltante → q = 0), redondeada. */
export function confidenceScore(qualities: Record<FactorKey, number>, weights: Record<FactorKey, number>): number {
  const c = FACTOR_KEYS.reduce((s, key) => s + weights[key] * qualities[key], 0);
  return Math.round(Math.min(1, Math.max(0, c)) * 100);
}

/* ------------------------- Filtros duros ---------------------------- */

/**
 * Filtros duros (sección 5): aviso oficial máximo, sin vuelo desde el origen o
 * costo total sobre 110% del presupuesto. Un costo desconocido NO excluye.
 */
export function hardFilter(req: TripRequest, destination: Destination, cost: CostEstimate): Exclusion | null {
  if (destination.riskLevel.value === MAX_RISK_LEVEL) {
    return { destinationId: destination.id, reason: "max_risk", detail: "Aviso oficial máximo (nivel 4 de 4)." };
  }
  if (!destination.connectivity[req.origin]) {
    return { destinationId: destination.id, reason: "no_flight", detail: `Sin vuelos razonables desde ${req.origin}.` };
  }
  if (cost.totalUsd !== null && cost.totalUsd * OVER_BUDGET_DEN > req.budgetUsd * OVER_BUDGET_NUM) {
    return {
      destinationId: destination.id,
      reason: "over_budget",
      detail: `Costo estimado ${usd(cost.totalUsd)}, sobre el 110% del presupuesto de ${usd(req.budgetUsd)}.`,
    };
  }
  return null;
}

/* ------------------------- Textos derivados ------------------------- */

function missingLabels(evals: Record<FactorKey, FactorEval>): { missing: string[]; stale: string[] } {
  const missing: string[] = [];
  const stale: string[] = [];
  for (const key of FACTOR_KEYS) {
    const e = evals[key];
    if (e.value === null) missing.push(e.missingLabel ?? FACTOR_LABELS[key]);
    else if (e.stale) stale.push(FACTOR_LABELS[key]);
  }
  return { missing, stale };
}

const BAND_WORD: Record<ConfidenceBand, string> = { limited: "Baja", warning: "Media", normal: "Alta" };

/** Frase de confianza en español (sección 4: cada puntaje muestra su confianza con motivo). */
export function buildConfidenceReason(
  band: ConfidenceBand,
  missing: readonly string[],
  stale: readonly string[],
  maxAgeDays: number | null,
): string {
  const parts: string[] = [];
  if (missing.length > 0) {
    parts.push(`${missing.length === 1 ? "falta" : "faltan"} ${joinEs(missing.map(lowerFirst))}`);
  }
  if (stale.length > 0) parts.push(`datos antiguos en ${joinEs(stale.map(lowerFirst))}`);
  if (parts.length > 0) return `${BAND_WORD[band]}: ${parts.join("; ")}.`;
  if (band === "normal") {
    return maxAgeDays === null || maxAgeDays > 30
      ? `Alta porque los ${FACTOR_KEYS.length} factores tienen datos vigentes según la frecuencia de cada fuente.`
      : `Alta porque los ${FACTOR_KEYS.length} factores tienen datos de los últimos ${Math.max(1, Math.ceil(maxAgeDays))} días.`;
  }
  return `${BAND_WORD[band]} por la fiabilidad de las fuentes disponibles.`;
}

/** Orden por aporte al score (w_i × f_i), desempate por orden de FACTOR_KEYS. */
function byContribution(a: FactorEval, b: FactorEval, weights: Record<FactorKey, number>): number {
  const ca = weights[a.key] * (a.value ?? 0);
  const cb = weights[b.key] * (b.value ?? 0);
  return cb - ca || FACTOR_KEYS.indexOf(a.key) - FACTOR_KEYS.indexOf(b.key);
}

/** Orden por valor ascendente (el más débil primero), desempate por mayor peso. */
function byWeakness(a: FactorEval, b: FactorEval, weights: Record<FactorKey, number>): number {
  return (a.value ?? 0) - (b.value ?? 0) || weights[b.key] - weights[a.key] || FACTOR_KEYS.indexOf(a.key) - FACTOR_KEYS.indexOf(b.key);
}

function composeReason(strong: readonly string[], weak: string | null): string {
  const head = strong.length > 0 ? capitalize(joinEs(strong)) : "Sin factores destacados";
  return weak ? `${head}, pero ${weak}.` : `${head}.`;
}

/**
 * Razón en una línea (≤ 90 caracteres), determinista: hasta 3 factores con mayor
 * aporte al score (w_i × f_i) entre los que valen ≥ 60, y el más débil si vale < 40.
 * Solo usa frases fijas de cada factor; no agrega hechos.
 */
export function buildReason(evals: Record<FactorKey, FactorEval>, weights: Record<FactorKey, number>): string {
  const available = FACTOR_KEYS.map((k) => evals[k]).filter((e) => e.value !== null);
  const sorted = [...available].sort((a, b) => byContribution(a, b, weights));
  const strong = sorted.filter((e) => (e.value ?? 0) >= REASON_STRONG_MIN).slice(0, REASON_MAX_STRONG).map((e) => e.strongPhrase);
  const weakest = [...available].sort((a, b) => byWeakness(a, b, weights))[0];
  const weak = weakest && (weakest.value ?? 0) < REASON_WEAK_MAX ? weakest.weakPhrase : null;
  const candidates: Array<[string[], string | null]> = [];
  for (let n = strong.length; n >= Math.min(1, strong.length); n--) {
    candidates.push([strong.slice(0, n), weak], [strong.slice(0, n), null]);
  }
  for (const [s, w] of candidates) {
    const text = composeReason(s, w);
    if (text.length <= REASON_MAX_CHARS) return text;
  }
  return composeReason([], null);
}

/**
 * Opportunity Index (sección 5): vuelo ≥ 10% bajo su precio habitual y saturación
 * mejor (índice más alto = menos gente) que la del mes anterior.
 */
export function isOpportunity(cost: CostEstimate, saturation: number | null, prevMonthSaturation: number | undefined): boolean {
  if (cost.flightBelowPct === null || cost.flightBelowPct < OPPORTUNITY_MIN_BELOW) return false;
  if (saturation === null || prevMonthSaturation === undefined) return false;
  return saturation > prevMonthSaturation;
}

/* ----------------------------- Score -------------------------------- */

function toFactorResults(
  evals: Record<FactorKey, FactorEval>,
  weights: Record<FactorKey, number>,
): FactorResult[] {
  const availableWeight = FACTOR_KEYS.reduce((s, k) => s + (evals[k].value === null ? 0 : weights[k]), 0);
  return FACTOR_KEYS.map((key) => {
    const e = evals[key];
    return {
      key,
      label: FACTOR_LABELS[key],
      value: e.value,
      weight: e.value === null || availableWeight === 0 ? 0 : weights[key] / availableWeight,
      quality: e.quality,
      sourceName: e.sourceName,
      observedAt: e.observedAt,
      detail: e.detail,
    };
  });
}

/**
 * Calcula el ScoreResult de un destino SIN aplicar filtros duros (uso de
 * comparación y de vistas de detalle). Ver `scoreDestination` para el flujo normal.
 */
export function evaluateDestination(req: TripRequest, destination: Destination, dataset: Dataset, now: Date): ScoreResult {
  const ctx: FactorContext = { req, destination, dataset, now };
  const cost = estimateCost(ctx);
  return buildScoreResult(ctx, cost);
}

function buildScoreResult(ctx: FactorContext, cost: CostEstimate): ScoreResult {
  const evals = evaluateFactors(ctx, cost);
  const weights = personalizedWeights(ctx.req.interests);
  const values = {} as Record<FactorKey, number | null>;
  const qualities = {} as Record<FactorKey, number>;
  for (const key of FACTOR_KEYS) {
    values[key] = evals[key].value;
    qualities[key] = evals[key].quality;
  }
  const rawScore = Math.round(weightedScore(values, weights));
  const confidence = confidenceScore(qualities, weights);
  const band = confidenceBand(confidence);
  const { missing, stale } = missingLabels(evals);
  const ages = FACTOR_KEYS.map((k) => evals[k].ageDays).filter((a): a is number => a !== null);
  const monthly = findMonthly(ctx.dataset, ctx.destination.id, ctx.req.month);
  const trend = findTrend(ctx.dataset, ctx.destination.id);
  return {
    destinationId: ctx.destination.id,
    score: band === "limited" ? null : rawScore,
    rawScore,
    confidence,
    confidenceBand: band,
    confidenceReason: buildConfidenceReason(band, missing, stale, ages.length > 0 ? Math.max(...ages) : null),
    missing: [...missing, ...stale.map((s) => `${s} (dato antiguo)`)],
    factors: toFactorResults(evals, weights),
    cost: { flightUsd: cost.flightUsd, stayUsd: cost.stayUsd, totalUsd: cost.totalUsd },
    opportunity: !evals.precio.stale && !evals.saturacion.stale && isOpportunity(cost, monthly?.saturation.value ?? null, trend?.prevMonthSaturation),
    reason: buildReason(evals, weights),
    engineVersion: ENGINE_VERSION,
  };
}

/**
 * Score de un destino para una consulta (sección 5): aplica filtros duros y, si
 * pasa, calcula score, confianza, Opportunity Index y razón.
 */
export function scoreDestination(
  req: TripRequest,
  destination: Destination,
  dataset: Dataset,
  now: Date,
): ScoreResult | Exclusion {
  const ctx: FactorContext = { req, destination, dataset, now };
  const cost = estimateCost(ctx);
  const excluded = hardFilter(req, destination, cost);
  return excluded ?? buildScoreResult(ctx, cost);
}

/** Distingue una exclusión de un resultado. */
export function isExclusion(value: ScoreResult | Exclusion): value is Exclusion {
  return !("rawScore" in value);
}
