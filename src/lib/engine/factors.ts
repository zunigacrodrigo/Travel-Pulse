/**
 * Los 8 factores del Opportunity Score (sección 5). Cada función devuelve un
 * `FactorEval` con valor 0..100 (o null si falta el dato), calidad q_i,
 * procedencia y un detalle factual en español.
 */
import {
  FACTOR_LABELS,
  INTERESTS,
  INTEREST_LABELS,
  type Dataset,
  type Destination,
  type FactorKey,
  type Interest,
  type TripRequest,
} from "@/lib/types";
import {
  assessSourced,
  clamp,
  findMonthly,
  findPrice,
  findSource,
  findTrend,
  mean,
  type Provenance,
} from "./data";
import { capitalize, joinEs, lowerFirst, num, signedPct, usd } from "./format";

/* ---------------------------- Constantes ---------------------------- */

/** Precio: 100 si el costo total es ≤ 50% del presupuesto. */
export const PRICE_FULL_RATIO = 0.5;
/** Precio: 0 si el costo total supera el 100% del presupuesto. */
export const PRICE_ZERO_RATIO = 1.0;
/** Precio: bonus máximo por vuelo bajo su precio habitual. */
export const PRICE_BONUS_MAX = 10;
/** Precio: con el vuelo 10% o más bajo lo habitual se otorga el bonus completo (lineal desde 0%). */
export const PRICE_BONUS_FULL_BELOW = 0.1;
/** Fechas flexibles: se modela como vuelo 15% más barato. */
export const FLEXIBLE_DATES_FLIGHT_FACTOR = 0.85;

/** Experiencia: las etiquetas van de 0 a 5. */
export const TAG_MAX = 5;
/** Id de fuente preferido para la curaduría de etiquetas (no tienen `Sourced`). */
export const CURATED_SOURCE_ID = "curaduria-tp";
/** Calidad asumida para las etiquetas si la fuente de curaduría no está en el catálogo. */
export const CURATED_TAGS_QUALITY = 0.9;
export const CURATED_TAGS_SOURCE_NAME = "Curaduría Travel Pulse";

/** Clima: rango de temperatura agradable (°C). */
export const CLIMATE_IDEAL_MIN_C = 18;
export const CLIMATE_IDEAL_MAX_C = 26;
/** Clima: puntos que se pierden por cada °C fuera del rango ideal (0 a 20 °C de distancia). */
export const CLIMATE_TEMP_PENALTY_PER_C = 5;
/** Clima: lluvia mensual sin penalización y lluvia que deja el subpuntaje en 0 (mm). */
export const CLIMATE_RAIN_OK_MM = 50;
export const CLIMATE_RAIN_ZERO_MM = 300;
/** Clima: viento sin penalización y viento que deja el subpuntaje en 0 (km/h). */
export const CLIMATE_WIND_OK_KMH = 20;
export const CLIMATE_WIND_ZERO_KMH = 50;
/** Clima: ponderación de los subpuntajes temperatura, lluvia y viento. */
export const CLIMATE_WEIGHTS = { temp: 0.5, rain: 0.3, wind: 0.2 } as const;

/** Conectividad: ponderación de directo, duración y frecuencia. */
export const CONNECTIVITY_WEIGHTS = { direct: 0.4, hours: 0.35, frequency: 0.25 } as const;
/** Conectividad: 100 con vuelos de ≤ 2 h, 0 con ≥ 20 h (lineal). */
export const CONNECTIVITY_BEST_HOURS = 2;
export const CONNECTIVITY_WORST_HOURS = 20;
/** Conectividad: 14 vuelos semanales (2 al día) o más = frecuencia completa. */
export const CONNECTIVITY_FULL_WEEKLY = 14;

/** Riesgo: mapeo de niveles oficiales. El nivel 4 se excluye con filtro duro. */
export const RISK_LEVEL_SCORES: Record<1 | 2 | 3 | 4, number> = { 1: 100, 2: 70, 3: 35, 4: 0 };

