import type { Dataset } from "@/lib/types";
import { sources } from "../sources";
import { buildDataset } from "./build";
import { ROWS } from "./table";

export { OBSERVED, SEED_ORIGIN } from "./build";
export { ROWS } from "./table";

/**
 * Dataset curado V1: 30 destinos alcanzables desde Santiago (SCL),
 * 12 meses de índices, precios desde SCL, tendencias y catálogo de fuentes.
 * `Trend.prevMonthSaturation` no se fija aquí porque depende del mes consultado;
 * lo completa `withMonthContext` (y los repositorios en `getDataset`).
 */
export const seedDataset: Dataset = buildDataset(ROWS, sources);

/**
 * Devuelve una copia del dataset filtrada por origen y con
 * `prevMonthSaturation` calculada para `month` (para el Opportunity Index).
 */
export function withMonthContext(ds: Dataset, origin: string, month: number): Dataset {
  const prev = month === 1 ? 12 : month - 1;
  const prevSat = new Map(
    ds.monthly.filter((m) => m.month === prev).map((m) => [m.destinationId, m.saturation.value]),
  );
  return {
    destinations: ds.destinations,
    monthly: ds.monthly,
    prices: ds.prices.filter((p) => p.origin === origin),
    trends: ds.trends.map((t) => {
      const v = prevSat.get(t.destinationId);
      const { prevMonthSaturation: _omit, ...rest } = t;
      void _omit;
      return v === null || v === undefined ? rest : { ...rest, prevMonthSaturation: v };
    }),
    sources: ds.sources,
  };
}
