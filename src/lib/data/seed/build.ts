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
import real from "./real.generated.json";
import type { DestRow } from "./table";

/**
 * Dataset de Travel Pulse construido SOLO con datos reales o con ausencia declarada.
 *
 * Regla: si no hay una fuente real, el valor es `null` con la fuente `sin-fuente` y el motor lo
 * muestra como «sin dato». No se estima, no se interpola y no se generan números.
 *
 *  · Clima mensual ........ Open-Meteo (ERA5), climatología 2015-2024 (scripts/fetch-real-data.mjs)
 *  · Interés de búsqueda .. visitas a Wikipedia, 30 días contra los 30 anteriores (mismo script)
 *  · Riesgo oficial ....... en vivo desde el FCDO (overlay en tiempo de ejecución); sin él, «sin dato»
 *  · Precios, costo diario, saturación, temporada, conectividad: sin fuente conectada → null
 *
 * Lo editorial (nombre, coordenadas, altitud, afinidades por interés, descripción, paleta) es
 * clasificación propia del producto, no una observación del mundo.
 */
interface RealFile {
  generatedAt: string;
  climate: Record<string, { fetchedAt: string; tempC: (number | null)[]; rainMm: (number | null)[]; windKmh: (number | null)[] }>;
  interest: Record<string, { fetchedAt: string; changePct: number }>;
}
const REAL = real as RealFile;

/** Fecha en que se consultaron las fuentes; las ausencias declaradas llevan la misma fecha. */
export const OBSERVED = { generated: REAL.generatedAt.slice(0, 10) } as const;

export const SEED_ORIGIN = "SCL";

function sourced<T>(value: T | null, sourceId: string, observedAt: string): Sourced<T> {
  return { value, sourceId, observedAt };
}

/** Dato que no tiene fuente real conectada. */
const none = <T>(): Sourced<T> => sourced<T>(null, SOURCE_IDS.sinFuente, OBSERVED.generated);

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
    // El nivel oficial llega en vivo del FCDO; sin conexión no se muestra ninguno.
    riskLevel: sourced<1 | 2 | 3 | 4>(null, SOURCE_IDS.cancilleria, OBSERVED.generated),
    riskReasons: [],
    connectivity: {},
    similar: r.similar,
    blurb: r.blurb,
    poster: { sky, sun, far, near, accent, motif },
  };
}

function buildMonthly(r: DestRow): DestinationMonthly[] {
  const climate = REAL.climate[r.id];
  return Array.from({ length: 12 }, (_, i) => {
    const t = climate?.tempC[i] ?? null;
    const rain = climate?.rainMm[i] ?? null;
    const wind = climate?.windKmh[i] ?? null;
    // El clima es un bloque: si falta una medida, no se publica ninguna.
    const complete = climate !== undefined && t !== null && rain !== null && wind !== null;
    return {
      destinationId: r.id,
      month: i + 1,
      season: none(),
      saturation: none(),
      dailyCostUsd: none(),
      climate: complete
        ? sourced({ tempC: t, rainMm: rain, windKmh: wind }, SOURCE_IDS.openMeteo, climate.fetchedAt)
        : none(),
    };
  });
}

/** Sin proveedor de precios conectado no se publica ningún precio de vuelo. */
function buildPrices(): PriceSnapshot[] {
  return [];
}

function buildTrend(r: DestRow): Trend {
  const interest = REAL.interest[r.id];
  return {
    destinationId: r.id,
    priceChange30dPct: none(),
    interestChange30dPct: interest ? sourced(interest.changePct, SOURCE_IDS.wikipedia, interest.fetchedAt) : none(),
  };
}

export function buildDataset(rows: DestRow[], sources: Source[]): Dataset {
  return {
    destinations: rows.map(buildDestination),
    monthly: rows.flatMap(buildMonthly),
    prices: buildPrices(),
    trends: rows.map(buildTrend),
    sources,
  };
}
