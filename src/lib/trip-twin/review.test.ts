import { describe, expect, it } from "vitest";
import real from "../../../qa/fixtures/day-plan-real.json";
import lookup from "../day/__fixtures__/nominatim-lookup-real.json";
import { dayToTrip } from "../day/toTrip";
import type { DayResponse } from "../day/service";
import type { HourWeather } from "../day/weather";
import { buildTripPlan, replanTrip } from "./engine";
import { reviewTrip, type FreshHoursMap } from "./review";

const day = real as unknown as DayResponse;
const NOW = "2026-11-05T09:00:00.000Z";
const { trip, activities } = dayToTrip(day);
const plan = buildTripPlan(trip, activities, { now: NOW });

// Horarios REALES de OpenStreetMap grabados el 16-nov-2026 (los mismos con los que se armó el día).
const fresh: FreshHoursMap = Object.fromEntries(
  (lookup as unknown as Array<{ osm_type: string; osm_id: number; extratags: Record<string, string> }>)
    .map((r) => [`${r.osm_type}/${r.osm_id}`, { hoursRaw: r.extratags.opening_hours ?? null }]),
);
// Pronóstico REAL grabado para ese jueves: lluvia probable de 11:00 a 24:00 (hasta 84 %).
const rainyAllDay = day.weather!.hours as HourWeather[];
/** Mismo pronóstico real, pero seco desde las 15:00 (se edita la probabilidad para ejercitar la propuesta de horario). */
const dryFrom15: HourWeather[] = rainyAllDay.map((h) => (h.hour >= 15 ? { ...h, rainProb: 10 } : h));

/** El lugar es real; su categoría se fuerza a «Parque» para ejercitar la regla de aire libre (el día real no trae parques). */
const withOutdoorFirst = () => {
  const acts = structuredClone(activities);
  acts[0]!.category = "Parque";
  return acts;
};
const review = (over: Partial<Parameters<typeof reviewTrip>[0]> = {}) =>
  reviewTrip({ trip, activities, plan, date: day.date, weather: rainyAllDay, freshHours: fresh, now: NOW, ...over });

describe("revisar con datos de hoy: sin cambios", () => {
  it("con los mismos horarios y todo bajo techo, no hay hallazgos", () => {
    const r = review();
    expect(r.findings).toEqual([]);
  });
  it("lo que no se pudo evaluar se declara en notas (sin pronóstico → no se evaluó la lluvia)", () => {
    const r = review({ weather: null });
    expect(r.notes.join(" ")).toMatch(/lluvia/i);
  });
  it("sin horarios frescos, se declara que no se verificaron y no se inventa ningún cambio", () => {
    const r = review({ freshHours: {} });
    expect(r.findings).toEqual([]);
    expect(r.notes.join(" ")).toMatch(/horarios/i);
  });
});

