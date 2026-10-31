import { describe, expect, it } from "vitest";
import { FACTOR_KEYS } from "@/lib/types";
import { BASE_REQUEST, NOW, makeDataset, makePrice } from "./__fixtures__/dataset";
import { compareDestinations } from "./compare";

const ds = makeDataset();

describe("compareDestinations", () => {
  it("filas para los 8 factores con ganador (más alto = mejor)", () => {
    const c = compareDestinations(BASE_REQUEST, "CUZ", "SLA", "precio", ds, NOW);
    expect(c.rows.map((r) => r.key)).toEqual([...FACTOR_KEYS]);
    const row = (k: string) => c.rows.find((r) => r.key === k);
    expect(row("precio")).toMatchObject({ a: 54, b: 92, winner: "b" });
    expect(row("conectividad")?.winner).toBe("a");
    expect(row("experiencia")?.winner).toBe("tie");
  });

  it("prioridad precio: gana el de menor costo total, citando cifras", () => {
    const c = compareDestinations(BASE_REQUEST, "CUZ", "SLA", "precio", ds, NOW);
    expect(c.winner).toBe("b");
    expect(c.priority).toBe("precio");
    expect(c.verdict).toBe("Con prioridad en precio gana Salta: cuesta US$310 menos y su factor precio es 92 frente a 54.");
  });

  it("prioridad experiencia: gana el de mayor ajuste de experiencia", () => {
    const req = { ...BASE_REQUEST, interests: ["cultura" as const] };
    const c = compareDestinations(req, "SLA", "CUZ", "experiencia", ds, NOW);
    expect(c.winner).toBe("b");
    expect(c.verdict).toBe("Con prioridad en experiencia gana Cusco: su ajuste de experiencia es 100 frente a 60.");
  });

  it("prioridad menos gente: gana el de mayor índice de saturación", () => {
    const c = compareDestinations(BASE_REQUEST, "CUZ", "SLA", "menos_gente", ds, NOW);
    expect(c.winner).toBe("b");
    expect(c.verdict).toBe(
      "Con prioridad en menos gente gana Salta: su índice de saturación es 85 frente a 60 (más alto = menos gente).",
    );
  });

  it("empate en la prioridad: decide el score total", () => {
    const c = compareDestinations(BASE_REQUEST, "CUZ", "SLA", "experiencia", ds, NOW);
    expect(c.winner).toBe("b");
    expect(c.verdict).toBe("Con prioridad en experiencia Salta y Cusco empatan; gana Salta por score total 78 frente a 70.");
    const same = compareDestinations(BASE_REQUEST, "CUZ", "CUZ", "precio", ds, NOW);
    expect(same.winner).toBe("a");
    expect(same.verdict).toBe("Con prioridad en precio Cusco y Cusco empatan, también en score total (70).");
  });

  it("empate de prioridad y de score: decide el menor costo", () => {
    // SL2 es una copia de Salta con vuelo más caro; con presupuesto alto ambos tienen precio 100.
    const twin = makeDataset();
    const sla = twin.destinations.find((d) => d.id === "SLA")!;
    twin.destinations.push({ ...sla, id: "SL2", name: "Salta 2" });
    twin.monthly.push({ ...twin.monthly.find((m) => m.destinationId === "SLA")!, destinationId: "SL2" });
    twin.trends.push({ ...twin.trends.find((t) => t.destinationId === "SLA")!, destinationId: "SL2" });
    twin.prices.push(makePrice("SL2", 400, 400));
    const req = { ...BASE_REQUEST, budgetUsd: 5000 };
    const c = compareDestinations(req, "SL2", "SLA", "experiencia", twin, NOW);
    expect(c.a.rawScore).toBe(c.b.rawScore);
    expect(c.winner).toBe("b");
    expect(c.verdict).toBe(
      `Con prioridad en experiencia Salta y Salta 2 empatan, también en score total (${c.a.rawScore}); gana Salta por menor costo: US$860 frente a US$960.`,
    );
  });

  it("datos faltantes", () => {
    const fln = compareDestinations(BASE_REQUEST, "FLN", "CUZ", "precio", ds, NOW);
    expect(fln.winner).toBe("b");
    expect(fln.rows.find((r) => r.key === "precio")).toMatchObject({ a: null, b: 54, winner: "b" });
    expect(fln.verdict).toBe("Con prioridad en precio gana Cusco: su costo es US$1.170 y su factor precio es 54 frente a sin dato.");
    const sat = compareDestinations(BASE_REQUEST, "CUZ", "FLN", "menos_gente", ds, NOW);
    expect(sat.winner).toBe("a");
  });

  it("es determinista, compara destinos excluidos y rechaza ids desconocidos", () => {
    expect(compareDestinations(BASE_REQUEST, "CUZ", "SLA", "precio", ds, NOW)).toEqual(
      compareDestinations(BASE_REQUEST, "CUZ", "SLA", "precio", ds, NOW),
    );
    expect(compareDestinations(BASE_REQUEST, "TYO", "SLA", "precio", ds, NOW).winner).toBe("b");
    expect(() => compareDestinations(BASE_REQUEST, "CUZ", "XXX", "precio", ds, NOW)).toThrow("Destino desconocido: XXX");
    expect(() => compareDestinations(BASE_REQUEST, "XXX", "CUZ", "precio", ds, NOW)).toThrow("Destino desconocido: XXX");
  });
});
