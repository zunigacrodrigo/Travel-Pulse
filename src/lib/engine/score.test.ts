import { describe, expect, it } from "vitest";
import { BASE_WEIGHTS, ENGINE_VERSION, FACTOR_KEYS, type Dataset, type FactorKey, type ScoreResult } from "@/lib/types";
import {
  BASE_REQUEST,
  NOW,
  SOURCES,
  makeDataset,
  makeDestination,
  makeMonthly,
  makePrice,
  makeTrend,
} from "./__fixtures__/dataset";
import { findDestination } from "./data";
import type { FactorEval } from "./factors";
import {
  REASON_MAX_CHARS,
  buildConfidenceReason,
  buildReason,
  confidenceBand,
  confidenceScore,
  evaluateDestination,
  isExclusion,
  personalizedWeights,
  scoreDestination,
  weightedScore,
} from "./score";

const ds = makeDataset();

function score(id: string, req = BASE_REQUEST, dataset: Dataset = ds): ScoreResult {
  const d = findDestination(dataset, id);
  if (!d) throw new Error(id);
  const r = scoreDestination(req, d, dataset, NOW);
  if (isExclusion(r)) throw new Error(`excluido: ${r.reason}`);
  return r;
}

function factor(r: ScoreResult, key: FactorKey) {
  const f = r.factors.find((x) => x.key === key);
  if (!f) throw new Error(key);
  return f;
}

/** Dataset de un destino "AAA" con vuelo y costo diario configurables (8 días). */
function costDataset(flight: number, daily: number, usual = flight, prevSat?: number, sat = 70): Dataset {
  return {
    destinations: [makeDestination("AAA", "Prueba")],
    monthly: [makeMonthly("AAA", { daily, saturation: sat })],
    prices: [makePrice("AAA", flight, usual)],
    trends: [makeTrend("AAA", 0, 0, prevSat)],
    sources: SOURCES,
  };
}

describe("personalización: Experiencia sube hasta 30% y todo suma 1", () => {
  const sum = (w: Record<FactorKey, number>) => FACTOR_KEYS.reduce((s, k) => s + w[k], 0);
  it("sin intereses = pesos base", () => {
    expect(personalizedWeights([])).toEqual(BASE_WEIGHTS);
  });
  it("+2,5 puntos por interés y el resto se escala proporcionalmente", () => {
    const w = personalizedWeights(["cultura", "comida"]);
    expect(w.experiencia).toBeCloseTo(0.25);
    expect(w.precio).toBeCloseTo(0.25 * (0.75 / 0.8));
    expect(w.precio / w.clima).toBeCloseTo(BASE_WEIGHTS.precio / BASE_WEIGHTS.clima);
    expect(sum(w)).toBeCloseTo(1);
  });
  it("tope 30% (4 o más intereses) y duplicados cuentan una vez", () => {
    expect(personalizedWeights(["cultura", "comida", "playa", "lujo"]).experiencia).toBeCloseTo(0.3);
    const all = personalizedWeights(["aventura", "comida", "cultura", "naturaleza", "playa", "romance", "desconocido", "lujo"]);
    expect(all.experiencia).toBeCloseTo(0.3);
    expect(sum(all)).toBeCloseTo(1);
    expect(personalizedWeights(["cultura", "cultura"]).experiencia).toBeCloseTo(0.225);
  });
  it("el peso efectivo de Experiencia en el resultado respeta el tope", () => {
    const r = score("CUZ", { ...BASE_REQUEST, interests: ["cultura", "comida", "aventura", "naturaleza", "romance"] });
    expect(factor(r, "experiencia").weight).toBeCloseTo(0.3);
  });
});

describe("reponderación por factores faltantes", () => {
  it("S = Σ w_i f_i / Σ w_i sobre los disponibles", () => {
    const values = Object.fromEntries(FACTOR_KEYS.map((k) => [k, null])) as Record<FactorKey, number | null>;
    values.precio = 100;
    values.experiencia = 50;
    expect(weightedScore(values, BASE_WEIGHTS)).toBeCloseTo((0.25 * 100 + 0.2 * 50) / 0.45);
    values.precio = null;
    values.experiencia = null;
    expect(weightedScore(values, BASE_WEIGHTS)).toBe(0);
  });
  it("los pesos efectivos de los disponibles suman 1 y los faltantes pesan 0", () => {
    const r = score("FLN");
    const available = r.factors.filter((f) => f.value !== null);
    expect(available.reduce((s, f) => s + f.weight, 0)).toBeCloseTo(1);
    expect(factor(r, "precio").weight).toBe(0);
    expect(factor(r, "experiencia").weight).toBeCloseTo(0.2 / 0.45);
  });
  it("faltar un factor reponderado no cambia el score si los demás valen lo mismo", () => {
    const values = Object.fromEntries(FACTOR_KEYS.map((k) => [k, 80])) as Record<FactorKey, number | null>;
    values.saturacion = null;
    expect(weightedScore(values, BASE_WEIGHTS)).toBeCloseTo(80);
  });
});

