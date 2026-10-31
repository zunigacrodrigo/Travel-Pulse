import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./client", async (orig) => ({
  ...(await orig<typeof import("./client")>()),
  callJson: vi.fn(),
}));

import { callJson } from "./client";
import { fallbackVerdict, verdictCacheKey, writeVerdict, clearVerdictCache, buildVerdictFacts, VERDICT_SYSTEM } from "./verdict";
import { recentEvents, resetTelemetry } from "./telemetry";
import { destination, makeResult, request } from "./test-fixtures";

const mocked = vi.mocked(callJson);

interface Opts { schema: unknown; model: string; feature?: string; label?: string; system: string; user: string }
type Reply = { data: unknown } | null;

/** Responde según el modelo: Haiku = redactor, Sonnet = crítico. */
function script(writer: Reply, critic: Reply) {
  mocked.mockImplementation((async (o: Opts) => {
    const r = o.model === "claude-haiku-5-5" ? writer : critic;
    return r ? { data: r.data, usage: { model: o.model, inputTokens: 1, outputTokens: 1, latencyMs: 1, costUsd: 0, attempts: 1 } } : null;
  }) as unknown as typeof callJson);
}
const okReview = { supported: true, unsupportedClaims: [], missingOrStale: [], risk: null, unsafeLanguage: false };
const goodText = "Buen momento para ir: noviembre es temporada favorable y el costo total de US$1.180 deja margen en tu presupuesto de US$1.500.";

beforeEach(() => {
  resetTelemetry();
  clearVerdictCache();
  mocked.mockReset();
  vi.spyOn(console, "info").mockImplementation(() => {});
  delete process.env.AI_REQUIRE_CRITIC;
});
afterEach(() => vi.restoreAllMocks());

describe("writeVerdict", () => {
  it("camino feliz: IA + crítico aprueban, warning = risk", async () => {
    script({ data: { verdict: goodText } }, { data: { ...okReview, risk: "La saturación es moderada en esas fechas." } });
    const v = await writeVerdict({ destination, result: makeResult(), request });
    expect(v).toEqual({
      text: goodText,
      aiGenerated: true,
      warning: "La saturación es moderada en esas fechas.",
      model: "claude-haiku-5-5",
    });
    const haiku = mocked.mock.calls.find((c) => c[0].model === "claude-haiku-5-5")![0];
    expect(haiku.timeoutMs).toBeLessThanOrEqual(2500);
    expect(haiku.system).toBe(VERDICT_SYSTEM);
    expect(mocked.mock.calls.find((c) => c[0].model === "claude-sonnet-5-5")).toBeTruthy();
  });

  it("no envía identificadores de usuario al modelo", async () => {
    script({ data: { verdict: goodText } }, { data: okReview });
    await writeVerdict({ destination, result: makeResult(), request });
    const sent = mocked.mock.calls.map((c) => c[0].user).join("\n");
    expect(sent).not.toMatch(/@|anon|userId|email/i);
  });

  it("cifra inventada: rechaza sin llamar al crítico y usa el respaldo", async () => {
    script({ data: { verdict: "Buen momento: el vuelo cuesta US$999 y hay 25 °C." } }, { data: okReview });
    const v = await writeVerdict({ destination, result: makeResult(), request });
    expect(v.aiGenerated).toBe(false);
    expect(v.model).toBeNull();
    expect(mocked.mock.calls.some((c) => c[0].model === "claude-sonnet-5-5")).toBe(false);
    expect(recentEvents().some((e) => e.name === "verdict_rejected" && e.data.reason === "number_mismatch")).toBe(true);
  });

  it("el crítico rechaza (supported=false) -> respaldo", async () => {
    script({ data: { verdict: goodText } }, { data: { ...okReview, supported: false, unsupportedClaims: ["x"] } });
    const v = await writeVerdict({ destination, result: makeResult(), request });
    expect(v.aiGenerated).toBe(false);
    expect(v.text).toMatch(/^Buen momento|^Es un buen momento|^Momento favorable/);
  });

  it("el crítico detecta lenguaje inseguro -> respaldo", async () => {
    script({ data: { verdict: goodText } }, { data: { ...okReview, unsafeLanguage: true } });
    expect((await writeVerdict({ destination, result: makeResult(), request })).aiGenerated).toBe(false);
  });

  it("crítico no disponible -> respaldo por defecto; con AI_REQUIRE_CRITIC=false se acepta si pasó el pre-chequeo", async () => {
    script({ data: { verdict: goodText } }, null);
    expect((await writeVerdict({ destination, result: makeResult(), request })).aiGenerated).toBe(false);

    clearVerdictCache();
    process.env.AI_REQUIRE_CRITIC = "false";
    const v = await writeVerdict({ destination, result: makeResult(), request });
    expect(v.aiGenerated).toBe(true);
  });

  it("el pre-chequeo corre aunque el crítico no esté disponible", async () => {
    process.env.AI_REQUIRE_CRITIC = "false";
    script({ data: { verdict: "Cuesta US$777 en total." } }, null);
    expect((await writeVerdict({ destination, result: makeResult(), request })).aiGenerated).toBe(false);
  });

  it("sin IA (callJson null) -> respaldo", async () => {
    script(null, null);
    const v = await writeVerdict({ destination, result: makeResult(), request });
    expect(v.aiGenerated).toBe(false);
    expect(v.text.length).toBeGreaterThan(20);
  });

  it("caché: segunda llamada con mismo destino+mes+rango no llama al modelo", async () => {
    script({ data: { verdict: goodText } }, { data: okReview });
    const a = await writeVerdict({ destination, result: makeResult({ score: 82 }), request });
    const calls = mocked.mock.calls.length;
    const b = await writeVerdict({ destination, result: makeResult({ score: 84 }), request });
    expect(mocked.mock.calls.length).toBe(calls);
    expect(b).toEqual(a);
    expect(verdictCacheKey("CUZ", 11, 82)).toBe(verdictCacheKey("CUZ", 11, 84));
    expect(verdictCacheKey("CUZ", 11, 85)).not.toBe(verdictCacheKey("CUZ", 11, 84));
  });

  it("caché: no reutiliza texto cuyas cifras ya no coinciden con la petición", async () => {
    script({ data: { verdict: goodText } }, { data: okReview });
    await writeVerdict({ destination, result: makeResult({ score: 82 }), request });
    const cheaper = makeResult({ score: 83, cost: { flightUsd: 400, stayUsd: 300, totalUsd: 700 } });
    cheaper.factors = cheaper.factors.map((f) => (f.key === "precio" ? { ...f, detail: "US$700 de US$900" } : f));
    const before = mocked.mock.calls.length;
    await writeVerdict({ destination, result: cheaper, request: { ...request, budgetUsd: 900 } });
    expect(mocked.mock.calls.length).toBeGreaterThan(before);
  });

  it("caché: expira a las 24 h", async () => {
    script({ data: { verdict: goodText } }, { data: okReview });
    let t = 1_000_000;
    const now = () => t;
    await writeVerdict({ destination, result: makeResult(), request }, { now });
    const n = mocked.mock.calls.length;
    t += 24 * 3600 * 1000 + 1;
    await writeVerdict({ destination, result: makeResult(), request }, { now });
    expect(mocked.mock.calls.length).toBeGreaterThan(n);
  });

  it("confianza limitada: no llama a la IA y explica qué falta", async () => {
    const limited = makeResult({
      score: null,
      rawScore: 41,
      confidence: 25,
      confidenceBand: "limited",
      missing: ["clima", "precio del vuelo"],
    });
    const v = await writeVerdict({ destination, result: limited, request });
    expect(mocked).not.toHaveBeenCalled();
    expect(v.aiGenerated).toBe(false);
    expect(v.text).toContain("datos suficientes");
    expect(v.text).toContain("clima y precio del vuelo");
  });
});

