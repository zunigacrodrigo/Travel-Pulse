/**
 * Expectation Gap (sección 8): G = media(r_k − e_k) sobre los 5 criterios.
 * Negativo = la realidad quedó bajo lo esperado. Se publica por destino solo con
 * 10 o más respuestas.
 */
import { GAP_CRITERIA, type GapCriterion, type GapRatings, type GapResult } from "@/lib/types";
import { mean, round1 } from "./data";

/** Rango de los deslizadores. */
export const RATING_MIN = 1;
export const RATING_MAX = 10;
/** Mínimo de respuestas para publicar el gap de un destino. */
export const GAP_MIN_RESPONSES = 10;

/** Valida que existan los 5 criterios con números finitos entre 1 y 10. */
export function isValidRatings(value: unknown): value is GapRatings {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return GAP_CRITERIA.every((k) => {
    const v = record[k];
    return typeof v === "number" && Number.isFinite(v) && v >= RATING_MIN && v <= RATING_MAX;
  });
}

/**
 * Gap de una respuesta (sección 8): por criterio r − e y G = media, a 1 decimal.
 * Lanza RangeError si alguna calificación es inválida.
 */
export function expectationGap(expected: GapRatings, real: GapRatings): GapResult {
  if (!isValidRatings(expected) || !isValidRatings(real)) {
    throw new RangeError("Las calificaciones deben ser números entre 1 y 10 para los 5 criterios.");
  }
  const perCriterion = {} as Record<GapCriterion, number>;
  for (const k of GAP_CRITERIA) perCriterion[k] = round1(real[k] - expected[k]);
  return { gap: round1(mean(GAP_CRITERIA.map((k) => real[k] - expected[k]))), perCriterion };
}

/**
 * Gap agregado de un destino (sección 8): media de los gaps válidos a 1 decimal;
 * null con menos de 10 respuestas.
 */
export function aggregateGap(gaps: readonly number[]): { gap: number; n: number } | null {
  const valid = gaps.filter((g) => Number.isFinite(g));
  if (valid.length < GAP_MIN_RESPONSES) return null;
  return { gap: round1(mean(valid)), n: valid.length };
}