describe("confianza C = Σ w_i q_i × 100", () => {
  const q = (v: number) => Object.fromEntries(FACTOR_KEYS.map((k) => [k, v])) as Record<FactorKey, number>;
  it("faltante cuenta como q = 0 sobre los 8 factores", () => {
    expect(confidenceScore(q(1), BASE_WEIGHTS)).toBe(100);
    const missingPrice = { ...q(1), precio: 0 };
    expect(confidenceScore(missingPrice, BASE_WEIGHTS)).toBe(75);
  });
  it("bandas: < 40 limitada, 40..69 advertencia, ≥ 70 normal", () => {
    expect(confidenceBand(0)).toBe("limited");
    expect(confidenceBand(39)).toBe("limited");
    expect(confidenceBand(40)).toBe("warning");
    expect(confidenceBand(69)).toBe("warning");
    expect(confidenceBand(70)).toBe("normal");
    expect(confidenceBand(100)).toBe("normal");
  });
  it("con confianza < 40 el score publicado es null pero rawScore se calcula", () => {
    const r = score("FLN");
    expect(r.confidence).toBeLessThan(40);
    expect(r.confidenceBand).toBe("limited");
    expect(r.score).toBeNull();
    expect(r.rawScore).toBeGreaterThan(0);
  });
  it("datos completos y frescos → confianza alta y motivo con antigüedad", () => {
    const r = score("CUZ");
    expect(r.confidenceBand).toBe("normal");
    expect(r.score).toBe(r.rawScore);
    expect(r.confidenceReason).toBe("Alta porque los 8 factores tienen datos de los últimos 3 días.");
    expect(r.missing).toEqual([]);
  });
  it("faltantes y vencidos aparecen en el motivo y en `missing`", () => {
    const fln = score("FLN");
    expect(fln.confidenceReason).toBe(
      "Baja: faltan precio de vuelos, clima, saturación y tendencia; datos antiguos en conectividad.",
    );
    expect(fln.missing).toEqual(["Precio de vuelos", "Clima", "Saturación", "Tendencia", "Conectividad (dato antiguo)"]);
    const oax = score("OAX");
    expect(oax.missing).toEqual(["Precio (dato antiguo)"]);
    expect(oax.confidenceReason).toBe("Alta: datos antiguos en precio.");
    expect(factor(oax, "precio").quality).toBeLessThan(factor(score("CUZ"), "precio").quality);
  });
  it("frases de confianza sin faltantes", () => {
    expect(buildConfidenceReason("warning", [], [], 3)).toBe("Media por la fiabilidad de las fuentes disponibles.");
    expect(buildConfidenceReason("normal", [], [], null)).toBe("Alta porque los 8 factores tienen datos vigentes según la frecuencia de cada fuente.");
    expect(buildConfidenceReason("normal", [], [], 280)).toBe("Alta porque los 8 factores tienen datos vigentes según la frecuencia de cada fuente.");
    expect(buildConfidenceReason("limited", ["Saturación"], [], 3)).toBe("Baja: falta saturación.");
  });
});

describe("filtros duros", () => {
  // presupuesto 1.500 → 110% = 1.650; 8 días × US$100 = 800
  it("exactamente 110% del presupuesto NO se excluye; sobre 110% sí", () => {
    const at = costDataset(850, 100);
    const r = scoreDestination(BASE_REQUEST, at.destinations[0], at, NOW);
    expect(isExclusion(r)).toBe(false);
    if (!isExclusion(r)) expect(factor(r, "precio").value).toBe(0);
    const over = costDataset(851, 100);
    const ex = scoreDestination(BASE_REQUEST, over.destinations[0], over, NOW);
    expect(isExclusion(ex) && ex.reason).toBe("over_budget");
    if (isExclusion(ex)) expect(ex.detail).toBe("Costo estimado US$1.651, sobre el 110% del presupuesto de US$1.500.");
  });
  it("costo desconocido no excluye: baja la confianza", () => {
    const fln = score("FLN", { ...BASE_REQUEST, budgetUsd: 100 });
    expect(fln.cost.totalUsd).toBeNull();
  });
  it("aviso oficial máximo (nivel 4) y sin vuelo desde el origen se excluyen", () => {
    const ccs = scoreDestination(BASE_REQUEST, findDestination(ds, "CCS")!, ds, NOW);
    expect(isExclusion(ccs) && ccs.reason).toBe("max_risk");
    const ush = scoreDestination(BASE_REQUEST, findDestination(ds, "USH")!, ds, NOW);
    expect(isExclusion(ush) && ush.reason).toBe("no_flight");
    const tyo = scoreDestination(BASE_REQUEST, findDestination(ds, "TYO")!, ds, NOW);
    expect(isExclusion(tyo) && tyo.reason).toBe("over_budget");
  });
  it("evaluateDestination calcula aunque el destino no pase los filtros", () => {
    const tyo = evaluateDestination(BASE_REQUEST, findDestination(ds, "TYO")!, ds, NOW);
    expect(tyo.cost.totalUsd).toBe(2800);
    expect(factor(tyo, "precio").value).toBe(0);
  });
});

