import { describe, expect, it } from "vitest";
import type { Dataset } from "@/lib/types";
import { BASE_REQUEST, NOW, SOURCES, makeDataset, makeDestination, makeMonthly, makePrice, makeTrend } from "./__fixtures__/dataset";
import { realityCheck } from "./reality";

const ds = makeDataset();

describe("realityCheck", () => {
  it("elige el primer similar existente, no excluido y con confianza ≥ 40", () => {
    // CUZ.similar = ["ZZZ" (no existe), "AQP"]
    expect(realityCheck(BASE_REQUEST, "CUZ", ds, NOW)?.alternative.destinationId).toBe("AQP");
    // SLA.similar = ["TYO" (sobre presupuesto), "FLN" (confianza < 40), "MDE"]
    expect(realityCheck(BASE_REQUEST, "SLA", ds, NOW)?.alternative.destinationId).toBe("MDE");
  });

  it("filas con etiquetas en español, formato y quién es mejor", () => {
    const r = realityCheck(BASE_REQUEST, "CUZ", ds, NOW);
    expect(r?.rows).toEqual([
      { label: "Costo total", chosen: "US$1.170", alternative: "US$1.000", better: "alternative" },
      { label: "Altitud", chosen: "3.400 m", alternative: "2.335 m", better: "alternative" },
      { label: "Saturación", chosen: "60", alternative: "80", better: "alternative" },
      { label: "Experiencia", chosen: "63", alternative: "60", better: "chosen" },
      { label: "Clima", chosen: "91", alternative: "100", better: "alternative" },
    ]);
  });

  it("hechos numéricos y conclusión determinista sin datos inventados", () => {
    const r = realityCheck(BASE_REQUEST, "CUZ", ds, NOW);
    expect(r?.facts[0]).toBe("Costo total: Cusco US$1.170, Arequipa US$1.000 (diferencia US$170).");
    expect(r?.facts[1]).toBe("Altitud: Cusco 3.400 m, Arequipa 2.335 m (diferencia 1.065 m).");
    expect(r?.conclusion).toBe(
      "Arequipa cuesta US$170 menos y tiene menos altitud, menos gente y mejor clima. Cusco gana en experiencia.",
    );
    expect(realityCheck(BASE_REQUEST, "CUZ", ds, NOW)).toEqual(r);
  });

  it("conclusión cuando el elegido gana en casi todo", () => {
    const r = realityCheck(BASE_REQUEST, "AQP", ds, NOW);
    expect(r?.conclusion).toBe("Cusco tiene mejor ajuste de experiencia. Arequipa gana en precio, altitud, tranquilidad y clima.");
  });

  it("null si el destino no existe, está excluido o no tiene alternativa válida", () => {
    expect(realityCheck(BASE_REQUEST, "XXX", ds, NOW)).toBeNull();
    expect(realityCheck(BASE_REQUEST, "TYO", ds, NOW)).toBeNull();
    expect(realityCheck(BASE_REQUEST, "MDE", ds, NOW)).toBeNull();
  });

  it("empates y datos faltantes", () => {
    const twin: Dataset = {
      destinations: [
        makeDestination("AAA", "Uno", { similar: ["AAA", "BBB"] }),
        makeDestination("BBB", "Dos", { similar: ["AAA"] }),
      ],
      monthly: [makeMonthly("AAA", {}), makeMonthly("BBB", { climate: null })],
      prices: [makePrice("AAA", 400, 400), makePrice("BBB", 400, 400)],
      trends: [makeTrend("AAA", 0, 0), makeTrend("BBB", 0, 0)],
      sources: SOURCES,
    };
    const r = realityCheck(BASE_REQUEST, "AAA", twin, NOW);
    expect(r?.alternative.destinationId).toBe("BBB");
    expect(r?.rows.every((row) => row.better === "tie")).toBe(true);
    expect(r?.rows[4]).toEqual({ label: "Clima", chosen: "100", alternative: "Sin dato", better: "tie" });
    expect(r?.facts).toHaveLength(4);
    expect(r?.conclusion).toBe("Uno y Dos quedan parejos en los datos disponibles.");
  });
});
