/**
 * Travel What-If (Módulo 13 del prompt maestro): compara el plan original de un
 * destino con un escenario donde el viajero cambia días, presupuesto, mes,
 * viajeros o flexibilidad de fechas.
 *
 * Es puro y determinista. No inventa datos: si el costo de un lado es
 * desconocido, la diferencia es `null` y el veredicto lo dice. Todos los números
 * salen del mismo motor que puntúa los destinos (`evaluateDestination`).
 */
import {
  FACTOR_KEYS,
  FACTOR_LABELS,
  type Dataset,
  type FactorKey,
  type ScoreResult,
  type TripRequest,
} from "@/lib/types";
import { findDestination } from "./data";
import { num, usd } from "./format";
import { evaluateDestination, OVER_BUDGET_DEN, OVER_BUDGET_NUM } from "./score";

/** Cambios que el viajero puede simular. Los campos ausentes no cambian. */
export interface WhatIfChange {
  days?: number;
  budgetUsd?: number;
  month?: number;
  travelers?: number;
  flexibleDates?: boolean;
}

export interface WhatIfNumberDelta {
  baseline: number | null;
  scenario: number | null;
  /** scenario - baseline; null si falta alguno de los dos. */
  diff: number | null;
}

export interface WhatIfFactorDelta extends WhatIfNumberDelta {
  key: FactorKey;
  label: string;
}

export interface WhatIfResult {
  destinationId: string;
  baselineRequest: TripRequest;
  scenarioRequest: TripRequest;
  /** Frases legibles de lo que cambió, p. ej. "+2 días (8 → 10)". */
  changes: string[];
  baseline: ScoreResult;
  scenario: ScoreResult;
  totalUsd: WhatIfNumberDelta;
  flightUsd: WhatIfNumberDelta;
  stayUsd: WhatIfNumberDelta;
  /** Sobre rawScore (calculado aunque la confianza sea baja). */
  score: WhatIfNumberDelta;
  confidence: WhatIfNumberDelta;
  factors: WhatIfFactorDelta[];
  /** El escenario supera el 110 % del presupuesto (mismo filtro duro del ranking). */
  scenarioOverBudget: boolean;
  /** Alguno de los dos lados tiene confianza baja: la comparación es indicativa. */
  lowConfidence: boolean;
  verdict: string;
}

const MONTH_NAMES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function delta(baseline: number | null, scenario: number | null): WhatIfNumberDelta {
  return { baseline, scenario, diff: baseline === null || scenario === null ? null : scenario - baseline };
}

/** Aplica el cambio a la petición, ignorando valores iguales a los actuales. */
export function applyChange(req: TripRequest, change: WhatIfChange): TripRequest {
  return {
    ...req,
    interests: [...req.interests],
    days: change.days ?? req.days,
    budgetUsd: change.budgetUsd ?? req.budgetUsd,
    month: change.month ?? req.month,
    travelers: change.travelers ?? req.travelers,
    flexibleDates: change.flexibleDates ?? req.flexibleDates,
  };
}

/** Frases de lo que cambió (vacío si el escenario es idéntico al plan). */
export function describeChanges(from: TripRequest, to: TripRequest): string[] {
  const out: string[] = [];
  if (from.days !== to.days) {
    const d = to.days - from.days;
    out.push(`${d > 0 ? "+" : "−"}${Math.abs(d)} ${Math.abs(d) === 1 ? "día" : "días"} (${from.days} → ${to.days})`);
  }
  if (from.budgetUsd !== to.budgetUsd) out.push(`presupuesto ${usd(from.budgetUsd)} → ${usd(to.budgetUsd)}`);
  if (from.month !== to.month) out.push(`mes ${MONTH_NAMES[from.month - 1]} → ${MONTH_NAMES[to.month - 1]}`);
  if (from.travelers !== to.travelers) out.push(`viajeros ${from.travelers} → ${to.travelers}`);
  if (from.flexibleDates !== to.flexibleDates) {
    out.push(`fechas flexibles ${from.flexibleDates ? "sí" : "no"} → ${to.flexibleDates ? "sí" : "no"}`);
  }
  return out;
}

