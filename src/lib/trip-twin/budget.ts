import { activityCost } from "./engine";
import type { Activity, Trip } from "./types";

export interface BudgetRow {
  category: string;
  /** Suma de los costos conocidos; los desconocidos no se estiman. */
  known: number;
  activities: number;
  unknown: number;
}

export interface BudgetBreakdown {
  rows: BudgetRow[];
  knownTotal: number;
  unknownCount: number;
  budget: number;
  currency: string;
  /** Porcentaje del presupuesto cubierto por costos conocidos; puede superar 100. */
  usedPct: number | null;
}

const NO_CATEGORY = "Sin categoría";

/** Desglose por categoría usando solo costos declarados. Los desconocidos se cuentan, no se inventan. */
export function budgetBreakdown(trip: Trip, activities: Activity[]): BudgetBreakdown {
  const byCat = new Map<string, BudgetRow>();
  let knownTotal = 0;
  let unknownCount = 0;
  for (const a of activities) {
    const key = a.category?.trim() || NO_CATEGORY;
    const row = byCat.get(key) ?? { category: key, known: 0, activities: 0, unknown: 0 };
    const cost = activityCost(a, trip.travelers);
    row.activities += 1;
    if (cost === null) { row.unknown += 1; unknownCount += 1; }
    else { row.known += cost; knownTotal += cost; }
    byCat.set(key, row);
  }
  const rows = [...byCat.values()].sort((x, y) => y.known - x.known || x.category.localeCompare(y.category, "es"));
  const budget = trip.budget.amount;
  return {
    rows, knownTotal: Number(knownTotal.toFixed(2)), unknownCount, budget, currency: trip.budget.currency,
    usedPct: budget > 0 ? Math.round((knownTotal / budget) * 100) : null,
  };
}
