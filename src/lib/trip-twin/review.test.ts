import { describe, expect, it } from "vitest";
import ctxReal from "../../../qa/fixtures/contexto-real.json";
import real from "../../../qa/fixtures/day-plan-real.json";
import type { ContextItem } from "../context/types";
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

// ---- Reportes de viajeros ----
// Todavía no existe una comunidad real que reporte: estas señales son DE PRUEBA (se declara así) y solo ejercitan la regla.
import type { PublicSignal } from "../pulsemesh/model";

describe("revisar con datos de hoy: reportes de viajeros (señales de prueba)", () => {
  const masp = activities[0]!;
  const signal = (over: Partial<PublicSignal> = {}): PublicSignal => ({
    id: "t1", cityKey: "sao-paulo-br", category: "condiciones", kind: "cerrado", title: "Cerrado hoy", detail: null, priceAmount: null, priceCurrency: null,
    observedAt: "2026-11-05T08:30:00Z", expiresAt: "2026-11-06T08:30:00Z", independentCount: 3, contradictedCount: 0, state: "corroborada", isMine: false,
    placeId: masp.location.placeId!, placeName: "Museu de Arte de São Paulo", ...over,
  });
  const viajeros = (signals: PublicSignal[] | null | undefined) => review({ signals }).findings.filter((f) => f.kind === "viajeros");

  it("sin la función de reportes (undefined) no cambia nada ni agrega notas", () => {
    expect(review({ signals: undefined }).findings).toEqual([]);
    expect(review({ signals: undefined }).notes.join(" ")).not.toMatch(/viajeros/i);
  });
  it("sin reportes de ese lugar no hay aviso", () => expect(viajeros([])).toEqual([]));
  it("un reporte corroborado por 3 personas de «cerrado» genera un aviso con la propuesta de quitarlo del día", () => {
    const [f] = viajeros([signal()]);
    expect(f).toBeDefined();
    expect(f!.activityId).toBe(masp.id);
    expect(f!.proposal).toMatchObject({ change: { type: "activity_cancelled", activityId: masp.id } });
    expect(f!.message).toMatch(/3 personas/);
    expect(f!.message).toMatch(/no es una fuente oficial/i);
  });
  it("un reporte SIN corroborar (1 persona) no genera aviso: no se mueve el plan por un rumor", () => {
    expect(viajeros([signal({ state: "por_confirmar", independentCount: 1 })])).toEqual([]);
  });
  it("un reporte en disputa no genera aviso", () => {
    expect(viajeros([signal({ state: "en_disputa", independentCount: 1, contradictedCount: 2 })])).toEqual([]);
  });
  it("un reporte caducado no genera aviso", () => {
    expect(viajeros([signal({ expiresAt: "2026-11-05T08:59:00Z" })])).toEqual([]);
  });
  it("un reporte de OTRO lugar no afecta a esta parada", () => {
    expect(viajeros([signal({ placeId: "node/999" })])).toEqual([]);
  });
  it("una fila larga corroborada avisa pero no inventa una propuesta de cambio", () => {
    const [f] = viajeros([signal({ category: "afluencia", kind: "fila_larga" })]);
    expect(f).toBeDefined();
    expect(f!.proposal).toBeNull();
  });
  it("lo positivo (tranquilo, buen estado) no genera aviso", () => {
    expect(viajeros([signal({ category: "afluencia", kind: "tranquilo" })])).toEqual([]);
  });
  it("una parada de horario fijo recibe el aviso pero no se le propone quitarla sola", () => {
    const acts = structuredClone(activities); acts[0]!.importance = "fixed"; acts[0]!.fixedStart = plan.items[0]!.plannedStart;
    const [f] = review({ activities: acts, plan: buildTripPlan(trip, acts, { now: NOW }), signals: [signal()] }).findings.filter((x) => x.kind === "viajeros");
    expect(f).toBeDefined();
    expect(f!.proposal).toBeNull();
  });
  it("si no se pudieron consultar los reportes (null) se declara en las notas, sin inventar avisos", () => {
    const r = review({ signals: null });
    expect(r.notes.join(" ")).toMatch(/reportes de viajeros/i);
    expect(r.findings).toEqual([]);
  });
});

// Contexto REAL grabado el 16-nov-2026 (São Paulo): aire dañino e UV muy alta el 17; además feriado el 20.
const ctxNormal = (ctxReal.normal as { items: ContextItem[] }).items;
const ctxFeriado = (ctxReal.feriado as { items: ContextItem[] }).items;
const dry: HourWeather[] = rainyAllDay.map((h) => ({ ...h, rainProb: 0 }));
const only = (items: ContextItem[], kind: ContextItem["kind"]) => items.filter((i) => i.kind === kind);