describe("revisar con datos de hoy: lluvia", () => {
  it("una parada al aire libre con lluvia probable genera un hallazgo con la probabilidad real", () => {
    const acts = withOutdoorFirst();
    const r = review({ activities: acts, plan: buildTripPlan(trip, acts, { now: NOW }) });
    const f = r.findings.find((x) => x.kind === "lluvia")!;
    expect(f).toBeDefined();
    expect(f.activityId).toBe(acts[0]!.id);
    expect(f.message).toMatch(/\d+ ?%/);
  });
  it("con lluvia todo el día no hay hora seca: no inventa una propuesta y lo dice", () => {
    const acts = withOutdoorFirst();
    const f = review({ activities: acts, plan: buildTripPlan(trip, acts, { now: NOW }) }).findings.find((x) => x.kind === "lluvia")!;
    expect(f.proposal).toBeNull();
    expect(f.message).toMatch(/no encontr/i);
  });
  it("las paradas bajo techo no generan aviso de lluvia aunque llueva todo el día", () => {
    expect(review().findings.filter((x) => x.kind === "lluvia")).toEqual([]);
  });
  it("si hay una hora seca donde cabe, propone retrasar a esa hora y la vista previa no agrega conflictos", () => {
    const acts = withOutdoorFirst();
    const p0 = buildTripPlan(trip, acts, { now: NOW });
    const f = review({ activities: acts, plan: p0, weather: dryFrom15 }).findings.find((x) => x.kind === "lluvia")!;
    expect(f.proposal).not.toBeNull();
    expect(f.proposal!.change).toMatchObject({ type: "delay", activityId: acts[0]!.id });
    const after = replanTrip(trip, acts, p0, f.proposal!.change, NOW).plan;
    const hard = (p: typeof p0) => p.violations.filter((v) => v.severity === "hard").length;
    expect(hard(after)).toBeLessThanOrEqual(hard(p0));
    // la parada propuesta empieza cuando ya no llueve (≥ 15:00 hora local de São Paulo)
    const start = new Date(after.items.find((i) => i.activityId === acts[0]!.id)!.plannedStart).getTime();
    expect(start).toBeGreaterThanOrEqual(Date.parse("2026-11-05T15:00:00-03:00"));
  });
  it("no propone una hora seca si retrasar la parada choca con otra de horario fijo", () => {
    // La 2.ª parada tiene hora fija (su hora real del día). Retrasar la 1.ª hasta las 15:00 la haría solaparse con ella.
    const acts = withOutdoorFirst();
    acts[1]!.importance = "fixed"; acts[1]!.fixedStart = plan.items[1]!.plannedStart;
    const p0 = buildTripPlan(trip, acts, { now: NOW });
    const f = review({ activities: acts, plan: p0, weather: dryFrom15 }).findings.find((x) => x.kind === "lluvia")!;
    expect(f).toBeDefined();
    expect(f.proposal).toBeNull();
    expect(f.message).toMatch(/no encontr/i);
  });
  it("una parada de horario fijo no se mueve sola: hay aviso pero no propuesta", () => {
    const acts = withOutdoorFirst(); acts[0]!.importance = "fixed"; acts[0]!.fixedStart = plan.items[0]!.plannedStart;
    const f = review({ activities: acts, plan: buildTripPlan(trip, acts, { now: NOW }), weather: dryFrom15 }).findings.find((x) => x.kind === "lluvia")!;
    expect(f.proposal).toBeNull();
  });
});

describe("revisar con datos de hoy: horarios", () => {
  const masp = "way/1370081491";
  const mutate = (raw: string): FreshHoursMap => ({ ...fresh, [masp]: { hoursRaw: raw } });

  it("si el horario cambió, muestra el antes y el después con su fuente", () => {
    const f = review({ freshHours: mutate("Tu-Su 10:00-17:00; Th 10:00-17:00") }).findings.find((x) => x.kind === "horario")!;
    expect(f).toBeDefined();
    expect(f.activityName).toMatch(/Museu de Arte/);
    expect(f.before).toMatch(/10:00.*20:00/);
    expect(f.after).toMatch(/10:00.*17:00/);
  });
  it("avisa cuando el nuevo horario ya no cabe a la hora planeada (cierra antes de que termine la visita)", () => {
    const f = review({ freshHours: mutate("Th 10:00-12:00") }).findings.find((x) => x.kind === "horario")!;
    expect(f.message).toMatch(/ya no cabe/i);
  });
  it("aplicar el cambio de horario actualiza la actividad y el plan lo refleja como conflicto", () => {
    const f = review({ freshHours: mutate("Th 10:00-12:00") }).findings.find((x) => x.kind === "horario")!;
    const acts = activities.map((a) => (a.id === f.activityId ? { ...a, ...f.patch } : a));
    const after = buildTripPlan(trip, acts, { now: NOW });
    expect(after.violations.some((v) => v.code === "OUTSIDE_OPENING_HOURS" && v.activityIds.includes(f.activityId))).toBe(true);
    const a = acts.find((x) => x.id === f.activityId)!;
    expect(a.hoursEvidence).toMatchObject({ status: "verified", sourceId: "openstreetmap" });
    expect(a.hoursEvidence.observedAt).toBe(NOW);
  });
  it("si la fuente ya no trae horario de un lugar, se conserva el que había y no se declara cerrado", () => {
    const r = review({ freshHours: { ...fresh, [masp]: { hoursRaw: null } } });
    expect(r.findings.filter((x) => x.kind === "horario")).toEqual([]);
  });
  it("un horario que no se puede interpretar no genera cambios", () => {
    const r = review({ freshHours: mutate("por cita previa") });
    expect(r.findings.filter((x) => x.kind === "horario")).toEqual([]);
  });
  it("un lugar que la fuente no devolvió no se toca", () => {
    const sin = { ...fresh }; delete sin[masp];
    expect(review({ freshHours: sin }).findings).toEqual([]);
  });
});