describe("Opportunity Index", () => {
  it("sube con vuelo ≥ 10% bajo lo habitual y saturación mejor que el mes anterior", () => {
    expect(score("CUZ").opportunity).toBe(true);
    const ok = costDataset(450, 50, 500, 60, 70);
    expect(score("AAA", BASE_REQUEST, ok).opportunity).toBe(true);
  });
  it("no sube con vuelo 9% bajo lo habitual", () => {
    expect(score("AAA", BASE_REQUEST, costDataset(455, 50, 500, 60, 70)).opportunity).toBe(false);
  });
  it("no sube si la saturación no mejora o falta el mes anterior", () => {
    expect(score("AAA", BASE_REQUEST, costDataset(450, 50, 500, 70, 70)).opportunity).toBe(false);
    expect(score("AAA", BASE_REQUEST, costDataset(450, 50, 500, undefined, 70)).opportunity).toBe(false);
    expect(score("FLN").opportunity).toBe(false);
  });
  it("no presenta una oportunidad cuando el precio de referencia está vencido", () => {
    const dataset = costDataset(450, 50, 500, 60, 70);
    dataset.prices[0]!.flightUsd.observedAt = "2026-09-01";
    expect(score("AAA", BASE_REQUEST, dataset).opportunity).toBe(false);
  });
});

describe("razón en una línea", () => {
  it("es determinista, ≤ 90 caracteres y usa los factores con mayor aporte", () => {
    for (const id of ["CUZ", "AQP", "SLA", "MDE", "OAX", "FLN"]) {
      const a = score(id);
      expect(a.reason).toBe(score(id).reason);
      expect(a.reason.length).toBeLessThanOrEqual(REASON_MAX_CHARS);
      expect(a.reason.endsWith(".")).toBe(true);
    }
    expect(score("SLA").reason).toBe("Cabe holgado en el presupuesto, buen clima y experiencia variada.");
  });
  it("agrega el factor más débil si es notable (< 40)", () => {
    expect(score("MDE").reason).toBe("Buen clima, buen mes para ir y riesgo bajo, pero tendencia desfavorable.");
  });
  it("acorta si supera 90 caracteres y cae a un texto neutro sin factores fuertes", () => {
    const base: FactorEval = {
      key: "precio",
      value: 90,
      quality: 1,
      stale: false,
      sourceName: "x",
      observedAt: null,
      ageDays: null,
      detail: "",
      missingLabel: null,
      strongPhrase: "una frase fuerte bastante larga para forzar el recorte",
      weakPhrase: "una frase débil también bastante larga",
    };
    const evals = Object.fromEntries(
      FACTOR_KEYS.map((k, i) => [k, { ...base, key: k, value: i === 7 ? 10 : 90 - i }]),
    ) as Record<FactorKey, FactorEval>;
    const reason = buildReason(evals, BASE_WEIGHTS);
    expect(reason.length).toBeLessThanOrEqual(REASON_MAX_CHARS);
    expect(reason).toBe("Una frase fuerte bastante larga para forzar el recorte.");
    const flat = Object.fromEntries(FACTOR_KEYS.map((k) => [k, { ...base, key: k, value: 50 }])) as Record<FactorKey, FactorEval>;
    expect(buildReason(flat, BASE_WEIGHTS)).toBe("Sin factores destacados.");
  });
});

describe("resultado", () => {
  it("incluye 8 factores, costo, versión y score entero", () => {
    const r = score("CUZ");
    expect(r.factors.map((f) => f.key)).toEqual([...FACTOR_KEYS]);
    expect(r.cost).toEqual({ flightUsd: 610, stayUsd: 560, totalUsd: 1170 });
    expect(r.engineVersion).toBe(ENGINE_VERSION);
    expect(Number.isInteger(r.rawScore)).toBe(true);
    expect(factor(r, "precio").detail).toBe("US$1.170 de US$1.500, vuelo 13% bajo lo habitual");
    expect(factor(r, "precio").sourceName).toBe("Amadeus / Curaduría Travel Pulse");
  });
});
