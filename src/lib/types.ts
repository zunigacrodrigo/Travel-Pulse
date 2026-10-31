/**
 * Contratos compartidos de Travel Pulse V1.
 * Fuente de verdad: documento maestro (secciones 2, 4, 5, 8 y 9).
 * Todos los módulos (engine, data, ai, api, ui) importan desde aquí.
 * No cambiar nombres sin actualizar a todos los consumidores.
 */

export const ENGINE_VERSION = "1.0.0";

export const INTERESTS = [
  "aventura",
  "comida",
  "cultura",
  "naturaleza",
  "playa",
  "romance",
  "desconocido",
  "lujo",
] as const;
export type Interest = (typeof INTERESTS)[number];

export const INTEREST_LABELS: Record<Interest, string> = {
  aventura: "Aventura",
  comida: "Comida",
  cultura: "Cultura",
  naturaleza: "Naturaleza",
  playa: "Playa",
  romance: "Romance",
  desconocido: "Desconocido",
  lujo: "Lujo",
};

export const FACTOR_KEYS = [
  "precio",
  "experiencia",
  "clima",
  "temporada",
  "saturacion",
  "conectividad",
  "riesgo",
  "tendencia",
] as const;
export type FactorKey = (typeof FACTOR_KEYS)[number];

/** Pesos iniciales (sección 5). Suman 1. Hipótesis a calibrar. */
export const BASE_WEIGHTS: Record<FactorKey, number> = {
  precio: 0.25,
  experiencia: 0.2,
  clima: 0.15,
  temporada: 0.1,
  saturacion: 0.1,
  conectividad: 0.1,
  riesgo: 0.05,
  tendencia: 0.05,
};

export const FACTOR_LABELS: Record<FactorKey, string> = {
  precio: "Precio",
  experiencia: "Experiencia",
  clima: "Clima",
  temporada: "Temporada",
  saturacion: "Saturación",
  conectividad: "Conectividad",
  riesgo: "Riesgo",
  tendencia: "Tendencia",
};

/** Umbrales de confianza (sección 5). */
export const CONFIDENCE_LIMITED = 40; // < 40: "Información limitada", sin ranking numérico
export const CONFIDENCE_NORMAL = 70; // 40..69: con advertencia; >= 70 normal

/** Umbrales de color del score (sección 6). */
export const SCORE_LOW = 50; // 0..49 coral
export const SCORE_MID = 70; // 50..69 ámbar, >= 70 normal

/* ------------------------------------------------------------------ */
/* Entrada del usuario                                                 */
/* ------------------------------------------------------------------ */

export interface TripRequest {
  /** Código IATA de origen. Por defecto "SCL". */
  origin: string;
  /** Presupuesto total en USD para todos los viajeros. */
  budgetUsd: number;
  days: number;
  /** Mes del viaje, 1 a 12. */
  month: number;
  flexibleDates: boolean;
  travelers: number;
  interests: Interest[];
}

/* ------------------------------------------------------------------ */
/* Datos (tablas destinations, destination_monthly, price_snapshots…)  */
/* ------------------------------------------------------------------ */

/** Un dato con procedencia. value null = no disponible. */
export interface Sourced<T> {
  value: T | null;
  /** Id de la fuente en el catálogo `sources`. */
  sourceId: string;
  /** Fecha ISO (YYYY-MM-DD) de observación o curaduría. */
  observedAt: string;
}

export interface Source {
  id: string;
  name: string; // "Amadeus", "Open-Meteo", "Curaduría Travel Pulse"…
  license: string;
  /** Días que un dato de esta fuente se considera fresco. */
  maxAgeDays: number;
  /** Fiabilidad base 0..1. */
  reliability: number;
  url?: string;
}

export interface PosterPalette {
  sky: string;
  sun: string;
  far: string;
  near: string;
  accent: string;
  /** Motivo del afiche: montaña, mar, colinas, ciudad. */
  motif: "mountains" | "sea" | "hills" | "city" | "desert";
}

