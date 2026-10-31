/**
 * Dataset de prueba del motor. Cubre: destinos normales (CUZ, AQP, SLA, MDE),
 * datos faltantes con confianza limitada (FLN), datos vencidos (OAX), sobre
 * presupuesto (TYO), aviso máximo (CCS) y sin vuelo desde SCL (USH). BOG y UIO
 * quedan fuera del Top 5 con score ≥ 60 para Send Me Somewhere (UIO con vuelo caro).
 */
import type {
  Dataset,
  Destination,
  DestinationMonthly,
  Interest,
  PriceSnapshot,
  Source,
  Sourced,
  Trend,
  TripRequest,
} from "@/lib/types";

export const NOW = new Date("2026-10-08T12:00:00Z");
export const FRESH = "2026-10-06";
/** 14 días antes de NOW: vencido para Amadeus (maxAgeDays 7), frescura 0,5. */
export const STALE_PRICE = "2026-09-24";
export const ANCIENT = "2024-01-01";
export const MONTH = 11;

export const SOURCES: Source[] = [
  { id: "amadeus", name: "Amadeus", license: "comercial", maxAgeDays: 7, reliability: 0.95 },
  { id: "openmeteo", name: "Open-Meteo", license: "CC BY 4.0", maxAgeDays: 365, reliability: 0.95 },
  { id: "curaduria-tp", name: "Curaduría Travel Pulse", license: "propia", maxAgeDays: 180, reliability: 0.9 },
  { id: "cancilleria", name: "Alerta oficial de cancillería", license: "pública", maxAgeDays: 30, reliability: 1 },
  { id: "openflights", name: "OpenFlights", license: "ODbL", maxAgeDays: 180, reliability: 0.9 },
  { id: "trends", name: "Tendencias de búsqueda", license: "comercial", maxAgeDays: 14, reliability: 0.8 },
  { id: "turismo", name: "Estadísticas de turismo", license: "pública", maxAgeDays: 180, reliability: 0.85 },
];

export function sourced<T>(value: T | null, sourceId: string, observedAt = FRESH): Sourced<T> {
  return { value, sourceId, observedAt };
}

export function tags(values: [number, number, number, number, number, number, number, number]): Record<Interest, number> {
  const [aventura, comida, cultura, naturaleza, playa, romance, desconocido, lujo] = values;
  return { aventura, comida, cultura, naturaleza, playa, romance, desconocido, lujo };
}

type Conn = { directFlights: boolean; flightHours: number; weeklyFrequency: number };

export function makeDestination(id: string, name: string, overrides: Partial<Destination> = {}): Destination {
  return {
    id,
    name,
    country: "País",
    lat: 0,
    lon: 0,
    altitudeM: 500,
    tags: tags([3, 3, 3, 3, 3, 3, 3, 3]),
    riskLevel: sourced<1 | 2 | 3 | 4>(1, "cancilleria"),
    riskReasons: [],
    connectivity: { SCL: sourced<Conn>({ directFlights: true, flightHours: 3, weeklyFrequency: 14 }, "openflights") },
    similar: [],
    blurb: "Destino de prueba",
    poster: { sky: "#000", sun: "#000", far: "#000", near: "#000", accent: "#000", motif: "city" },
    ...overrides,
  };
}

export interface MonthlyInput {
  season?: number | null;
  saturation?: number | null;
  daily?: number | null;
  climate?: { tempC: number; rainMm: number; windKmh: number } | null;
  climateObservedAt?: string;
}

export function makeMonthly(destinationId: string, input: MonthlyInput, month = MONTH): DestinationMonthly {
  return {
    destinationId,
    month,
    season: sourced(input.season === undefined ? 70 : input.season, "curaduria-tp"),
    saturation: sourced(input.saturation === undefined ? 70 : input.saturation, "turismo"),
    dailyCostUsd: sourced(input.daily === undefined ? 60 : input.daily, "curaduria-tp"),
    climate: sourced(
      input.climate === undefined ? { tempC: 22, rainMm: 20, windKmh: 10 } : input.climate,
      "openmeteo",
      input.climateObservedAt ?? FRESH,
    ),
  };
}

export function makePrice(
  destinationId: string,
  flight: number | null,
  usual: number | null,
  observedAt = FRESH,
  origin = "SCL",
  month = MONTH,
): PriceSnapshot {
  return {
    destinationId,
    origin,
    month,
    flightUsd: sourced(flight, "amadeus", observedAt),
    usualFlightUsd: sourced(usual, "amadeus", observedAt),
  };
}

export function makeTrend(
  destinationId: string,
  price: number | null,
  interest: number | null,
  prevMonthSaturation?: number,
): Trend {
  return {
    destinationId,
    priceChange30dPct: sourced(price, "trends"),
    interestChange30dPct: sourced(interest, "trends"),
    prevMonthSaturation,
  };
}

export const BASE_REQUEST: TripRequest = {
  origin: "SCL",
  budgetUsd: 1500,
  days: 8,
  month: MONTH,
  flexibleDates: false,
  travelers: 1,
  interests: [],
};