/** Tendencia: 50 = plano; cada componente aporta hasta ±25 puntos. */
export const TREND_NEUTRAL = 50;
export const TREND_COMPONENT_MAX = 25;
/** Tendencia: una baja de precio de 20% en 30 días da el aporte completo. */
export const TREND_PRICE_FULL_PCT = 20;
/** Tendencia: un alza de interés de 40% en 30 días da el aporte completo. */
export const TREND_INTEREST_FULL_PCT = 40;

/** Umbrales de etiquetas cualitativas para índices 0..100. */
const INDEX_HIGH = 70;
const INDEX_MID = 40;
const SEASON_VERY_GOOD = 75;
const SEASON_GOOD = 50;
const SEASON_FAIR = 25;
/** Diferencia mínima (fracción) para mencionar que el vuelo está bajo/sobre lo habitual. */
const PRICE_MENTION_THRESHOLD = 0.01;
/** Máximo de intereses que se nombran en el detalle de experiencia. */
const MAX_NAMED_INTERESTS = 3;

/* ------------------------------ Tipos ------------------------------- */

/** Contexto de cálculo de un destino para una consulta. */
export interface FactorContext {
  req: TripRequest;
  destination: Destination;
  dataset: Dataset;
  now: Date;
}

/** Resultado interno de un factor, antes de asignar pesos. */
export interface FactorEval {
  key: FactorKey;
  /** 0..100 entero, o null si falta el dato. */
  value: number | null;
  /** q_i 0..1. */
  quality: number;
  /** Dato vencido (más viejo que maxAgeDays) o fuente desconocida. */
  stale: boolean;
  sourceName: string;
  observedAt: string | null;
  /** Antigüedad máxima (días) de los datos usados. */
  ageDays: number | null;
  detail: string;
  /** Etiqueta legible cuando falta el dato (null si está disponible). */
  missingLabel: string | null;
  /** Frase corta para la razón cuando el factor es fuerte. */
  strongPhrase: string;
  /** Frase corta para la razón cuando el factor es débil. */
  weakPhrase: string;
}

/** Costo estimado del viaje. */
export interface CostEstimate {
  /** Vuelo observado por persona (sin ajuste por fechas flexibles). */
  observedFlightUsd: number | null;
  usualFlightUsd: number | null;
  /** Vuelo efectivo para todos los viajeros (con −15% si hay fechas flexibles). */
  flightUsd: number | null;
  /** dailyCost × días × viajeros. */
  stayUsd: number | null;
  totalUsd: number | null;
  /** (habitual − observado) / habitual; positivo = bajo lo habitual. */
  flightBelowPct: number | null;
  flight: Provenance;
  usual: Provenance;
  daily: Provenance;
}

/* ---------------------------- Utilidades ---------------------------- */

function combineProvenance(parts: readonly Provenance[]): Pick<Provenance, "stale" | "sourceName" | "observedAt" | "ageDays"> {
  const names = [...new Set(parts.map((p) => p.sourceName))];
  const dated = parts.filter((p): p is Provenance & { observedAt: string } => p.observedAt !== null);
  const oldest = [...dated].sort((a, b) => a.observedAt.localeCompare(b.observedAt))[0];
  const ages = parts.map((p) => p.ageDays).filter((a): a is number => a !== null);
  return {
    stale: parts.some((p) => p.stale),
    sourceName: names.join(" / "),
    observedAt: oldest?.observedAt ?? null,
    ageDays: ages.length > 0 ? Math.max(...ages) : null,
  };
}

function lerpDown(value: number, best: number, worst: number): number {
  if (value <= best) return 100;
  if (value >= worst) return 0;
  return (100 * (worst - value)) / (worst - best);
}

function score100(value: number): number {
  return Math.round(clamp(value, 0, 100));
}

function missingFactor(
  key: FactorKey,
  prov: Pick<Provenance, "sourceName" | "observedAt">,
  missingLabel: string,
  detail: string,
): FactorEval {
  return {
    key,
    value: null,
    quality: 0,
    stale: false,
    sourceName: prov.sourceName,
    observedAt: prov.observedAt,
    ageDays: null,
    detail,
    missingLabel,
    strongPhrase: "",
    weakPhrase: "",
  };
}

/* ------------------------------ Costo ------------------------------- */