describe("fallbackVerdict", () => {
  it("score alto: texto natural, sin cifras ajenas al resultado", () => {
    const v = fallbackVerdict(makeResult({ opportunity: true }), destination, request);
    expect(v).toMatchObject({ aiGenerated: false, model: null });
    expect(v.text).toMatch(/Buen momento|buen momento|Momento favorable/);
    expect(v.text).toContain("el vuelo está bajo lo habitual");
    expect(v.text).toContain("presupuesto");
    const nums = v.text.match(/\d[\d.,]*/g) ?? [];
    for (const n of nums) expect(buildVerdictFacts(destination, makeResult({ opportunity: true }), request).join(" ")).toContain(n);
    expect(v.text.split(/[.!?](?:\s|$)/).filter(Boolean).length).toBeLessThanOrEqual(2);
  });

  it("menciona la debilidad principal", () => {
    const v = fallbackVerdict(makeResult(), destination, request);
    expect(v.text).toMatch(/afluencia|aglomeración|Eso sí|Ten en cuenta|Lo menos favorable/);
  });

  it("score bajo: lidera con lo débil", () => {
    const low = makeResult({ score: 38, rawScore: 38 }, { precio: 10, clima: 30, temporada: 20, experiencia: 40, saturacion: 35, conectividad: 50, riesgo: 75, tendencia: 45 });
    const v = fallbackVerdict(low, destination, request);
    expect(v.text).toMatch(/^Noviembre no es el mejor momento para ir a Cusco/);
    expect(v.text).toContain("aprieta");
  });

  it("confianza media: advertencia con faltantes", () => {
    const v = fallbackVerdict(makeResult({ confidence: 55, confidenceBand: "warning", missing: ["tendencia"] }), destination, request);
    expect(v.warning).toBe("Confianza media: faltan o están vencidos tendencia.");
  });

  it("confianza < 40: explica falta de datos y qué falta", () => {
    const v = fallbackVerdict(
      makeResult({ score: null, confidence: 30, confidenceBand: "limited", missing: ["clima", "saturación", "tendencia", "riesgo"] }),
      destination,
      request,
    );
    expect(v.text).toContain("Todavía no hay datos suficientes para evaluar Cusco en noviembre");
    expect(v.text).toContain("faltan clima, saturación y tendencia");
    expect(v.text).not.toMatch(/Buen momento/);
  });

  it("varía según los datos", () => {
    const a = fallbackVerdict(makeResult(), destination, request).text;
    const b = fallbackVerdict(makeResult({}, { precio: 40, clima: 95, temporada: 92, experiencia: 60 }), destination, request).text;
    expect(a).not.toBe(b);
  });
});