export interface Destination {
  /** Código IATA del aeropuerto principal, en mayúsculas. Es el id. */
  id: string;
  name: string;
  country: string;
  lat: number;
  lon: number;
  altitudeM: number;
  /** Afinidad 0..5 por interés (curada, revisada por dos personas). */
  tags: Record<Interest, number>;
  /** Nivel oficial de riesgo 1 (normal) a 4 (no viajar). 4 se excluye. */
  riskLevel: Sourced<1 | 2 | 3 | 4>;
  riskReasons: string[];
  /** Conectividad desde cada origen, indexada por código IATA de origen. */
  connectivity: Record<
    string,
    Sourced<{ directFlights: boolean; flightHours: number; weeklyFrequency: number }>
  >;
  /** Ids de destinos similares para Reality Check (orden de preferencia). */
  similar: string[];
  /** Una línea de identidad, sin cifras. */
  blurb: string;
  poster: PosterPalette;
}

export interface DestinationMonthly {
  destinationId: string;
  month: number; // 1..12
  /** Índice de temporada 0..100 (100 = mejor mes). */
  season: Sourced<number>;
  /** 0..100, más alto = MENOS saturado. */
  saturation: Sourced<number>;
  /** Costo diario medio por persona (alojamiento + comida + transporte local), USD. */
  dailyCostUsd: Sourced<number>;
  climate: Sourced<{ tempC: number; rainMm: number; windKmh: number }>;
}

export interface PriceSnapshot {
  destinationId: string;
  origin: string;
  month: number;
  /** Vuelo ida y vuelta por persona, USD. */
  flightUsd: Sourced<number>;
  /** Precio habitual de ese vuelo (mediana histórica). */
  usualFlightUsd: Sourced<number>;
}

export interface Trend {
  destinationId: string;
  /** Cambio de precio en 30 días, en % (negativo = bajó). */
  priceChange30dPct: Sourced<number>;
  /** Cambio de interés de búsqueda en 30 días, en %. */
  interestChange30dPct: Sourced<number>;
  /** Saturación del mes anterior, para el Opportunity Index. */
  prevMonthSaturation?: number;
}

export interface Dataset {
  destinations: Destination[];
  monthly: DestinationMonthly[];
  prices: PriceSnapshot[];
  trends: Trend[];
  sources: Source[];
}

/* ------------------------------------------------------------------ */
/* Salida del motor                                                     */
/* ------------------------------------------------------------------ */

export interface FactorResult {
  key: FactorKey;
  label: string;
  /** 0..100 o null si falta el dato. */
  value: number | null;
  /** Peso efectivo tras personalización y reponderación (suma 1 entre los disponibles). */
  weight: number;
  /** Calidad 0..1 por frescura y fiabilidad (q_i). */
  quality: number;
  sourceName: string;
  observedAt: string | null;
  /** Explicación corta y factual, p. ej. "US$1.180 de US$1.500". */
  detail: string;
}

export type ConfidenceBand = "limited" | "warning" | "normal";

export interface CostBreakdown {
  flightUsd: number | null;
  stayUsd: number | null; // dailyCost * days * travelers
  totalUsd: number | null;
}

export interface ScoreResult {
  destinationId: string;
  /** Score publicado. null si confidence < 40. */
  score: number | null;
  /** Score calculado aunque la confianza sea baja (uso interno y orden). */
  rawScore: number;
  confidence: number;
  confidenceBand: ConfidenceBand;
  /** Motivo de la confianza en una frase. */
  confidenceReason: string;
  /** Factores sin dato o vencidos, legibles. */
  missing: string[];
  factors: FactorResult[];
  cost: CostBreakdown;
  /** Opportunity Index: precio ≥10% bajo lo habitual y saturación mejor que el mes anterior. */
  opportunity: boolean;
  /** Razón en una línea, determinista, construida desde los factores. */
  reason: string;
  engineVersion: string;
}

export interface Exclusion {
  destinationId: string;
  reason: "over_budget" | "max_risk" | "no_flight" | "no_data";
  detail: string;
}

export interface RankingResult {
  /** Hasta 5 resultados. Los de confianza < 40 van al final y sin número. */
  top: ScoreResult[];
  /** Resto de candidatos válidos, ordenados. */
  others: ScoreResult[];
  excluded: Exclusion[];
  /** Si top está vacío: destino más barato y sugerencias de ajuste. */
  emptyHelp: EmptyHelp | null;
  computedAt: string;
  engineVersion: string;
}

export interface EmptyHelp {
  cheapest: { destinationId: string; name: string; totalUsd: number } | null;
  suggestions: Array<{
    kind: "raise_budget" | "fewer_days" | "flexible_dates";
    label: string;
    /** Petición modificada lista para reenviar. */
    request: TripRequest;
    resultCount: number;
  }>;
}

