import { describe, expect, it } from "vitest";
import real from "../../../qa/fixtures/day-plan-real.json";
import { buildTripPlan } from "@/lib/trip-twin/engine";
import { activitySchema, tripSchema } from "@/lib/trip-twin/types";
import { dayToTrip } from "./toTrip";
import type { DayResponse } from "./service";

const day = real as unknown as DayResponse;
const NOW = "2026-11-16T12:00:00.000Z";
const toMs = (d: string, min: number, offset = "-03:00") => Date.parse(`${d}T00:00:00${offset}`) + min * 60_000;

describe("Mi día → Mi viaje (con un día REAL grabado de São Paulo)", () => {
  const { trip, activities } = dayToTrip(day);
  const plan = buildTripPlan(trip, activities, { now: NOW });

  it("produce un viaje y actividades válidos para Trip Twin", () => {
    expect(tripSchema.safeParse(trip).success).toBe(true);
    for (const a of activities) expect(activitySchema.safeParse(a).success).toBe(true);
    expect(activities).toHaveLength(day.plan.stops.length);
    expect(new Set(activities.map((a) => a.id)).size).toBe(activities.length);
  });
  it("reproduce las mismas horas del día armado", () => {
    expect(plan.items).toHaveLength(day.plan.stops.length);
    day.plan.stops.forEach((s, i) => {
      expect(Date.parse(plan.items[i]!.plannedStart), s.place.name).toBe(toMs(day.date, s.startMin));
      expect(Date.parse(plan.items[i]!.plannedEnd), s.place.name).toBe(toMs(day.date, s.endMin));
    });
  });
  it("no introduce conflictos que el día original no tenía", () => {
    expect(plan.violations.filter((v) => v.severity === "hard")).toEqual([]);
  });
  it("conserva los horarios de apertura como ventanas y su fuente", () => {
    for (const a of activities) {
      expect(a.openingHours?.length ?? 0).toBeGreaterThan(0);
      expect(a.hoursEvidence).toMatchObject({ status: "verified", sourceId: "openstreetmap", observedAt: day.generatedAt });
    }
  });
  it("conserva los traslados reales con su fuente; el primero no tiene traslado previo en el plan", () => {
    expect(activities[1]!.travelMinutesFromPrevious).toBe(day.plan.stops[1]!.travel!.minutes);
    expect(activities[1]!.travelEvidence).toMatchObject({ status: "verified", sourceId: "osrm-fossgis" });
  });
  it("no inventa precios: el costo queda desconocido", () => {
    for (const a of activities) { expect(a.cost.amount).toBeNull(); expect(a.costEvidence.status).toBe("unknown"); }
    expect(plan.estimatedTotalCost).toBeNull();
  });
  it("no marca nada como dato de ejemplo", () => {
    expect(plan.demoData).toBe(false);
    expect(activities.every((a) => a.demoData === false)).toBe(true);
  });
  it("el pub conserva su hora mínima (no antes de las 18:30) y se puede cancelar/mover como cualquier parada", () => {
    const pub = activities.find((a) => a.category === "Pub o bar")!;
    expect(pub.importance).not.toBe("fixed");
    expect(Date.parse(pub.startNotBefore!)).toBe(toMs(day.date, 18 * 60 + 30));
  });
  it("sin traslado conocido, la parada conserva su hora con una hora mínima y el plan lo declara", () => {
    const sin = structuredClone(day);
    sin.plan.stops[1]!.travel = null;
    const t = dayToTrip(sin);
    expect(t.activities[1]!.travelMinutesFromPrevious).toBeNull();
    expect(t.activities[1]!.travelEvidence.status).toBe("unknown");
    const p = buildTripPlan(t.trip, t.activities, { now: NOW });
    expect(Date.parse(p.items[1]!.plannedStart)).toBe(toMs(day.date, sin.plan.stops[1]!.startMin));
  });
  it("un día sin paradas no se convierte en un viaje vacío", () => {
    const vacio = structuredClone(day); vacio.plan.stops = [];
    expect(() => dayToTrip(vacio)).toThrow(/sin paradas/i);
  });
});
