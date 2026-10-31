import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./client", async (orig) => ({
  ...(await orig<typeof import("./client")>()),
  callJson: vi.fn(),
}));

import { callJson } from "./client";
import { interpretFreeText, keywordInterpret, stripPII } from "./interpret";
import { explainCompare, explainReality } from "./explain";
import { resetTelemetry } from "./telemetry";
import { destination, makeResult } from "./test-fixtures";
import type { CompareResult, RealityCheckResult } from "../types";

const mocked = vi.mocked(callJson);
const usage = { model: "m", inputTokens: 1, outputTokens: 1, latencyMs: 1, costUsd: 0, attempts: 1 };

beforeEach(() => {
  resetTelemetry();
  mocked.mockReset();
  mocked.mockResolvedValue(null);
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("stripPII", () => {
  it("quita correos, teléfonos, RUT y URLs", () => {
    const out = stripPII(
      "Soy ana@correo.cl, mi fono +56 9 8765 4321 o 912345678, RUT 12.345.678-5, mira https://x.cl/p y quiero playa",
    );
    expect(out).not.toMatch(/@|8765|912345678|12\.345|https/);
    expect(out).toContain("quiero playa");
  });
  it("conserva presupuesto y días", () => {
    expect(stripPII("tengo 1500 dólares y 7 días, US$ 2.000")).toBe("tengo 1500 dólares y 7 días, US$ 2.000");
  });
});

describe("interpretFreeText", () => {
  it("no envía PII al modelo", async () => {
    await interpretFreeText("quiero playa, escríbeme a juan@mail.com o al +56 9 1111 2222");
    const sent = mocked.mock.calls[0][0].user;
    expect(sent).toContain("quiero playa");
    expect(sent).not.toMatch(/juan@|1111/);
  });

  it("respaldo por palabras clave", () => {
    expect(keywordInterpret("quiero algo tranquilo y barato").interests).toEqual(["naturaleza", "desconocido"]);
    expect(keywordInterpret("quiero algo tranquilo y barato").budgetUsd).toBeUndefined();
    expect(keywordInterpret("playa y comer rico").interests).toEqual(["comida", "playa"]);
    expect(keywordInterpret("montaña y trekking").interests).toEqual(["aventura", "naturaleza"]);
    expect(keywordInterpret("luna de miel").interests).toEqual(["romance"]);
    expect(keywordInterpret("viaje en pareja con fiesta").interests).toEqual(["comida", "cultura", "romance"]);
    expect(keywordInterpret("sin turistas").interests).toEqual(["desconocido"]);
  });

  it("extrae presupuesto, días y mes sin IA", async () => {
    const r = await interpretFreeText("Playa en noviembre, 10 días, presupuesto US$2.500");
    expect(r).toEqual({ interests: ["playa"], budgetUsd: 2500, days: 10, month: 11 });
    expect(keywordInterpret("dos semanas con 3 mil dólares")).toMatchObject({ days: 14, budgetUsd: 3000 });
    expect(keywordInterpret("un fin de semana")).toMatchObject({ days: 3 });
  });

  it("texto vacío -> sin llamar al modelo", async () => {
    expect(await interpretFreeText("   ")).toEqual({ interests: [] });
    expect(mocked).not.toHaveBeenCalled();
  });

  it("usa la salida del LLM, valida intereses y descarta cifras inventadas", async () => {
    mocked.mockResolvedValue({
      data: { interests: ["cultura", "inventado", "comida"], budgetUsd: 9999, days: 5, month: 13 },
      usage,
    });
    const r = await interpretFreeText("museos y buena comida");
    expect(r).toEqual({ interests: ["comida", "cultura"] });
    expect(mocked.mock.calls[0][0].feature).toBe("nonEssential");
  });
});

describe("explain*", () => {
  const reality: RealityCheckResult = {
    chosen: makeResult(),
    alternative: makeResult({ destinationId: "SLA" }),
    rows: [{ label: "Costo total", chosen: "US$1.180", alternative: "US$900", better: "alternative" }],
    facts: ["Cusco cuesta US$1.180 y Salta US$900"],
    conclusion: "Conclusión del motor.",
  };
  const alt = { ...destination, id: "SLA", name: "Salta" };

  it("Reality: sin IA devuelve la conclusión del motor", async () => {
    expect(await explainReality(reality, destination, alt)).toEqual({
      text: "Conclusión del motor.",
      aiGenerated: false,
      warning: null,
      model: null,
    });
  });

  it("Reality: con IA aprobada y marcada nonEssential", async () => {
    mocked
      .mockResolvedValueOnce({
        data: { conclusion: "Salta sale más barata, US$900 frente a US$1.180. Cusco compensa si priorizas la experiencia." },
        usage,
      })
      .mockResolvedValueOnce({
        data: { supported: true, unsupportedClaims: [], missingOrStale: [], risk: null, unsafeLanguage: false },
        usage,
      });
    const v = await explainReality(reality, destination, alt);
    expect(v.aiGenerated).toBe(true);
    expect(v.model).toBe("claude-sonnet-5-5");
    expect(mocked.mock.calls.every((c) => c[0].feature === "nonEssential")).toBe(true);
  });

  it("Reality: cifra inventada -> conclusión del motor", async () => {
    mocked.mockResolvedValue({ data: { conclusion: "Salta ahorra US$450 frente a Cusco. Es mejor idea." }, usage });
    const v = await explainReality(reality, destination, alt);
    expect(v.aiGenerated).toBe(false);
    expect(v.text).toBe("Conclusión del motor.");
  });

  it("Compare: respaldo = verdict del motor", async () => {
    const compare: CompareResult = {
      a: makeResult(),
      b: makeResult({ destinationId: "SLA" }),
      rows: [{ key: "precio", label: "Precio", a: 80, b: 60, winner: "a" }],
      priority: "precio",
      winner: "a",
      verdict: "Gana Cusco por precio.",
    };
    const v = await explainCompare(compare, destination, alt);
    expect(v.text).toBe("Gana Cusco por precio.");
    expect(v.aiGenerated).toBe(false);
  });
});