/**
 * Costo total estimado (sección 5, factor Precio): vuelo por persona × viajeros
 * + costo diario × días × viajeros. Con fechas flexibles el vuelo se modela 15% más barato.
 */
export function estimateCost(ctx: FactorContext): CostEstimate {
  const { req, destination, dataset, now } = ctx;
  const snap = findPrice(dataset, destination.id, req.origin, req.month);
  const monthly = findMonthly(dataset, destination.id, req.month);
  const observed = snap?.flightUsd.value ?? null;
  const usual = snap?.usualFlightUsd.value ?? null;
  const daily = monthly?.dailyCostUsd.value ?? null;
  const flexFactor = req.flexibleDates ? FLEXIBLE_DATES_FLIGHT_FACTOR : 1;
  const flightUsd = observed === null ? null : Math.round(observed * flexFactor * req.travelers);
  const stayUsd = daily === null ? null : Math.round(daily * req.days * req.travelers);
  const totalUsd = flightUsd === null || stayUsd === null ? null : flightUsd + stayUsd;
  const flightBelowPct = observed !== null && usual !== null && usual > 0 ? (usual - observed) / usual : null;
  return {
    observedFlightUsd: observed,
    usualFlightUsd: usual,
    flightUsd,
    stayUsd,
    totalUsd,
    flightBelowPct,
    flight: assessSourced(snap?.flightUsd, dataset.sources, now),
    usual: assessSourced(snap?.usualFlightUsd, dataset.sources, now),
    daily: assessSourced(monthly?.dailyCostUsd, dataset.sources, now),
  };
}

/** Puntaje base de precio: 100 hasta 50% del presupuesto, 0 sobre 100%, lineal entre ambos. */
export function priceBaseScore(totalUsd: number, budgetUsd: number): number {
  if (budgetUsd <= 0) return 0;
  const ratio = totalUsd / budgetUsd;
  if (ratio <= PRICE_FULL_RATIO) return 100;
  if (ratio > PRICE_ZERO_RATIO) return 0;
  return (100 * (PRICE_ZERO_RATIO - ratio)) / (PRICE_ZERO_RATIO - PRICE_FULL_RATIO);
}

/** Bonus de precio: lineal de 0 (precio habitual) a 10 puntos (10% o más bajo lo habitual). */
export function priceBonus(flightBelowPct: number | null): number {
  if (flightBelowPct === null || flightBelowPct <= 0) return 0;
  return PRICE_BONUS_MAX * Math.min(1, flightBelowPct / PRICE_BONUS_FULL_BELOW);
}

/* ----------------------------- Factores ----------------------------- */

/** Factor Precio (25%, sección 5). null si falta el vuelo o el costo diario. */
export function precioFactor(ctx: FactorContext, cost: CostEstimate = estimateCost(ctx)): FactorEval {
  const prov = combineProvenance([cost.flight, cost.daily]);
  if (cost.totalUsd === null) {
    const label = cost.flightUsd === null && cost.stayUsd === null
      ? "Precio de vuelos y costo diario"
      : cost.flightUsd === null
        ? "Precio de vuelos"
        : "Costo diario";
    const detail = cost.flightUsd === null ? `Sin precio de vuelo desde ${ctx.req.origin}` : "Sin costo diario para el mes";
    return missingFactor("precio", prov, label, detail);
  }
  const value = score100(priceBaseScore(cost.totalUsd, ctx.req.budgetUsd) + priceBonus(cost.flightBelowPct));
  const below = cost.flightBelowPct ?? 0;
  let detail = `${usd(cost.totalUsd)} de ${usd(ctx.req.budgetUsd)}`;
  if (below >= PRICE_MENTION_THRESHOLD) detail += `, vuelo ${num(below * 100)}% bajo lo habitual`;
  else if (below <= -PRICE_MENTION_THRESHOLD) detail += `, vuelo ${num(-below * 100)}% sobre lo habitual`;
  return {
    key: "precio",
    value,
    quality: Math.min(cost.flight.quality, cost.daily.quality),
    ...prov,
    detail,
    missingLabel: null,
    strongPhrase: below >= PRICE_BONUS_FULL_BELOW ? "vuelo bajo lo habitual" : "cabe holgado en el presupuesto",
    weakPhrase: "ajustado al presupuesto",
  };
}

