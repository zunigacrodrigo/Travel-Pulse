/**
 * Reality Check (sección 4, pantalla 4): el destino elegido frente a una
 * alternativa similar, con filas comparables y hechos numéricos. Nunca agrega
 * datos que no estén en el dataset o en el resultado del motor.
 */
import {
  CONFIDENCE_LIMITED,
  type Dataset,
  type Destination,
  type FactorKey,
  type RealityCheckResult,
  type RealityRow,
  type ScoreResult,
  type TripRequest,
} from "@/lib/types";
import { findDestination } from "./data";
import { capitalize, joinEs, meters, usd } from "./format";
import { isExclusion, scoreDestination } from "./score";

type Direction = "lower" | "higher";

interface Metric {
  label: string;
  direction: Direction;
  value: (r: ScoreResult, d: Destination) => number | null;
  display: (v: number) => string;
  /** Ventaja de la alternativa: [verbo, complemento]. */
  advantage: (diff: number) => [string, string];
  /** Sustantivo para "X gana en …". */
  noun: string;
}

const NO_DATA = "Sin dato";

function factorValue(r: ScoreResult, key: FactorKey): number | null {
  return r.factors.find((f) => f.key === key)?.value ?? null;
}

/** Filas del Reality Check, en orden de presentación. */
export const REALITY_METRICS: readonly Metric[] = [
  {
    label: "Costo total",
    direction: "lower",
    value: (r) => r.cost.totalUsd,
    display: usd,
    advantage: (diff) => ["cuesta", `${usd(diff)} menos`],
    noun: "precio",
  },
  {
    label: "Altitud",
    direction: "lower",
    value: (_r, d) => d.altitudeM,
    display: meters,
    advantage: () => ["tiene", "menos altitud"],
    noun: "altitud",
  },
  {
    label: "Saturación",
    direction: "higher",
    value: (r) => factorValue(r, "saturacion"),
    display: String,
    advantage: () => ["tiene", "menos gente"],
    noun: "tranquilidad",
  },
  {
    label: "Experiencia",
    direction: "higher",
    value: (r) => factorValue(r, "experiencia"),
    display: String,
    advantage: () => ["tiene", "mejor ajuste de experiencia"],
    noun: "experiencia",
  },
  {
    label: "Clima",
    direction: "higher",
    value: (r) => factorValue(r, "clima"),
    display: String,
    advantage: () => ["tiene", "mejor clima"],
    noun: "clima",
  },
];

function better(a: number | null, b: number | null, direction: Direction): RealityRow["better"] {
  if (a === null || b === null || a === b) return "tie";
  const aWins = direction === "lower" ? a < b : a > b;
  return aWins ? "chosen" : "alternative";
}

/** Frase de ventajas agrupando verbos: "cuesta US$140 menos y tiene menos altitud y menos gente". */
function advantagesPhrase(pairs: ReadonlyArray<[string, string]>): string {
  const groups = new Map<string, string[]>();
  for (const [verb, rest] of pairs) groups.set(verb, [...(groups.get(verb) ?? []), rest]);
  return joinEs([...groups.entries()].map(([verb, items]) => `${verb} ${joinEs(items)}`));
}

/**
 * Elige la alternativa: primer id de `destination.similar` que exista, no esté
 * excluido y tenga confianza ≥ 40.
 */
export function pickAlternative(
  req: TripRequest,
  chosen: Destination,
  dataset: Dataset,
  now: Date,
): { destination: Destination; result: ScoreResult } | null {
  for (const id of chosen.similar) {
    if (id === chosen.id) continue;
    const destination = findDestination(dataset, id);
    if (!destination) continue;
    const result = scoreDestination(req, destination, dataset, now);
    if (!isExclusion(result) && result.confidence >= CONFIDENCE_LIMITED) return { destination, result };
  }
  return null;
}

/**
 * Reality Check del destino elegido (sección 4). Devuelve null si el destino no
 * existe, está excluido por filtros duros o no hay alternativa válida.
 */
export function realityCheck(req: TripRequest, chosenId: string, dataset: Dataset, now: Date): RealityCheckResult | null {
  const chosenDest = findDestination(dataset, chosenId);
  if (!chosenDest) return null;
  const chosen = scoreDestination(req, chosenDest, dataset, now);
  if (isExclusion(chosen)) return null;
  const alt = pickAlternative(req, chosenDest, dataset, now);
  if (!alt) return null;

  const rows: RealityRow[] = [];
  const facts: string[] = [];
  const altAdvantages: Array<[string, string]> = [];
  const chosenWins: string[] = [];
  for (const m of REALITY_METRICS) {
    const a = m.value(chosen, chosenDest);
    const b = m.value(alt.result, alt.destination);
    const winner = better(a, b, m.direction);
    rows.push({
      label: m.label,
      chosen: a === null ? NO_DATA : m.display(a),
      alternative: b === null ? NO_DATA : m.display(b),
      better: winner,
    });
    if (a !== null && b !== null) {
      const diff = Math.abs(a - b);
      facts.push(`${m.label}: ${chosenDest.name} ${m.display(a)}, ${alt.destination.name} ${m.display(b)} (diferencia ${m.display(diff)}).`);
      if (winner === "alternative") altAdvantages.push(m.advantage(diff));
      if (winner === "chosen") chosenWins.push(m.noun);
    }
  }

  const sentences: string[] = [];
  if (altAdvantages.length > 0) sentences.push(`${alt.destination.name} ${advantagesPhrase(altAdvantages)}.`);
  if (chosenWins.length > 0) sentences.push(`${chosenDest.name} gana en ${joinEs(chosenWins)}.`);
  if (sentences.length === 0) {
    sentences.push(`${chosenDest.name} y ${alt.destination.name} quedan parejos en los datos disponibles.`);
  }
  return {
    chosen,
    alternative: alt.result,
    rows,
    facts,
    conclusion: capitalize(sentences.join(" ")),
  };
}
