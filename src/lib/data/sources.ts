import type { Source } from "@/lib/types";

/**
 * Catálogo de fuentes de datos de Travel Pulse V1 (documento maestro, sección 3).
 * `maxAgeDays` define cuándo un dato se considera vencido; `reliability` es la
 * fiabilidad base (0..1) que el motor usa para calcular q_i.
 */
export const SOURCE_IDS = {
  amadeus: "amadeus",
  openMeteo: "open-meteo",
  curaduria: "curaduria-tp",
  cancilleria: "cancilleria",
  openFlights: "openflights",
  tendencias: "tendencias-busqueda",
  costoVida: "costo-vida",
  travelPulseEstimate: "estimacion-tp",
} as const;

export type SourceId = (typeof SOURCE_IDS)[keyof typeof SOURCE_IDS];

export const sources: Source[] = [
  {
    id: SOURCE_IDS.amadeus,
    name: "Amadeus",
    license: "API comercial",
    maxAgeDays: 2,
    reliability: 0.9,
    url: "https://developers.amadeus.com/self-service/category/flights",
  },
  {
    id: SOURCE_IDS.openMeteo,
    name: "Open-Meteo",
    license: "CC BY 4.0",
    maxAgeDays: 365,
    reliability: 0.85,
    url: "https://open-meteo.com/en/docs/historical-weather-api",
  },
  {
    id: SOURCE_IDS.curaduria,
    name: "Curaduría Travel Pulse",
    license: "Interno",
    maxAgeDays: 120,
    reliability: 0.75,
  },
  {
    id: SOURCE_IDS.cancilleria,
    name: "Alerta oficial de cancillería",
    license: "Datos públicos",
    maxAgeDays: 14,
    reliability: 0.95,
    url: "https://www.minrel.gob.cl",
  },
  {
    id: SOURCE_IDS.openFlights,
    name: "OpenFlights",
    license: "ODbL 1.0",
    maxAgeDays: 60,
    reliability: 0.8,
    url: "https://openflights.org/data",
  },
  {
    id: SOURCE_IDS.tendencias,
    name: "Tendencias de búsqueda",
    license: "Datos públicos",
    maxAgeDays: 7,
    reliability: 0.6,
    url: "https://trends.google.com",
  },
  {
    id: SOURCE_IDS.costoVida,
    name: "Índice de costo de vida (Numbeo)",
    license: "API comercial",
    maxAgeDays: 90,
    reliability: 0.7,
    url: "https://www.numbeo.com/api/doc.jsp",
  },
  {
    id: SOURCE_IDS.travelPulseEstimate,
    name: "Estimación experimental Travel Pulse",
    license: "Dataset sintético interno",
    maxAgeDays: 1,
    reliability: 0.25,
  },
];

export const sourcesById: Record<string, Source> = Object.fromEntries(
  sources.map((s) => [s.id, s]),
);