export interface RealityRow {
  label: string;
  chosen: string;
  alternative: string;
  better: "chosen" | "alternative" | "tie";
}

export interface RealityCheckResult {
  chosen: ScoreResult;
  alternative: ScoreResult;
  rows: RealityRow[];
  /** Hechos numéricos para que la IA redacte la conclusión. */
  facts: string[];
  /** Conclusión determinista de respaldo. */
  conclusion: string;
}

export type ComparePriority = "precio" | "experiencia" | "menos_gente";

export interface CompareResult {
  a: ScoreResult;
  b: ScoreResult;
  rows: Array<{ key: FactorKey; label: string; a: number | null; b: number | null; winner: "a" | "b" | "tie" }>;
  priority: ComparePriority;
  winner: "a" | "b";
  verdict: string;
}

/* ------------------------------------------------------------------ */
/* Feedback y Expectation Gap                                          */
/* ------------------------------------------------------------------ */

export const GAP_CRITERIA = ["autenticidad", "saturacion", "costo", "seguridad", "comida"] as const;
export type GapCriterion = (typeof GAP_CRITERIA)[number];

export const GAP_LABELS: Record<GapCriterion, string> = {
  autenticidad: "Autenticidad",
  saturacion: "Saturación (10 = tranquilo)",
  costo: "Costo (10 = barato)",
  seguridad: "Seguridad percibida",
  comida: "Comida",
};

/** Valores 1..10 por criterio. */
export type GapRatings = Record<GapCriterion, number>;

export interface GapResult {
  /** G = media(r - e). Negativo = la realidad quedó bajo lo esperado. */
  gap: number;
  perCriterion: Record<GapCriterion, number>;
}

export interface DuringSignal {
  ambiente: "tranquilo" | "animado" | "tenso";
  afluencia: "vacio" | "normal" | "lleno";
  precio: "barato" | "normal" | "caro";
}

/* ------------------------------------------------------------------ */
/* IA                                                                   */
/* ------------------------------------------------------------------ */

export interface Verdict {
  text: string;
  /** true si lo redactó un LLM y pasó el revisor crítico. */
  aiGenerated: boolean;
  /** Advertencia de una línea del revisor, si existe. */
  warning: string | null;
  model: string | null;
}

/* ------------------------------------------------------------------ */
/* Contratos de API (src/app/api/**). La UI solo consume estos tipos.   */
/* ------------------------------------------------------------------ */

export interface DestinationCard {
  destination: Destination;
  result: ScoreResult;
  verdict: Verdict;
}

/** POST /api/recommendations  body: TripRequest */
export interface RecommendationsResponse {
  requestId: string;
  request: TripRequest;
  top: DestinationCard[];
  emptyHelp: EmptyHelp | null;
  computedAt: string;
}

/** GET /api/destinations/[id]?q=<TripRequest en base64url> */
export interface DestinationDetailResponse {
  card: DestinationCard;
  reality: (RealityCheckResult & { alternativeDestination: Destination; conclusionVerdict: Verdict }) | null;
  sources: Source[];
}

/** GET /api/compare?a=CUZ&b=SLA&priority=precio&q=... */
export interface CompareResponse {
  a: Destination;
  b: Destination;
  compare: CompareResult;
}

/** POST /api/surprise  body: { request: TripRequest; exclude: string[] } */
export interface SurpriseResponse {
  card: DestinationCard | null;
  /** Advertencia tipo Reality Check, p. ej. peso del vuelo en el gasto. */
  warning: string | null;
}

/** GET /api/globe?origin=SCL&month=11 */
export interface GlobeResponse {
  month: number;
  points: Array<{
    id: string;
    name: string;
    lat: number;
    lon: number;
    score: number | null;
    band: ConfidenceBand;
  }>;
}

/** POST /api/clicks  body: { destinationId, kind, requestId? } */
export interface ClickResponse {
  url: string;
}

/** POST /api/feedback */
export type FeedbackRequest =
  | { destinationId: string; moment: "before"; ratings: GapRatings }
  | { destinationId: string; moment: "during"; signal: DuringSignal }
  | { destinationId: string; moment: "after"; ratings: GapRatings; expected?: GapRatings; phrase?: string };

export interface FeedbackResponse {
  ok: true;
  gap: GapResult | null;
  /** Gap agregado del destino; null si hay menos de 10 respuestas. */
  destinationGap: { gap: number; n: number } | null;
}