function curatedProvenance(dataset: Dataset): { quality: number; sourceName: string } {
  const src = findSource(dataset.sources, CURATED_SOURCE_ID);
  return src
    ? { quality: clamp(src.reliability, 0, 1), sourceName: src.name }
    : { quality: CURATED_TAGS_QUALITY, sourceName: CURATED_TAGS_SOURCE_NAME };
}

/**
 * Factor Ajuste de experiencia (20%, sección 5): promedio de afinidad (0..5 → 0..100)
 * sobre los intereses elegidos; sin intereses, promedio de todas las etiquetas.
 * "desconocido" premia destinos poco masivos a través de su propia etiqueta.
 */
export function experienciaFactor(ctx: FactorContext): FactorEval {
  const chosen = [...new Set(ctx.req.interests)];
  const keys: readonly Interest[] = chosen.length > 0 ? chosen : INTERESTS;
  const avg = mean(keys.map((k) => clamp(ctx.destination.tags[k] ?? 0, 0, TAG_MAX)));
  const labels = chosen.map((k) => lowerFirst(INTEREST_LABELS[k]));
  const scope = chosen.length === 0
    ? "sin intereses elegidos"
    : chosen.length > MAX_NAMED_INTERESTS
      ? `${chosen.length} intereses`
      : joinEs(labels);
  const { quality, sourceName } = curatedProvenance(ctx.dataset);
  // Las etiquetas salen de la misma curaduría que los índices mensuales: usamos su fecha.
  const curatedAt =
    ctx.dataset.monthly.find((m) => m.destinationId === ctx.destination.id && m.month === ctx.req.month)?.season
      .observedAt ?? null;
  return {
    key: "experiencia",
    value: score100((avg / TAG_MAX) * 100),
    quality,
    stale: false,
    sourceName,
    observedAt: curatedAt,
    ageDays: null,
    detail: chosen.length === 0 ? `Afinidad media ${num(avg, 1)}/5 (${scope})` : `Afinidad ${num(avg, 1)}/5 en ${scope}`,
    missingLabel: null,
    strongPhrase: chosen.length === 0 ? "experiencia variada" : "afín a tus intereses",
    weakPhrase: chosen.length === 0 ? "poca variedad de experiencias" : "poca afinidad con tus intereses",
  };
}

/** Puntaje de clima 0..100 contra el rango agradable (constantes CLIMATE_*). */
export function climateScore(tempC: number, rainMm: number, windKmh: number): number {
  const dist = tempC < CLIMATE_IDEAL_MIN_C ? CLIMATE_IDEAL_MIN_C - tempC : Math.max(0, tempC - CLIMATE_IDEAL_MAX_C);
  const temp = clamp(100 - CLIMATE_TEMP_PENALTY_PER_C * dist, 0, 100);
  const rain = lerpDown(rainMm, CLIMATE_RAIN_OK_MM, CLIMATE_RAIN_ZERO_MM);
  const wind = lerpDown(windKmh, CLIMATE_WIND_OK_KMH, CLIMATE_WIND_ZERO_KMH);
  return temp * CLIMATE_WEIGHTS.temp + rain * CLIMATE_WEIGHTS.rain + wind * CLIMATE_WEIGHTS.wind;
}

/** Factor Clima (15%, sección 5): temperatura, lluvia y viento normalizados. */
export function climaFactor(ctx: FactorContext): FactorEval {
  const monthly = findMonthly(ctx.dataset, ctx.destination.id, ctx.req.month);
  const prov = assessSourced(monthly?.climate, ctx.dataset.sources, ctx.now);
  const c = monthly?.climate.value ?? null;
  if (c === null) return missingFactor("clima", prov, "Clima", "Sin datos de clima para el mes");
  return {
    key: "clima",
    value: score100(climateScore(c.tempC, c.rainMm, c.windKmh)),
    quality: prov.quality,
    stale: prov.stale,
    sourceName: prov.sourceName,
    observedAt: prov.observedAt,
    ageDays: prov.ageDays,
    detail: `${num(c.tempC)} °C, ${num(c.rainMm)} mm de lluvia, viento ${num(c.windKmh)} km/h`,
    missingLabel: null,
    strongPhrase: "buen clima",
    weakPhrase: "clima poco favorable",
  };
}

