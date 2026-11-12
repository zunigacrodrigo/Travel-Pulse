import { describe, expect, it } from "vitest";
import { FALLBACK_PRICING, PRICING_USD_PER_MTOK, estimateCostUsd } from "./telemetry";
import { MODEL_FABLE, MODEL_HAIKU, MODEL_OPUS, MODEL_SONNET } from "./client";

describe("tarifas de IA", () => {
  it("cubre todos los modelos que la app puede usar", () => {
    for (const m of [MODEL_HAIKU, MODEL_SONNET, MODEL_OPUS, MODEL_FABLE]) expect(PRICING_USD_PER_MTOK[m], m).toBeDefined();
  });
  it("el orden de costo sigue al de capacidad", () => {
    const out = (m: string) => PRICING_USD_PER_MTOK[m]!.outputPerMTok;
    expect(out(MODEL_HAIKU)).toBeLessThan(out(MODEL_SONNET));
    expect(out(MODEL_SONNET)).toBeLessThan(out(MODEL_OPUS));
    expect(out(MODEL_OPUS)).toBeLessThan(out(MODEL_FABLE));
  });
  it("un modelo desconocido nunca cuesta menos que el más caro conocido", () => {
    for (const p of Object.values(PRICING_USD_PER_MTOK)) {
      expect(FALLBACK_PRICING.inputPerMTok).toBeGreaterThanOrEqual(p.inputPerMTok);
      expect(FALLBACK_PRICING.outputPerMTok).toBeGreaterThanOrEqual(p.outputPerMTok);
    }
    expect(estimateCostUsd("modelo-nuevo", 1_000_000, 0)).toBe(FALLBACK_PRICING.inputPerMTok);
  });
  it("calcula un caso a mano: 100 mil entrada y 20 mil salida en Sonnet 5.5", () => {
    expect(estimateCostUsd(MODEL_SONNET, 100_000, 20_000)).toBeCloseTo(0.2 + 0.2, 8);
  });
});
