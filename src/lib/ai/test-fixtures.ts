import type {
  ConfidenceBand,
  Destination,
  FactorKey,
  FactorResult,
  ScoreResult,
  TripRequest,
} from "../types";
import { ENGINE_VERSION, FACTOR_KEYS, FACTOR_LABELS } from "../types";

export const destination: Destination = {
  id: "CUZ",
  name: "Cusco",
  country: "Perú",
  lat: -13.5,
  lon: -71.97,
  altitudeM: 3399,
  tags: { aventura: 5, comida: 4, cultura: 5, naturaleza: 4, playa: 0, romance: 3, desconocido: 2, lujo: 2 },
  riskLevel: { value: 2, sourceId: "minrel", observedAt: "2026-09-01" },
  riskReasons: [],
  connectivity: {},
  similar: ["SLA"],
  blurb: "Capital histórica del imperio inca.",
  poster: { sky: "#fff", sun: "#fff", far: "#fff", near: "#fff", accent: "#fff", motif: "mountains" },
};

export const request: TripRequest = {
  origin: "SCL",
  budgetUsd: 1500,
  days: 7,
  month: 11,
  flexibleDates: false,
  travelers: 1,
  interests: ["cultura", "aventura"],
};

export function factor(key: FactorKey, value: number | null, detail: string): FactorResult {
  return {
    key,
    label: FACTOR_LABELS[key],
    value,
    weight: 0.125,
    quality: 0.9,
    sourceName: "Curaduría Travel Pulse",
    observedAt: value === null ? null : "2026-09-10",
    detail,
  };
}

export function makeResult(over: Partial<ScoreResult> = {}, values: Partial<Record<FactorKey, number | null>> = {}): ScoreResult {
  const base: Record<FactorKey, number | null> = {
    precio: 88,
    experiencia: 82,
    clima: 74,
    temporada: 90,
    saturacion: 45,
    conectividad: 66,
    riesgo: 70,
    tendencia: 60,
    ...values,
  };
  const details: Record<FactorKey, string> = {
    precio: "US$1.180 de US$1.500",
    experiencia: "afinidad 4,5 de 5",
    clima: "18 °C, lluvia baja",
    temporada: "índice de temporada alto",
    saturacion: "afluencia moderada",
    conectividad: "vuelo con escala, 6 horas",
    riesgo: "nivel 2 de 4",
    tendencia: "precios estables",
  };
  const factors = FACTOR_KEYS.map((k) => factor(k, base[k], details[k]));
  const band: ConfidenceBand = over.confidenceBand ?? "normal";
  return {
    destinationId: "CUZ",
    score: 82,
    rawScore: 82,
    confidence: 85,
    confidenceBand: band,
    confidenceReason: "Datos frescos de varias fuentes",
    missing: [],
    factors,
    cost: { flightUsd: 620, stayUsd: 560, totalUsd: 1180 },
    opportunity: false,
    reason: "Buen precio y clima",
    engineVersion: ENGINE_VERSION,
    ...over,
  };
}
