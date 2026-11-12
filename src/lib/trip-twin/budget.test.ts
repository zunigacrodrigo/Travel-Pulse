import { describe, expect, it } from "vitest";
import { budgetBreakdown } from "./budget";
import { FIXTURE_ACTIVITIES, FIXTURE_TRIP } from "./__fixtures__/trip";
import type { Activity } from "./types";

const act = (o: Partial<Activity> & { id: string }): Activity => ({ ...FIXTURE_ACTIVITIES[0]!, ...o });

describe("budgetBreakdown", () => {
  it("multiplica por viajeros solo si el costo es por persona", () => {
    const trip = { ...FIXTURE_TRIP, travelers: 2 };
    const b = budgetBreakdown(trip, [
      act({ id: "a", category: "Museo", cost: { amount: 10, currency: "USD", basis: "per_person" } }),
      act({ id: "b", category: "Museo", cost: { amount: 30, currency: "USD", basis: "per_group" } }),
    ]);
    expect(b.knownTotal).toBe(50);
    expect(b.rows).toHaveLength(1);
    expect(b.rows[0]).toMatchObject({ category: "Museo", known: 50, activities: 2, unknown: 0 });
  });
  it("cuenta los costos desconocidos sin estimarlos", () => {
    const b = budgetBreakdown(FIXTURE_TRIP, [act({ id: "a", cost: { amount: null, currency: "USD", basis: "unknown" } })]);
    expect(b.knownTotal).toBe(0);
    expect(b.unknownCount).toBe(1);
    expect(b.rows[0]!.category).toBe("Sin categoría");
  });
  it("calcula el porcentaje del presupuesto y no divide por cero", () => {
    const trip = { ...FIXTURE_TRIP, travelers: 1, budget: { amount: 100, currency: "USD" } };
    expect(budgetBreakdown(trip, [act({ id: "a", cost: { amount: 25, currency: "USD", basis: "per_group" } })]).usedPct).toBe(25);
    expect(budgetBreakdown({ ...trip, budget: { amount: 0, currency: "USD" } }, []).usedPct).toBeNull();
  });
  it("lista vacía no falla", () => {
    expect(budgetBreakdown(FIXTURE_TRIP, []).rows).toEqual([]);
  });
});