function money(d: WhatIfNumberDelta): string {
  if (d.baseline === null || d.scenario === null) {
    return `el costo ${d.scenario === null ? "del escenario" : "del plan original"} no tiene datos suficientes`;
  }
  if (d.diff === 0) return `el costo estimado no cambia (${usd(d.baseline)})`;
  const dir = (d.diff as number) > 0 ? "sube" : "baja";
  return `el costo estimado ${dir} ${usd(Math.abs(d.diff as number))} (de ${usd(d.baseline)} a ${usd(d.scenario)})`;
}

function scoreLine(d: WhatIfNumberDelta): string {
  if (d.baseline === null || d.scenario === null || d.diff === null) return "el score no se puede comparar";
  if (d.diff === 0) return `el score se mantiene en ${num(d.scenario)}`;
  const sign = d.diff > 0 ? "+" : "−";
  return `el score pasa de ${num(d.baseline)} a ${num(d.scenario)} (${sign}${num(Math.abs(d.diff))})`;
}

/**
 * Simula `change` sobre `req` para un destino.
 *
 * @param scenarioDataset Dataset del mes del escenario. Si el mes cambia, quien
 *   llama debe cargarlo (los datos mensuales dependen del mes); si no se pasa se
 *   usa `dataset`, lo que solo es correcto cuando el mes no cambia.
 * @throws Error si el destino no existe o el escenario no cambia nada.
 */
export function whatIf(
  req: TripRequest,
  destinationId: string,
  change: WhatIfChange,
  dataset: Dataset,
  now: Date,
  scenarioDataset: Dataset = dataset,
): WhatIfResult {
  const destination = findDestination(dataset, destinationId);
  const scenarioDestination = findDestination(scenarioDataset, destinationId);
  if (!destination || !scenarioDestination) throw new Error(`Destino desconocido: ${destinationId}`);

  const scenarioRequest = applyChange(req, change);
  const changes = describeChanges(req, scenarioRequest);
  if (changes.length === 0) throw new Error("El escenario no cambia nada respecto al plan original.");

  const baseline = evaluateDestination(req, destination, dataset, now);
  const scenario = evaluateDestination(scenarioRequest, scenarioDestination, scenarioDataset, now);

  const factors: WhatIfFactorDelta[] = FACTOR_KEYS.map((key) => {
    const b = baseline.factors.find((f) => f.key === key)?.value ?? null;
    const s = scenario.factors.find((f) => f.key === key)?.value ?? null;
    return { key, label: FACTOR_LABELS[key], ...delta(b, s) };
  });

  const totalUsd = delta(baseline.cost.totalUsd, scenario.cost.totalUsd);
  const scoreDelta = delta(baseline.rawScore, scenario.rawScore);
  const scenarioOverBudget =
    scenario.cost.totalUsd !== null &&
    scenario.cost.totalUsd * OVER_BUDGET_DEN > scenarioRequest.budgetUsd * OVER_BUDGET_NUM;
  const lowConfidence = baseline.confidenceBand === "limited" || scenario.confidenceBand === "limited";

  const parts = [`${changes.join(" y ")}: ${money(totalUsd)}; ${scoreLine(scoreDelta)}`];
  if (scenarioOverBudget) {
    parts.push(`el escenario supera el 110 % del presupuesto de ${usd(scenarioRequest.budgetUsd)}`);
  }
  if (lowConfidence) parts.push("la confianza de los datos es baja, así que la comparación es solo indicativa");
  const verdict = `${parts.join(". ")}.`.replace(/^./, (c) => c.toLocaleUpperCase("es"));

  return {
    destinationId,
    baselineRequest: req,
    scenarioRequest,
    changes,
    baseline,
    scenario,
    totalUsd,
    flightUsd: delta(baseline.cost.flightUsd, scenario.cost.flightUsd),
    stayUsd: delta(baseline.cost.stayUsd, scenario.cost.stayUsd),
    score: scoreDelta,
    confidence: delta(baseline.confidence, scenario.confidence),
    factors,
    scenarioOverBudget,
    lowConfidence,
    verdict,
  };
}
