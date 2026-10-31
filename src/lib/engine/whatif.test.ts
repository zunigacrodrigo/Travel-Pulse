import { describe, expect, it } from "vitest";
import { FACTOR_KEYS } from "@/lib/types";
import { BASE_REQUEST, FRESH, NOW, makeDataset, makeMonthly, makePrice } from "./__fixtures__/dataset";
import { applyChange, describeChanges, whatIf } from "./whatif";

const ds = makeDataset();

describe("applyChange / describeChanges", () => {
  it("no muta la petición original y solo cambia lo pedido", () => {
    const req = { ...BASE_REQUEST, interests: ["cultura" as const] };
    const next = applyChange(req, { days: 10 });
    expect(next).toMatchObject({ days: 10, budgetUsd: req.budgetUsd, month: req.month });
    expect(next.interests).toEqual(["cultura"]);
    expect(next.interests).not.toBe(req.interests);
    expect(req.days).toBe(8);
  });

  it("describe cada cambio y nada más", () => {
    const to = applyChange(BASE_REQUEST, { days: 6, budgetUsd: 1200, month: 1, travelers: 2, flexibleDates: true });
    expect(describeChanges(BASE_REQUEST, to)).toEqual([
      "−2 días (8 → 6)",
      "presupuesto US$1.500 → US$1.200",
      "mes noviembre → enero",
      "viajeros 1 → 2",
      "fechas flexibles no → sí",
    ]);
    expect(describeChanges(BASE_REQUEST, BASE_REQUEST)).toEqual([]);
  });

  it("singular para un día", () => {
    expect(describeChanges(BASE_REQUEST, applyChange(BASE_REQUEST, { days: 9 }))).toEqual(["+1 día (8 → 9)"]);
  });
});

describe("whatIf", () => {
  it("agregar días suma exactamente costo diario × días × viajeros", () => {
    const r = whatIf(BASE_REQUEST, "CUZ", { days: 10 }, ds, NOW);
    // Cusco: US$70/día, 1 viajero; vuelo US$610 sin fechas flexibles.
    expect(r.stayUsd).toEqual({ baseline: 560, scenario: 700, diff: 140 });
    expect(r.flightUsd).toEqual({ baseline: 610, scenario: 610, diff: 0 });
    expect(r.totalUsd).toEqual({ baseline: 1170, scenario: 1310, diff: 140 });
    expect(r.changes).toEqual(["+2 días (8 → 10)"]);
    expect(r.verdict).toContain("el costo estimado sube US$140 (de US$1.170 a US$1.310)");
    expect(r.scenarioOverBudget).toBe(false);
  });

  it("devuelve los 8 factores con su diferencia", () => {
    const r = whatIf(BASE_REQUEST, "CUZ", { budgetUsd: 1000 }, ds, NOW);
    expect(r.factors.map((f) => f.key)).toEqual([...FACTOR_KEYS]);
    const precio = r.factors.find((f) => f.key === "precio")!;
    expect(precio.diff).toBe((precio.scenario as number) - (precio.baseline as number));
    expect(precio.diff as number).toBeLessThan(0);
    // Un cambio de presupuesto no toca los demás factores del destino.
    expect(r.factors.find((f) => f.key === "clima")!.diff).toBe(0);
  });

  it("reducir el presupuesto por debajo del costo marca el escenario como excedido", () => {
    const r = whatIf(BASE_REQUEST, "CUZ", { budgetUsd: 1000 }, ds, NOW);
    expect(r.scenarioOverBudget).toBe(true); // 1170 > 110 % de 1000
    expect(r.verdict).toContain("supera el 110 % del presupuesto de US$1.000");
    expect(r.score.diff as number).toBeLessThan(0);
  });

  it("más viajeros multiplican vuelo y estadía", () => {
    const r = whatIf(BASE_REQUEST, "CUZ", { travelers: 2 }, ds, NOW);
    expect(r.flightUsd).toEqual({ baseline: 610, scenario: 1220, diff: 610 });
    expect(r.stayUsd).toEqual({ baseline: 560, scenario: 1120, diff: 560 });
  });

  it("cambiar el mes usa el dataset del mes del escenario", () => {
    // Dataset de diciembre: Cusco cuesta US$100/día y el vuelo US$900.
    const december = makeDataset();
    december.monthly = [makeMonthly("CUZ", { daily: 100 }, 12)];
    december.prices = [makePrice("CUZ", 900, 700, FRESH, "SCL", 12)];
    const r = whatIf(BASE_REQUEST, "CUZ", { month: 12 }, ds, NOW, december);
    expect(r.changes).toEqual(["mes noviembre → diciembre"]);
    expect(r.stayUsd).toEqual({ baseline: 560, scenario: 800, diff: 240 });
    expect(r.flightUsd).toEqual({ baseline: 610, scenario: 900, diff: 290 });
    expect(r.totalUsd.diff).toBe(530);
  });

  it("si el mes cambia y no se pasa su dataset, no hay datos del mes: no se inventan", () => {
    // Sin dataset de diciembre, el escenario no encuentra precio ni costo diario.
    const r = whatIf(BASE_REQUEST, "CUZ", { month: 12 }, ds, NOW);
    expect(r.totalUsd.baseline).toBe(1170);
    expect(r.totalUsd.scenario).toBeNull();
    expect(r.totalUsd.diff).toBeNull();
  });

  it("rechaza un escenario idéntico al plan", () => {
    expect(() => whatIf(BASE_REQUEST, "CUZ", { days: BASE_REQUEST.days }, ds, NOW)).toThrow(/no cambia nada/);
    expect(() => whatIf(BASE_REQUEST, "CUZ", {}, ds, NOW)).toThrow(/no cambia nada/);
  });

  it("rechaza un destino desconocido", () => {
    expect(() => whatIf(BASE_REQUEST, "ZZZ", { days: 9 }, ds, NOW)).toThrow(/Destino desconocido: ZZZ/);
  });

  it("sin dato de costo no inventa cifras: diff null y veredicto honesto", () => {
    // Florianópolis tiene costo diario pero ningún precio de vuelo en el fixture: su total es desconocido.
    const r = whatIf(BASE_REQUEST, "FLN", { days: 10 }, ds, NOW);
    expect(r.totalUsd.baseline).toBeNull();
    expect(r.totalUsd.diff).toBeNull();
    expect(r.verdict).toContain("no tiene datos suficientes");
    expect(r.scenarioOverBudget).toBe(false);
  });

  it("es determinista", () => {
    const a = whatIf(BASE_REQUEST, "SLA", { days: 5, travelers: 2 }, ds, NOW);
    const b = whatIf(BASE_REQUEST, "SLA", { days: 5, travelers: 2 }, ds, NOW);
    expect(a).toEqual(b);
  });
});