function seasonLabel(v: number): string {
  if (v >= SEASON_VERY_GOOD) return "Muy buen mes";
  if (v >= SEASON_GOOD) return "Buen mes";
  if (v >= SEASON_FAIR) return "Mes regular";
  return "Mes poco recomendable";
}

function saturationLabel(v: number): string {
  if (v >= INDEX_HIGH) return "Poca gente";
  if (v >= INDEX_MID) return "Afluencia media";
  return "Mucha gente";
}

/** Factor Temporada (10%, sección 5): índice mensual curado, se pasa tal cual. */
export function temporadaFactor(ctx: FactorContext): FactorEval {
  const monthly = findMonthly(ctx.dataset, ctx.destination.id, ctx.req.month);
  const prov = assessSourced(monthly?.season, ctx.dataset.sources, ctx.now);
  const v = monthly?.season.value ?? null;
  if (v === null) return missingFactor("temporada", prov, "Temporada", "Sin índice de temporada");
  const value = score100(v);
  return {
    key: "temporada",
    value,
    quality: prov.quality,
    stale: prov.stale,
    sourceName: prov.sourceName,
    observedAt: prov.observedAt,
    ageDays: prov.ageDays,
    detail: `${seasonLabel(value)} (índice ${value})`,
    missingLabel: null,
    strongPhrase: "buen mes para ir",
    weakPhrase: "mes poco recomendable",
  };
}

/** Factor Saturación (10%, sección 5): índice mensual, más alto = menos gente. */
export function saturacionFactor(ctx: FactorContext): FactorEval {
  const monthly = findMonthly(ctx.dataset, ctx.destination.id, ctx.req.month);
  const prov = assessSourced(monthly?.saturation, ctx.dataset.sources, ctx.now);
  const v = monthly?.saturation.value ?? null;
  if (v === null) return missingFactor("saturacion", prov, "Saturación", "Sin índice de saturación");
  const value = score100(v);
  return {
    key: "saturacion",
    value,
    quality: prov.quality,
    stale: prov.stale,
    sourceName: prov.sourceName,
    observedAt: prov.observedAt,
    ageDays: prov.ageDays,
    detail: `${saturationLabel(value)} (índice ${value})`,
    missingLabel: null,
    strongPhrase: "poca gente",
    weakPhrase: "mucha gente",
  };
}

/** Puntaje de conectividad 0..100: vuelo directo, duración y frecuencia semanal. */
export function connectivityScore(directFlights: boolean, flightHours: number, weeklyFrequency: number): number {
  const direct = directFlights ? 100 : 0;
  const hours = lerpDown(flightHours, CONNECTIVITY_BEST_HOURS, CONNECTIVITY_WORST_HOURS);
  const freq = clamp(weeklyFrequency / CONNECTIVITY_FULL_WEEKLY, 0, 1) * 100;
  return (
    direct * CONNECTIVITY_WEIGHTS.direct + hours * CONNECTIVITY_WEIGHTS.hours + freq * CONNECTIVITY_WEIGHTS.frequency
  );
}

/** Factor Conectividad (10%, sección 5): desde `connectivity[origin]`. */
export function conectividadFactor(ctx: FactorContext): FactorEval {
  const entry = ctx.destination.connectivity[ctx.req.origin];
  const prov = assessSourced(entry, ctx.dataset.sources, ctx.now);
  const c = entry?.value ?? null;
  if (c === null) return missingFactor("conectividad", prov, "Conectividad", `Sin datos de vuelos desde ${ctx.req.origin}`);
  return {
    key: "conectividad",
    value: score100(connectivityScore(c.directFlights, c.flightHours, c.weeklyFrequency)),
    quality: prov.quality,
    stale: prov.stale,
    sourceName: prov.sourceName,
    observedAt: prov.observedAt,
    ageDays: prov.ageDays,
    detail: `${c.directFlights ? "Vuelo directo" : "Con escala"}, ${num(c.flightHours, Number.isInteger(c.flightHours) ? 0 : 1)} h, ${num(c.weeklyFrequency)} vuelos por semana`,
    missingLabel: null,
    strongPhrase: c.directFlights ? "vuelo directo" : "buena conexión",
    weakPhrase: "llegar toma tiempo",
  };
}

