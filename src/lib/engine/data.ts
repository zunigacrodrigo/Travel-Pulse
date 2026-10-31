/**
 * Acceso al dataset y calidad de los datos (q_i, sección 5).
 * Funciones puras: sin I/O, `now` siempre se recibe como parámetro.
 */
import type {
  Dataset,
  Destination,
  DestinationMonthly,
  PriceSnapshot,
  Source,
  Sourced,
  Trend,
} from "@/lib/types";

const MS_PER_DAY = 86_400_000;
/** La frescura cae linealmente de 1 (a maxAgeDays) a 0 (a 3 × maxAgeDays). */
export const FRESHNESS_ZERO_MULTIPLIER = 3;
export const UNKNOWN_SOURCE_NAME = "Fuente desconocida";

/** Procedencia evaluada de un dato. */
export interface Provenance {
  /** q_i = fiabilidad × frescura, 0..1. 0 si el valor es null. */
  quality: number;
  /** true si el dato supera maxAgeDays o su fuente no está en el catálogo. */
  stale: boolean;
  sourceName: string;
  observedAt: string | null;
  /** Antigüedad en días (null si la fecha no es válida). */
  ageDays: number | null;
}

/** Busca una fuente del catálogo por id. */
export function findSource(sources: readonly Source[], id: string): Source | undefined {
  return sources.find((s) => s.id === id);
}

/** Antigüedad en días de una fecha ISO respecto a `now`; null si la fecha no es válida. */
export function ageInDays(observedAt: string, now: Date): number | null {
  const t = Date.parse(observedAt);
  if (Number.isNaN(t)) return null;
  return Math.max(0, (now.getTime() - t) / MS_PER_DAY);
}

/**
 * Frescura 0..1 (sección 5, q_i): 1 dentro de maxAgeDays, decae linealmente
 * hasta 0 en 3 × maxAgeDays.
 */
export function freshness(ageDays: number, maxAgeDays: number): number {
  if (ageDays <= maxAgeDays) return 1;
  const zeroAt = maxAgeDays * FRESHNESS_ZERO_MULTIPLIER;
  if (ageDays >= zeroAt) return 0;
  return 1 - (ageDays - maxAgeDays) / (zeroAt - maxAgeDays);
}

/**
 * Evalúa la procedencia de un dato `Sourced`: q = fiabilidad de la fuente × frescura.
 * Un valor null o una fuente fuera del catálogo dan q = 0.
 */
export function assessSourced<T>(
  item: Sourced<T> | undefined,
  sources: readonly Source[],
  now: Date,
): Provenance {
  if (!item) return { quality: 0, stale: false, sourceName: UNKNOWN_SOURCE_NAME, observedAt: null, ageDays: null };
  const source = findSource(sources, item.sourceId);
  const ageDays = ageInDays(item.observedAt, now);
  const sourceName = source?.name ?? UNKNOWN_SOURCE_NAME;
  if (!source || ageDays === null) {
    return { quality: 0, stale: item.value !== null, sourceName, observedAt: item.observedAt, ageDays };
  }
  const fresh = freshness(ageDays, source.maxAgeDays);
  const quality = item.value === null ? 0 : clamp(source.reliability * fresh, 0, 1);
  return {
    quality,
    stale: item.value !== null && ageDays > source.maxAgeDays,
    sourceName,
    observedAt: item.observedAt,
    ageDays,
  };
}

/** Fila mensual de un destino. */
export function findMonthly(dataset: Dataset, destinationId: string, month: number): DestinationMonthly | undefined {
  return dataset.monthly.find((m) => m.destinationId === destinationId && m.month === month);
}

/** Snapshot de precio más reciente para destino, origen y mes. */
export function findPrice(
  dataset: Dataset,
  destinationId: string,
  origin: string,
  month: number,
): PriceSnapshot | undefined {
  const matches = dataset.prices.filter(
    (p) => p.destinationId === destinationId && p.origin === origin && p.month === month,
  );
  return [...matches].sort((a, b) => b.flightUsd.observedAt.localeCompare(a.flightUsd.observedAt))[0];
}

/** Tendencia de un destino. */
export function findTrend(dataset: Dataset, destinationId: string): Trend | undefined {
  return dataset.trends.find((t) => t.destinationId === destinationId);
}

/** Destino por id (IATA). */
export function findDestination(dataset: Dataset, id: string): Destination | undefined {
  return dataset.destinations.find((d) => d.id === id);
}

/** Limita un número al rango [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Media aritmética; 0 para una lista vacía. */
export function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((s, v) => s + v, 0) / values.length;
}

/** Redondeo a 1 decimal sin "-0". */
export function round1(value: number): number {
  const r = Math.round(value * 10) / 10;
  return Object.is(r, -0) ? 0 : r;
}
