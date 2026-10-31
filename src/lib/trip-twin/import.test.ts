import { describe, expect, it } from "vitest";
import { addDays, buildImportedTrip, parseItinerary, zonedIso } from "./import";
import { buildTripPlan } from "./engine";

const SAMPLE = `Itinerario:
Día 1 - 4 nov
09:00 Museo de Arte (2 h)
12:30 Almuerzo en Mercado Central US$15
Visitar el parque
Día 2
10:00-12:00 Tour histórico
- Cena en barrio italiano
Alojamiento: Hotel Centro`;

describe("parseItinerary", () => {
  const p = parseItinerary(SAMPLE);
  it("separa días y actividades", () => {
    expect(p.days.map((d) => d.items.length)).toEqual([3, 2]);
    expect(p.days[0]!.dateHint).toEqual({ month: 11, day: 4 });
  });
  it("marca como proporcionado solo lo que el usuario escribió", () => {
    const [museo, almuerzo, parque] = p.days[0]!.items;
    expect(museo).toMatchObject({ name: "Museo de Arte", startTime: "09:00", durationMinutes: 120 });
    expect(almuerzo!.cost).toEqual({ amount: 15, currency: "USD" });
    expect(parque).toMatchObject({ startTime: null, durationMinutes: null });
    expect(parque!.provenance).toEqual({ time: "unknown", duration: "unknown", cost: "unknown" });
  });
  it("calcula la duración de un rango horario", () => {
    expect(p.days[1]!.items[0]).toMatchObject({ startTime: "10:00", durationMinutes: 120 });
  });
  it("deja el alojamiento como nota pendiente, no como actividad", () => {
    expect(p.notes).toEqual(["Alojamiento: Hotel Centro"]);
  });
  it("avisa cuando no hay encabezados de día", () => {
    const q = parseItinerary("09:00 Paseo\n14:00 Cena");
    expect(q.days).toHaveLength(1);
    expect(q.warnings.join(" ")).toMatch(/Día 1/);
  });
  it("no inventa actividades de un texto vacío", () => {
    expect(parseItinerary("   \n").days).toHaveLength(0);
  });
  it("trata un '$' sin moneda como ambiguo", () => {
    const q = parseItinerary("Día 1\n10:00 Entrada $20");
    expect(q.days[0]!.items[0]!.cost).toEqual({ amount: 20, currency: null });
    expect(q.warnings.join(" ")).toMatch(/moneda/);
  });
});

describe("zonedIso", () => {
  it("aplica el horario de verano de Santiago", () => {
    expect(zonedIso("2026-11-04", 9 * 60, "America/Santiago")).toBe("2026-11-04T09:00:00-03:00");
  });
  it("usa el desfase de São Paulo", () => {
    expect(zonedIso("2026-11-04", 9 * 60, "America/Sao_Paulo")).toBe("2026-11-04T09:00:00-03:00");
  });
  it("suma días de calendario", () => { expect(addDays("2026-11-30", 1)).toBe("2026-12-01"); });
});

describe("buildImportedTrip", () => {
  const input = { destination: "Santiago, Chile", coordinates: { latitude: -33.45, longitude: -70.66 }, timeZone: "America/Santiago", startDate: "2026-11-04", travelers: 1, currency: "USD", parsed: parseItinerary(SAMPLE), now: "2026-10-28T12:00:00Z" };
  it("conserva lo desconocido como desconocido y las horas del usuario como fijas", () => {
    const { activities } = buildImportedTrip(input);
    expect(activities).toHaveLength(5);
    const museo = activities[0]!;
    expect(museo.importance).toBe("fixed");
    expect(museo.fixedStart).toBe("2026-11-04T09:00:00-03:00");
    const parque = activities[2]!;
    expect(parque.importance).toBe("normal");
    expect(parque.travelEvidence.status).toBe("unknown");
    expect(parque.costEvidence.status).toBe("unknown");
    expect(activities[1]!.cost.amount).toBe(15);
  });
  it("produce un viaje que el motor de Trip Twin acepta", () => {
    const { trip, activities } = buildImportedTrip(input);
    const plan = buildTripPlan(trip, activities, { now: input.now });
    expect(plan.items.length).toBe(5);
  });
  it("falla si no hay actividades", () => {
    expect(() => buildImportedTrip({ ...input, parsed: { days: [], notes: [], warnings: [] } })).toThrow();
  });
});
