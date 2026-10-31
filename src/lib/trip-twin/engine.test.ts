import { describe, expect, it } from "vitest";
import { buildTripPlan, replanTrip } from "./engine";
import type { Activity, Trip } from "./types";

const trip: Trip = {
  id: "demo-sp",
  destination: "São Paulo",
  startAt: "2026-11-04T09:00:00-03:00",
  endAt: "2026-11-04T18:00:00-03:00",
  timeZone: "America/Sao_Paulo",
  budget: { amount: 150, currency: "USD" },
  travelers: 2,
};
const evidence = { status: "estimated" as const, sourceId: "synthetic-demo", observedAt: "2026-10-27T12:00:00-03:00", expiresAt: null };
const activities: Activity[] = [
  { id: "a", name: "Paseo cultural (demo)", location: { latitude: -23.56, longitude: -46.65 }, durationMinutes: 60, importance: "normal", cost: { amount: 10, currency: "USD", basis: "per_person" }, travelMinutesFromPrevious: 0, travelEvidence: evidence, hoursEvidence: evidence, costEvidence: evidence, demoData: true },
  { id: "b", name: "Almuerzo (demo)", location: { latitude: -23.55, longitude: -46.64 }, durationMinutes: 60, importance: "high", cost: { amount: 20, currency: "USD", basis: "per_person" }, travelMinutesFromPrevious: 20, travelEvidence: evidence, hoursEvidence: evidence, costEvidence: evidence, demoData: true },
  { id: "c", name: "Mirador (demo)", location: { latitude: -23.57, longitude: -46.66 }, durationMinutes: 45, importance: "optional", cost: { amount: null, currency: "USD", basis: "unknown" }, travelMinutesFromPrevious: null, travelEvidence: { ...evidence, status: "unknown", sourceId: null, observedAt: null }, hoursEvidence: { ...evidence, status: "unknown", sourceId: null, observedAt: null }, costEvidence: { ...evidence, status: "unknown", sourceId: null, observedAt: null }, demoData: true },
];
const now = "2026-10-27T15:00:00Z";

describe("Trip Twin engine", () => {
  it("genera un plan determinista y etiqueta los datos demo", () => {
    const first = buildTripPlan(trip, activities, { now });
    const second = buildTripPlan(trip, activities, { now });
    expect(first).toEqual(second);
    expect(first.demoData).toBe(true);
    expect(first.items).toHaveLength(3);
  });

  it("no trata un coste desconocido como cero ni certifica el presupuesto", () => {
    const plan = buildTripPlan(trip, activities, { now });
    expect(plan.estimatedTotalCost).toBeNull();
    expect(plan.violations.some((v) => v.code === "UNKNOWN_COST" && v.severity === "warning")).toBe(true);
  });

  it("detecta un horario fijo que no deja tiempo para llegar", () => {
    const fixed = { ...activities[1]!, importance: "fixed" as const, fixedStart: "2026-11-04T09:30:00-03:00" };
    const plan = buildTripPlan(trip, [activities[0]!, fixed], { now });
    expect(plan.violations.some((v) => v.code === "FIXED_TIME_CONFLICT")).toBe(true);
    expect(plan.status).toBe("infeasible");
  });

  it("replanifica una cancelación y conserva versión anterior como padre", () => {
    const base = buildTripPlan(trip, activities, { now });
    const result = replanTrip(trip, activities, base, { type: "activity_cancelled", activityId: "b" }, now);
    expect(result.plan.version).toBe(base.version + 1);
    expect(result.plan.parentPlanId).toBe(base.id);
    expect(result.plan.items.some((i) => i.activityId === "b")).toBe(false);
    expect(result.tradeoffs.length).toBeGreaterThan(0);
  });

  it("no permite modificar una actividad completada", () => {
    const base = buildTripPlan(trip, activities, { now, statuses: { a: "completed" } });
    expect(() => replanTrip(trip, activities, base, { type: "activity_cancelled", activityId: "a" }, now)).toThrow("No se puede cancelar una actividad ya completada.");
  });

  it("marca fuera de ventana una actividad", () => {
    const outside = { ...activities[0]!, durationMinutes: 600 };
    const plan = buildTripPlan(trip, [outside], { now });
    expect(plan.violations.some((v) => v.code === "OUTSIDE_TRIP_WINDOW")).toBe(true);
  });
});
