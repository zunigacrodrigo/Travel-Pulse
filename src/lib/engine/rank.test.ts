import { describe, expect, it } from "vitest";
import { ENGINE_VERSION, type ScoreResult } from "@/lib/types";
import { BASE_REQUEST, NOW, makeDataset } from "./__fixtures__/dataset";
import {
  TOP_SIZE,
  buildEmptyHelp,
  cheapestDestination,
  compareResults,
  countResults,
  rankDestinations,
  splitTop,
  suggestedBudget,
} from "./rank";

const ds = makeDataset();
const ids = (rs: readonly ScoreResult[]) => rs.map((r) => r.destinationId);

function fake(id: string, rawScore: number, totalUsd: number | null, band: ScoreResult["confidenceBand"] = "normal"): ScoreResult {
  return {
    destinationId: id,
    score: band === "limited" ? null : rawScore,
    rawScore,
    confidence: band === "limited" ? 30 : 80,
    confidenceBand: band,
    confidenceReason: "",
    missing: [],
    factors: [],
    cost: { flightUsd: null, stayUsd: null, totalUsd },
    opportunity: false,
    reason: "",
    engineVersion: ENGINE_VERSION,
  };
}

describe("rankDestinations", () => {
  const r = rankDestinations(BASE_REQUEST, ds, NOW);

  it("ordena por score, con Top de 5, otros y excluidos", () => {
    expect(ids(r.top)).toEqual(["SLA", "AQP", "CUZ", "OAX", "FLN"]);
    expect(r.top).toHaveLength(TOP_SIZE);
    expect(ids(r.others)).toEqual(["UIO", "BOG", "MDE"]);
    expect(r.excluded.map((e) => [e.destinationId, e.reason])).toEqual([
      ["TYO", "over_budget"],
      ["CCS", "max_risk"],
      ["USH", "no_flight"],
    ]);
    expect(r.emptyHelp).toBeNull();
    expect(r.computedAt).toBe(NOW.toISOString());
    expect(r.engineVersion).toBe(ENGINE_VERSION);
  });

  it("empates de score se resuelven por menor costo", () => {
    const [sla, aqp] = r.top;
    expect(sla.rawScore).toBe(aqp.rawScore);
    expect(sla.cost.totalUsd!).toBeLessThan(aqp.cost.totalUsd!);
  });

  it("los de confianza < 40 van al final del Top aunque tengan mayor rawScore", () => {
    const fln = r.top[r.top.length - 1];
    expect(fln.destinationId).toBe("FLN");
    expect(fln.confidenceBand).toBe("limited");
    expect(fln.rawScore).toBeGreaterThan(r.top[0].rawScore);
  });

  it("es determinista", () => {
    expect(rankDestinations(BASE_REQUEST, ds, NOW)).toEqual(r);
  });
});

describe("compareResults y splitTop", () => {
  it("score desc, luego costo asc (desconocido al final), luego id", () => {
    const list = [fake("B", 70, 900), fake("A", 70, 900), fake("C", 70, null), fake("D", 80, 2000), fake("E", 70, 800)];
    expect(ids([...list].sort(compareResults))).toEqual(["D", "E", "A", "B", "C"]);
  });
  it("Top toma los 5 primeros y mueve los limitados al final", () => {
    const sorted = [fake("L1", 99, null, "limited"), fake("A", 90, 1), fake("L2", 85, null, "limited"), fake("B", 80, 1), fake("C", 70, 1), fake("D", 60, 1)];
    const { top, others } = splitTop(sorted);
    expect(ids(top)).toEqual(["A", "B", "C", "L1", "L2"]);
    expect(ids(others)).toEqual(["D"]);
  });
});

describe("emptyHelp", () => {
  it("presupuesto sugerido: costo + 15% redondeado al siguiente múltiplo de 100", () => {
    expect(suggestedBudget(860)).toBe(1000);
    expect(suggestedBudget(1000)).toBe(1200);
    expect(suggestedBudget(2800)).toBe(3300);
  });

  it("se llena cuando no hay resultados con score numérico; sugerencias con su conteo", () => {
    const req = { ...BASE_REQUEST, budgetUsd: 700 };
    const r = rankDestinations(req, ds, NOW);
    expect(r.top.every((x) => x.score === null)).toBe(true);
    expect(r.emptyHelp?.cheapest).toEqual({ destinationId: "SLA", name: "Salta", totalUsd: 860 });
    const s = r.emptyHelp?.suggestions ?? [];
    expect(s.map((x) => [x.kind, x.label, x.resultCount])).toEqual([
      ["raise_budget", "Subir a US$1.000", 5],
      ["fewer_days", "Viajar 5 días en vez de 8", 1],
    ]);
    expect(s[0].request).toEqual({ ...req, budgetUsd: 1000 });
    expect(s[1].request.days).toBe(5);
    expect(countResults(s[0].request, ds, NOW)).toBe(5);
  });

  it("fechas flexibles se modelan como vuelo 15% más barato", () => {
    const req = { ...BASE_REQUEST, budgetUsd: 750 };
    const help = buildEmptyHelp(req, ds, NOW);
    const flex = help.suggestions.find((x) => x.kind === "flexible_dates");
    expect(flex?.label).toBe("Activar fechas flexibles");
    expect(flex?.request.flexibleDates).toBe(true);
    expect(flex?.resultCount).toBe(1); // Salta: 300 × 0,85 + 560 = 815 ≤ 825
  });

  it("no sugiere menos de 3 días ni fechas flexibles si ya están activas", () => {
    const help = buildEmptyHelp({ ...BASE_REQUEST, budgetUsd: 100, days: 3, flexibleDates: true }, ds, NOW);
    expect(help.suggestions.map((x) => x.kind)).toEqual(["raise_budget"]);
  });

  it("con todo excluido, el más barato ignora aviso máximo y destinos sin vuelo", () => {
    const only = makeDataset();
    only.destinations = only.destinations.filter((d) => ["TYO", "CCS", "USH"].includes(d.id));
    const r = rankDestinations(BASE_REQUEST, only, NOW);
    expect(r.top).toEqual([]);
    expect(r.emptyHelp?.cheapest).toEqual({ destinationId: "TYO", name: "Tokio", totalUsd: 2800 });
    expect(r.emptyHelp?.suggestions.map((x) => [x.kind, x.request.budgetUsd, x.resultCount])).toEqual([
      ["raise_budget", 3300, 1],
    ]);
  });

  it("sin destinos: sin más barato y sin sugerencias útiles", () => {
    const empty = { ...makeDataset(), destinations: [] };
    expect(cheapestDestination(BASE_REQUEST, empty, NOW)).toBeNull();
    expect(rankDestinations(BASE_REQUEST, empty, NOW).emptyHelp).toEqual({ cheapest: null, suggestions: [] });
  });
});