describe("revisar con datos de hoy: contexto del día (feriado, aire, UV)", () => {
  it("aire dañino + parada al aire libre → aviso que nombra la parada, sin proponer cambios solos", () => {
    const acts = withOutdoorFirst();
    const r = review({ activities: acts, weather: dry, context: only(ctxNormal, "aire") });
    const f = r.findings.find((x) => x.kind === "contexto" && x.topic === "aire")!;
    expect(f).toBeTruthy();
    expect(f.kind === "contexto" && f.activityNames).toEqual([acts[0]!.name]);
    expect(f.kind === "contexto" && f.proposal).toBeNull();
    expect(f.message).toMatch(/Aire dañino/);
    expect(f.message).toMatch(/pronóstico de modelo, no una medición/);
    expect(f.kind === "contexto" && f.source.name).toMatch(/Open-Meteo/);
  });
  it("si todas las paradas son bajo techo, el aire malo no genera aviso (no hay nada que proteger)", () => {
    expect(review({ weather: dry, context: only(ctxNormal, "aire") }).findings).toEqual([]);
  });
  it("el UV avisa de una parada al aire libre a las 11:01–12:31 (hora de São Paulo) y la nombra", () => {
    const acts = withOutdoorFirst();
    const f = review({ activities: acts, weather: dry, context: only(ctxNormal, "uv") }).findings.find((x) => x.kind === "contexto" && x.topic === "uv")!;
    expect(f.kind === "contexto" && f.activityNames).toEqual([acts[0]!.name]);
    expect(f.message).toMatch(/entre las 11:00 y las 16:00/);
  });
  it("el UV NO avisa de una parada al aire libre a las 18:30–20:00, fuera de las horas centrales", () => {
    const acts = structuredClone(activities);
    acts[3]!.category = "Parque"; // la última parada del día real
    expect(review({ activities: acts, weather: dry, context: only(ctxNormal, "uv") }).findings).toEqual([]);
    // pero el aire malo sí la alcanza: ahí no importa la hora
    expect(review({ activities: acts, weather: dry, context: only(ctxNormal, "aire") }).findings.map((f) => f.kind)).toEqual(["contexto"]);
  });
  it("una parada cancelada o de otro día no cuenta como afectada", () => {
    const acts = withOutdoorFirst();
    const cancelledPlan = structuredClone(plan);
    cancelledPlan.items[0]!.status = "cancelled";
    expect(review({ activities: acts, plan: cancelledPlan, weather: dry, context: only(ctxNormal, "aire") }).findings).toEqual([]);
    const otherDay = structuredClone(plan);
    const shift = (iso: string) => new Date(Date.parse(iso) + 86_400_000).toISOString();
    otherDay.items[0]!.plannedStart = shift(otherDay.items[0]!.plannedStart); otherDay.items[0]!.plannedEnd = shift(otherDay.items[0]!.plannedEnd);
    expect(review({ activities: acts, plan: otherDay, weather: dry, context: only(ctxNormal, "aire") }).findings).toEqual([]);
  });
  it("una categoría desconocida no se asume al aire libre", () => {
    const acts = structuredClone(activities);
    acts[0]!.category = "Algo que no sabemos";
    expect(review({ activities: acts, weather: dry, context: only(ctxNormal, "aire") }).findings).toEqual([]);
  });
  it("un feriado pide confirmar los horarios de TODAS las paradas y admite que no sabe qué cierra", () => {
    const r = review({ weather: dry, context: only(ctxFeriado, "feriado") });
    const f = r.findings.find((x) => x.kind === "contexto" && x.topic === "feriado")!;
    expect(f.kind === "contexto" && f.activityNames).toHaveLength(plan.items.filter((i) => i.status !== "cancelled").length);
    expect(f.message).toMatch(/Dia da Consciência Negra/);
    expect(f.message).toMatch(/No tenemos el dato/);
  });
  it("lo meramente informativo (víspera, aire normal) no genera aviso", () => {
    const calm: ContextItem[] = [{ id: "aire", kind: "aire", severity: "info", title: "Aire bueno", detail: "", source: { name: "x", url: "u" }, certainty: "pronostico" }];
    expect(review({ activities: withOutdoorFirst(), weather: dry, context: calm }).findings).toEqual([]);
  });
  it("sin contexto pedido (undefined) no dice nada; si no se pudo consultar (null) lo declara", () => {
    expect(review({ weather: dry }).notes.join(" ")).not.toMatch(/contexto/i);
    expect(review({ weather: dry, context: null }).notes.join(" ")).toMatch(/contexto del día/);
  });
  it("los avisos de contexto van después de horarios, viajeros y lluvia", () => {
    const acts = withOutdoorFirst();
    const r = review({ activities: acts, context: only(ctxNormal, "aire") });
    expect(r.findings.map((f) => f.kind)).toEqual(["lluvia", "contexto"]);
  });
});
