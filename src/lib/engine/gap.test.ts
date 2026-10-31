import { describe, expect, it } from "vitest";
import type { GapRatings } from "@/lib/types";
import { GAP_MIN_RESPONSES, aggregateGap, expectationGap, isValidRatings } from "./gap";

const r = (autenticidad: number, saturacion: number, costo: number, seguridad: number, comida: number): GapRatings => ({
  autenticidad,
  saturacion,
  costo,
  seguridad,
  comida,
});

describe("expectationGap: G = media(r − e)", () => {
  it("calcula por criterio y la media a 1 decimal", () => {
    const g = expectationGap(r(7, 7, 7, 7, 7), r(8, 6, 7, 7, 9));
    expect(g.gap).toBe(0.4);
    expect(g.perCriterion).toEqual({ autenticidad: 1, saturacion: -1, costo: 0, seguridad: 0, comida: 2 });
  });
  it("negativo cuando la realidad queda bajo lo esperado", () => {
    expect(expectationGap(r(9, 9, 9, 9, 9), r(6, 7, 8, 9, 4)).gap).toBe(-2.2);
    expect(expectationGap(r(5, 5, 5, 5, 5), r(5, 5, 5, 5, 5)).gap).toBe(0);
  });
  it("rechaza calificaciones inválidas", () => {
    expect(() => expectationGap(r(0, 5, 5, 5, 5), r(5, 5, 5, 5, 5))).toThrow(RangeError);
    expect(() => expectationGap(r(5, 5, 5, 5, 5), r(5, 5, 5, 5, 11))).toThrow(RangeError);
  });
});

describe("isValidRatings", () => {
  it("exige los 5 criterios con números de 1 a 10", () => {
    expect(isValidRatings(r(1, 10, 5, 5, 5))).toBe(true);
    expect(isValidRatings(r(5.5, 5, 5, 5, 5))).toBe(true);
    expect(isValidRatings(null)).toBe(false);
    expect(isValidRatings("x")).toBe(false);
    expect(isValidRatings({ autenticidad: 5 })).toBe(false);
    expect(isValidRatings({ ...r(5, 5, 5, 5, 5), comida: "5" })).toBe(false);
    expect(isValidRatings(r(5, 5, Number.NaN, 5, 5))).toBe(false);
  });
});

describe("aggregateGap: se publica solo con 10 o más respuestas", () => {
  it("null con menos de 10", () => {
    expect(GAP_MIN_RESPONSES).toBe(10);
    expect(aggregateGap([])).toBeNull();
    expect(aggregateGap(Array(9).fill(1))).toBeNull();
    expect(aggregateGap([...Array(9).fill(1), Number.NaN])).toBeNull();
  });
  it("media a 1 decimal con n ≥ 10", () => {
    expect(aggregateGap(Array(10).fill(-1.2))).toEqual({ gap: -1.2, n: 10 });
    expect(aggregateGap([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 0])).toEqual({ gap: 5, n: 11 });
  });
});
