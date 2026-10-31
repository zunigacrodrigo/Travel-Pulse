/**
 * Comparación de dos destinos (sección 4, pantalla 5): tabla de los 8 factores
 * y veredicto según la prioridad del usuario.
 */
import {
  FACTOR_KEYS,
  FACTOR_LABELS,
  type ComparePriority,
  type CompareResult,
  type Dataset,
  type FactorKey,
  type ScoreResult,
  type TripRequest,
} from "@/lib/types";
import { findDestination } from "./data";
import { usd } from "./format";
import { evaluateDestination } from "./score";

/** Etiqueta de cada prioridad para el veredicto. */
export const PRIORITY_LABELS: Record<ComparePriority, string> = {
  precio: "precio",
  experiencia: "experiencia",
  menos_gente: "menos gente",
};

type Side = "a" | "b";
const NO_DATA = "sin dato";

function factorValue(r: ScoreResult, key: FactorKey): number | null {
  return r.factors.find((f) => f.key === key)?.value ?? null;
}

function higherWins(a: number | null, b: number | null): Side | "tie" {
  if (a === b) return "tie";
  if (a === null) return "b";
  if (b === null) return "a";
  return a > b ? "a" : "b";
}

function lowerWins(a: number | null, b: number | null): Side | "tie" {
  if (a === b) return "tie";
  if (a === null) return "b";
  if (b === null) return "a";
  return a < b ? "a" : "b";
}

function show(v: number | null): string {
  return v === null ? NO_DATA : String(v);
}

/** Desempate cuando la prioridad empata: mayor rawScore, luego menor costo, luego "a". */
function tieBreak(a: ScoreResult, b: ScoreResult): Side {
  const byScore = higherWins(a.rawScore, b.rawScore);
  if (byScore !== "tie") return byScore;
  const byCost = lowerWins(a.cost.totalUsd, b.cost.totalUsd);
  return byCost === "tie" ? "a" : byCost;
}

function priorityWinner(priority: ComparePriority, a: ScoreResult, b: ScoreResult): Side | "tie" {
  if (priority === "precio") return lowerWins(a.cost.totalUsd, b.cost.totalUsd);
  if (priority === "experiencia") return higherWins(factorValue(a, "experiencia"), factorValue(b, "experiencia"));
  return higherWins(factorValue(a, "saturacion"), factorValue(b, "saturacion"));
}

function verdictReason(priority: ComparePriority, w: ScoreResult, l: ScoreResult): string {
  if (priority === "precio") {
    const wc = w.cost.totalUsd;
    const lc = l.cost.totalUsd;
    const costPart = wc !== null && lc !== null ? `cuesta ${usd(lc - wc)} menos` : `su costo es ${wc === null ? NO_DATA : usd(wc)}`;
    return `${costPart} y su factor precio es ${show(factorValue(w, "precio"))} frente a ${show(factorValue(l, "precio"))}`;
  }
  if (priority === "experiencia") {
    return `su ajuste de experiencia es ${show(factorValue(w, "experiencia"))} frente a ${show(factorValue(l, "experiencia"))}`;
  }
  return `su índice de saturación es ${show(factorValue(w, "saturacion"))} frente a ${show(factorValue(l, "saturacion"))} (más alto = menos gente)`;
}

/**
 * Compara dos destinos (sección 4): filas para los 8 factores con ganador y
 * veredicto por prioridad — precio: menor costo total; experiencia: mayor factor
 * experiencia; menos_gente: mayor índice de saturación. Si empatan en la
 * prioridad, decide el score total. No aplica filtros duros (el usuario ya eligió
 * ambos destinos). Lanza Error si algún id no existe en el dataset.
 */
export function compareDestinations(
  req: TripRequest,
  aId: string,
  bId: string,
  priority: ComparePriority,
  dataset: Dataset,
  now: Date,
): CompareResult {
  const aDest = findDestination(dataset, aId);
  const bDest = findDestination(dataset, bId);
  if (!aDest || !bDest) throw new Error(`Destino desconocido: ${!aDest ? aId : bId}`);
  const a = evaluateDestination(req, aDest, dataset, now);
  const b = evaluateDestination(req, bDest, dataset, now);

  const rows = FACTOR_KEYS.map((key) => {
    const av = factorValue(a, key);
    const bv = factorValue(b, key);
    return { key, label: FACTOR_LABELS[key], a: av, b: bv, winner: higherWins(av, bv) };
  });

  const byPriority = priorityWinner(priority, a, b);
  const winner = byPriority === "tie" ? tieBreak(a, b) : byPriority;
  const [w, l, wName, lName] = winner === "a" ? [a, b, aDest.name, bDest.name] : [b, a, bDest.name, aDest.name];
  const label = PRIORITY_LABELS[priority];
  let verdict = `Con prioridad en ${label} gana ${wName}: ${verdictReason(priority, w, l)}.`;
  if (byPriority === "tie") {
    const head = `Con prioridad en ${label} ${wName} y ${lName} empatan`;
    const wc = w.cost.totalUsd;
    const lc = l.cost.totalUsd;
    if (w.rawScore !== l.rawScore) {
      verdict = `${head}; gana ${wName} por score total ${w.rawScore} frente a ${l.rawScore}.`;
    } else if (wc !== null && lc !== null && wc !== lc) {
      verdict = `${head}, también en score total (${w.rawScore}); gana ${wName} por menor costo: ${usd(wc)} frente a ${usd(lc)}.`;
    } else {
      verdict = `${head}, también en score total (${w.rawScore}).`;
    }
  }

  return { a, b, rows, priority, winner, verdict };
}
