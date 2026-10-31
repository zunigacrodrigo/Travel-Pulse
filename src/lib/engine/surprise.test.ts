import { describe, expect, it } from "vitest";
import { ENGINE_VERSION, type ScoreResult } from "@/lib/types";
import { BASE_REQUEST, NOW, makeDataset } from "./__fixtures__/dataset";
import { rankDestinations } from "./rank";
import { flightWarning, seededRandom, surprise, weightedPick } from "./surprise";

const ds = makeDataset();

function withCost(flightUsd: number | null, totalUsd: number | null): ScoreResult {
  return {
    destinationId: "X",
    score: 70,
    rawScore: 70,
    confidence: 80,
    confidenceBand: "normal",
    confidenceReason: "",
    missing: [],
    factors: [],
    cost: { flightUsd, stayUsd: null, totalUsd },
    opportunity: false,
    reason: "",
    engineVersion: ENGINE_VERSION,
  };
}

describe("surprise", () => {
  const top5 = rankDestinations(BASE_REQUEST, ds, NOW).top.slice(0, 5).map((r) => r.destinationId);

  it("nunca devuelve el Top 5, excluidos, confianza < 40 ni score < 60", () => {
    expect(top5).toHaveLength(5);
    const picked = new Set<string>();
    for (let seed = 0; seed < 40; seed++) {
      const s = surprise(BASE_REQUEST, ds, NOW, [], seed);
      expect(s).not.toBeNull();
      const r = s!.result;
      picked.add(r.destinationId);
      expect(top5).not.toContain(r.destinationId);
      expect(r.confidence).toBeGreaterThanOrEqual(40);
      expect(r.score!).toBeGreaterThanOrEqual(60);
    }
    // Candidatos válidos fuera del Top 5: UIO (desconocido 5), BOG (4) y MDE (2); el sorteo alcanza a todos.
    expect([...picked].sort()).toEqual(["BOG", "MDE", "UIO"]);
  });

  it("es determinista para una misma semilla", () => {
    for (const seed of [1, 7, 42, 2026]) {
      expect(surprise(BASE_REQUEST, ds, NOW, [], seed)).toEqual(surprise(BASE_REQUEST, ds, NOW, [], seed));
    }
  });

  it("respeta `exclude` y devuelve null sin candidatos", () => {
    const s = surprise(BASE_REQUEST, ds, NOW, ["UIO", "BOG"], 3);
    expect(s?.result.destinationId).toBe("MDE");
    expect(s?.warning).toBeNull(); // vuelo 450 de 1.090 = 41%
    expect(surprise(BASE_REQUEST, ds, NOW, ["UIO", "BOG", "MDE"], 3)).toBeNull();
  });

  it("advierte cuando el vuelo pesa ≥ 45% del gasto, con número real", () => {
    let uio = null;
    for (let seed = 0; seed < 40 && !uio; seed++) {
      const s = surprise(BASE_REQUEST, ds, NOW, ["MDE", "BOG"], seed);
      if (s?.result.destinationId === "UIO") uio = s;
    }
    // Quito: vuelo US$700 de US$1.060 = 66%; fechas flexibles ahorran 15% de 700 = US$105.
    expect(uio?.warning).toBe("Ojo con el vuelo: es el 66% del gasto. Con fechas flexibles podrías ahorrar cerca de US$105.");
  });
});

describe("flightWarning", () => {
  it("umbral 45% y sugerencia de fechas flexibles solo si no están activas", () => {
    expect(flightWarning(withCost(440, 1000), false)).toBeNull();
    expect(flightWarning(withCost(450, 1000), false)).toBe(
      "Ojo con el vuelo: es el 45% del gasto. Con fechas flexibles podrías ahorrar cerca de US$68.",
    );
    expect(flightWarning(withCost(550, 1000), true)).toBe("Ojo con el vuelo: es el 55% del gasto.");
    expect(flightWarning(withCost(null, 1000), false)).toBeNull();
    expect(flightWarning(withCost(100, 0), false)).toBeNull();
  });
});

describe("azar determinista", () => {
  it("seededRandom está en [0, 1) y depende solo de la semilla", () => {
    for (let s = -5; s < 50; s++) {
      const v = seededRandom(s);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      expect(seededRandom(s)).toBe(v);
    }
  });
  it("weightedPick respeta los pesos", () => {
    const items = ["a", "b", "c"];
    const w = (x: string) => ({ a: 1, b: 2, c: 1 })[x] ?? 0;
    expect(weightedPick(items, w, 0)).toBe("a");
    expect(weightedPick(items, w, 0.3)).toBe("b");
    expect(weightedPick(items, w, 0.99)).toBe("c");
    expect(weightedPick(items, () => 0, 0.5)).toBe("b");
    expect(weightedPick(items, w, 1)).toBe("c");
  });
});
