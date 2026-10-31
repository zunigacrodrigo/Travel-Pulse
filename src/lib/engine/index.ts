/**
 * API pública del motor de decisión de Travel Pulse (secciones 4, 5 y 8).
 * Todo es puro y determinista: `now` se recibe como parámetro.
 */
export { scoreDestination, evaluateDestination, isExclusion, personalizedWeights, confidenceBand } from "./score";
export { rankDestinations, compareResults, cheapestDestination, suggestedBudget } from "./rank";
export { realityCheck } from "./reality";
export { compareDestinations } from "./compare";
export { surprise, flightWarning } from "./surprise";
export { expectationGap, aggregateGap, isValidRatings, GAP_MIN_RESPONSES } from "./gap";
export {
  estimateCost,
  evaluateFactors,
  precioFactor,
  experienciaFactor,
  climaFactor,
  temporadaFactor,
  saturacionFactor,
  conectividadFactor,
  riesgoFactor,
  tendenciaFactor,
  FLEXIBLE_DATES_FLIGHT_FACTOR,
  type CostEstimate,
  type FactorContext,
  type FactorEval,
} from "./factors";
export { usd, num, pct, signedPct, meters, joinEs, capitalize } from "./format";
