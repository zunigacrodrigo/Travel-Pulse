import {
  INTERESTS,
  type Dataset,
  type Destination,
  type DestinationMonthly,
  type Interest,
  type PriceSnapshot,
  type Source,
  type Sourced,
  type Trend,
} from "@/lib/types";
import { SOURCE_IDS } from "../sources";
import type { DestRow } from "./table";

/** Fechas base de observación/curaduría del dataset de demostración. */
export const OBSERVED = {
  prices: "2026-10-06",
  climate: "2025-12-31",
  curation: "2026-09-15",
  cost: "2026-09-15",
  advisories: "2026-10-05",
  trends: "2026-10-04",
  connectivity: "2026-09-01",
} as const;

export const SEED_ORIGIN = "SCL";

/**
 * Demanda relativa desde Santiago por mes (vacaciones de verano, invierno,
 * Fiestas Patrias y fin de año encarecen los vuelos).
 */
const ORIGIN_DEMAND = [1.22, 1.18, 0.95, 0.92, 0.88, 0.9, 1.12, 0.98, 1.05, 0.95, 0.94, 1.15];

function sourced<T>(value: T | null, sourceId: string, observedAt: string): Sourced<T> {
  return { value, sourceId, observedAt };
}

const round10 = (n: number) => Math.round(n / 10) * 10;

/** Pseudoaleatorio determinista en [0, 1) a partir de un texto. */
function hash01(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

/** Costo diario ajustado por saturación: meses llenos son más caros. */
export function monthlyCost(base: number, sat: number): number {
  return Math.round(base * (0.88 + 0.24 * ((100 - sat) / 100)));
}

/** Precio habitual (mediana histórica) del vuelo ida y vuelta para un mes. */
export function usualFlight(base: number, month: number, sat: number): number {
  const demand = ORIGIN_DEMAND[month - 1];
  const crowd = 1 + 0.2 * (0.6 - sat / 100);
  return round10(base * demand * crowd);
}

function buildDestination(r: DestRow): Destination {
  const tags = Object.fromEntries(INTERESTS.map((k, i) => [k, r.tags[i]])) as Record<Interest, number>;
  const [sky, sun, far, near, accent, motif] = r.poster;
  return {
    id: r.id,
    name: r.name,
    country: r.country,
    lat: r.lat,
    lon: r.lon,
    altitudeM: r.alt,
    tags,
    riskLevel: sourced(r.risk, SOURCE_IDS.cancilleria, OBSERVED.advisories),
    riskReasons: r.riskReasons,
    connectivity: {
      [SEED_ORIGIN]: sourced(
        { directFlights: r.conn[0], flightHours: r.conn[1], weeklyFrequency: r.conn[2] },
        SOURCE_IDS.openFlights,
        r.stale?.connectivity ?? OBSERVED.connectivity,
      ),
    },
    similar: r.similar,
    blurb: r.blurb,
    poster: { sky, sun, far, near, accent, motif },
  };
}

function buildMonthly(r: DestRow): DestinationMonthly[] {
  const curationAt = r.stale?.curation ?? OBSERVED.curation;
  const costAt = r.stale?.cost ?? OBSERVED.cost;
  return r.season.map((season, i) => {
    const month = i + 1;
    const sat = r.sat[i];
    const satMissing = r.missing?.saturation?.includes(month) ?? false;
    const wind = typeof r.wind === "number" ? r.wind : r.wind[i];
    return {
      destinationId: r.id,
      month,
      season: sourced(season, SOURCE_IDS.curaduria, curationAt),
      saturation: sourced(satMissing ? null : sat, SOURCE_IDS.curaduria, curationAt),
      dailyCostUsd: sourced(monthlyCost(r.costBase, sat), SOURCE_IDS.costoVida, costAt),
      climate: sourced(
        { tempC: r.temp[i], rainMm: r.rain[i], windKmh: wind },
        SOURCE_IDS.openMeteo,
        OBSERVED.climate,
      ),
    };
  });
}

function buildPrices(r: DestRow): PriceSnapshot[] {
  return r.sat.map((sat, i) => {
    const month = i + 1;
    let usual: number | null = usualFlight(r.flight.base, month, sat);
    let flight: number | null;
    const deal = r.flight.deals?.[month];
    if (deal !== undefined) {
      flight = round10(usual * (1 - deal));
    } else {
      // Variación de mercado determinista entre -5% y +9% respecto de lo habitual.
      flight = round10(usual * (0.95 + 0.14 * hash01(`${r.id}-${month}`)));
    }
    const fixed = r.flight.fixed?.[month];
    if (fixed) {
      [flight, usual] = fixed;
    }
    return {
      destinationId: r.id,
      origin: SEED_ORIGIN,
      month,
      flightUsd: sourced(flight, SOURCE_IDS.travelPulseEstimate, OBSERVED.prices),
      usualFlightUsd: sourced(usual, SOURCE_IDS.travelPulseEstimate, OBSERVED.prices),
    };
  });
}

function buildTrend(r: DestRow): Trend {
  const trendsAt = r.stale?.trends ?? OBSERVED.trends;
  return {
    destinationId: r.id,
      priceChange30dPct: sourced(r.trend[0], SOURCE_IDS.travelPulseEstimate, OBSERVED.prices),
    interestChange30dPct: sourced(r.trend[1], SOURCE_IDS.tendencias, trendsAt),
  };
}

export function buildDataset(rows: DestRow[], sources: Source[]): Dataset {
  return {
    destinations: rows.map(buildDestination),
    monthly: rows.flatMap(buildMonthly),
    prices: rows.flatMap(buildPrices),
    trends: rows.map(buildTrend),
    sources,
  };
}