/** Factor Riesgo (5%, sección 5): nivel 1→100, 2→70, 3→35; el 4 se excluye antes. */
export function riesgoFactor(ctx: FactorContext): FactorEval {
  const risk = ctx.destination.riskLevel;
  const prov = assessSourced(risk, ctx.dataset.sources, ctx.now);
  const level = risk.value;
  if (level === null) return missingFactor("riesgo", prov, "Riesgo", "Sin nivel de riesgo oficial");
  const firstReason = ctx.destination.riskReasons[0];
  return {
    key: "riesgo",
    value: RISK_LEVEL_SCORES[level],
    quality: prov.quality,
    stale: prov.stale,
    sourceName: prov.sourceName,
    observedAt: prov.observedAt,
    ageDays: prov.ageDays,
    detail: prov.stale
      ? `Nivel ${level} de 4 en la última consulta; dato antiguo, no confirma si hay alertas vigentes.`
      : firstReason ? `Nivel ${level} de 4: ${lowerFirst(firstReason)}` : `Nivel ${level} de 4`,
    missingLabel: null,
    strongPhrase: "riesgo bajo",
    weakPhrase: "riesgo a considerar",
  };
}

/**
 * Factor Tendencia (5%, sección 5): 50 = plano; baja de precio y alza de interés
 * suben el valor (±25 puntos cada uno, ver constantes TREND_*).
 */
export function tendenciaFactor(ctx: FactorContext): FactorEval {
  const trend = findTrend(ctx.dataset, ctx.destination.id);
  const priceProv = assessSourced(trend?.priceChange30dPct, ctx.dataset.sources, ctx.now);
  const interestProv = assessSourced(trend?.interestChange30dPct, ctx.dataset.sources, ctx.now);
  const price = trend?.priceChange30dPct.value ?? null;
  const interest = trend?.interestChange30dPct.value ?? null;
  const used = [price !== null ? priceProv : null, interest !== null ? interestProv : null].filter(
    (p): p is Provenance => p !== null,
  );
  const combined = combineProvenance(trend ? [priceProv, interestProv] : [priceProv]);
  if (used.length === 0) return missingFactor("tendencia", combined, "Tendencia", "Sin datos de tendencia");
  const pricePart = price === null ? 0 : clamp(-price / TREND_PRICE_FULL_PCT, -1, 1) * TREND_COMPONENT_MAX;
  const interestPart = interest === null ? 0 : clamp(interest / TREND_INTEREST_FULL_PCT, -1, 1) * TREND_COMPONENT_MAX;
  const parts: string[] = [];
  if (price !== null) parts.push(`precio ${signedPct(price)}`);
  if (interest !== null) parts.push(`interés ${signedPct(interest)}`);
  const usedProv = combineProvenance(used);
  return {
    key: "tendencia",
    value: score100(TREND_NEUTRAL + pricePart + interestPart),
    quality: mean(used.map((p) => p.quality)) * (used.length / 2),
    ...usedProv,
    detail: `${capitalize(parts.join(price !== null && interest !== null ? " e " : ""))} en 30 días`,
    missingLabel: null,
    strongPhrase: "tendencia favorable",
    weakPhrase: "tendencia desfavorable",
  };
}

/** Evalúa los 8 factores en el orden de FACTOR_KEYS. */
export function evaluateFactors(ctx: FactorContext, cost: CostEstimate = estimateCost(ctx)): Record<FactorKey, FactorEval> {
  return {
    precio: precioFactor(ctx, cost),
    experiencia: experienciaFactor(ctx),
    clima: climaFactor(ctx),
    temporada: temporadaFactor(ctx),
    saturacion: saturacionFactor(ctx),
    conectividad: conectividadFactor(ctx),
    riesgo: riesgoFactor(ctx),
    tendencia: tendenciaFactor(ctx),
  };
}

/** Etiqueta de un factor (re-export de conveniencia). */
export function factorLabel(key: FactorKey): string {
  return FACTOR_LABELS[key];
}