export function makeDataset(): Dataset {
  const destinations: Destination[] = [
    makeDestination("CUZ", "Cusco", {
      altitudeM: 3400,
      tags: tags([5, 4, 5, 4, 0, 3, 1, 3]),
      riskLevel: sourced<1 | 2 | 3 | 4>(2, "cancilleria"),
      riskReasons: ["Protestas puntuales en temporada"],
      connectivity: { SCL: sourced<Conn>({ directFlights: true, flightHours: 3.5, weeklyFrequency: 21 }, "openflights") },
      similar: ["ZZZ", "AQP"],
    }),
    makeDestination("AQP", "Arequipa", {
      altitudeM: 2335,
      tags: tags([4, 4, 4, 4, 0, 3, 3, 2]),
      connectivity: { SCL: sourced<Conn>({ directFlights: true, flightHours: 2.5, weeklyFrequency: 14 }, "openflights") },
      similar: ["CUZ"],
    }),
    makeDestination("SLA", "Salta", {
      altitudeM: 1152,
      tags: tags([4, 4, 3, 5, 0, 3, 4, 2]),
      connectivity: { SCL: sourced<Conn>({ directFlights: false, flightHours: 5, weeklyFrequency: 7 }, "openflights") },
      similar: ["TYO", "FLN", "MDE"],
    }),
    makeDestination("MDE", "Medellín", {
      altitudeM: 1495,
      tags: tags([3, 4, 4, 4, 0, 3, 2, 3]),
      connectivity: { SCL: sourced<Conn>({ directFlights: false, flightHours: 6, weeklyFrequency: 10 }, "openflights") },
    }),
    makeDestination("BOG", "Bogotá", {
      altitudeM: 2640,
      tags: tags([3, 4, 4, 3, 0, 3, 4, 2]),
      connectivity: { SCL: sourced<Conn>({ directFlights: false, flightHours: 6, weeklyFrequency: 10 }, "openflights") },
    }),
    makeDestination("UIO", "Quito", {
      altitudeM: 2850,
      tags: tags([4, 3, 4, 4, 0, 3, 5, 2]),
      connectivity: { SCL: sourced<Conn>({ directFlights: false, flightHours: 6, weeklyFrequency: 10 }, "openflights") },
    }),
    makeDestination("OAX", "Oaxaca", {
      altitudeM: 1555,
      tags: tags([3, 5, 5, 4, 2, 4, 5, 2]),
      connectivity: { SCL: sourced<Conn>({ directFlights: false, flightHours: 9, weeklyFrequency: 7 }, "openflights") },
    }),
    makeDestination("FLN", "Florianópolis", {
      tags: tags([5, 4, 4, 5, 5, 5, 4, 4]),
      connectivity: {
        SCL: sourced<Conn>({ directFlights: true, flightHours: 3, weeklyFrequency: 21 }, "openflights", ANCIENT),
      },
    }),
    makeDestination("TYO", "Tokio", { tags: tags([3, 5, 5, 3, 1, 4, 1, 5]) }),
    makeDestination("CCS", "Caracas", {
      riskLevel: sourced<1 | 2 | 3 | 4>(4, "cancilleria"),
      riskReasons: ["Inseguridad generalizada"],
    }),
    makeDestination("USH", "Ushuaia", {
      connectivity: { EZE: sourced<Conn>({ directFlights: true, flightHours: 3.5, weeklyFrequency: 14 }, "openflights") },
    }),
  ];

  const monthly: DestinationMonthly[] = [
    makeMonthly("CUZ", { season: 80, saturation: 60, daily: 70, climate: { tempC: 16, rainMm: 80, windKmh: 10 } }),
    makeMonthly("AQP", { season: 75, saturation: 80, daily: 60, climate: { tempC: 20, rainMm: 10, windKmh: 12 } }),
    makeMonthly("SLA", { season: 70, saturation: 85, daily: 70, climate: { tempC: 22, rainMm: 60, windKmh: 15 } }),
    makeMonthly("MDE", { season: 65, saturation: 55, daily: 80, climate: { tempC: 23, rainMm: 180, windKmh: 8 } }),
    makeMonthly("BOG", { season: 65, saturation: 55, daily: 80, climate: { tempC: 23, rainMm: 180, windKmh: 8 } }),
    makeMonthly("UIO", { season: 60, saturation: 60, daily: 45, climate: { tempC: 19, rainMm: 120, windKmh: 10 } }),
    makeMonthly("OAX", { season: 85, saturation: 75, daily: 50, climate: { tempC: 21, rainMm: 15, windKmh: 10 } }),
    makeMonthly("FLN", { season: 90, saturation: null, daily: 90, climate: null }),
    makeMonthly("TYO", { season: 80, saturation: 40, daily: 150 }),
    makeMonthly("CCS", { season: 60, saturation: 80, daily: 40 }),
    makeMonthly("USH", { season: 70, saturation: 70, daily: 90 }),
  ];

  const prices: PriceSnapshot[] = [
    makePrice("CUZ", 610, 700),
    makePrice("AQP", 520, 540),
    makePrice("SLA", 300, 320),
    makePrice("MDE", 450, 470),
    makePrice("BOG", 450, 470),
    makePrice("UIO", 700, 720),
    makePrice("OAX", 780, 800, STALE_PRICE),
    makePrice("TYO", 1600, 1500),
    makePrice("CCS", 350, 380),
    makePrice("USH", 400, 420, FRESH, "EZE"),
  ];

  const trends: Trend[] = [
    makeTrend("CUZ", -8, 15, 50),
    makeTrend("AQP", -2, 5, 85),
    makeTrend("SLA", 0, 0, 80),
    makeTrend("MDE", 6, -10, 50),
    makeTrend("BOG", 6, -10, 50),
    makeTrend("UIO", 0, 0, 60),
    makeTrend("OAX", -5, 30, 70),
    makeTrend("TYO", 0, 0),
    makeTrend("CCS", 0, 0),
    makeTrend("USH", 0, 0),
  ];

  return { destinations, monthly, prices, trends, sources: SOURCES };
}
