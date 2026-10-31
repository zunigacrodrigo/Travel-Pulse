import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { _setClientForTests, callJson, extractJson, type LlmClient, type LlmResponse } from "./client";
import {
  aiAvailable,
  budgetStatus,
  estimateCostUsd,
  getBudgetUsd,
  recentCalls,
  resetTelemetry,
  seedMonthlySpend,
} from "./telemetry";

const schema = z.object({ ok: z.boolean() });
const base = { model: "claude-haiku-5-5", system: "s", user: "u", schema, maxTokens: 50 };

function fake(responses: Array<LlmResponse | Error>): { client: LlmClient; calls: () => number } {
  let i = 0;
  return {
    calls: () => i,
    client: {
      async complete() {
        const r = responses[Math.min(i++, responses.length - 1)];
        if (r instanceof Error) throw r;
        return r;
      },
    },
  };
}
const good = (text = '{"ok": true}'): LlmResponse => ({ text, inputTokens: 100, outputTokens: 20 });

beforeEach(() => {
  resetTelemetry();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  delete process.env.AI_MONTHLY_BUDGET_USD;
});
afterEach(() => {
  _setClientForTests(undefined);
  vi.restoreAllMocks();
});

describe("callJson", () => {
  it("devuelve null sin clave de API", async () => {
    const prev = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    expect(await callJson(base)).toBeNull();
    if (prev) process.env.ANTHROPIC_API_KEY = prev;
  });

  it("parsea JSON (incluso con ```), valida y registra la llamada", async () => {
    const f = fake([good('```json\n{"ok": true}\n```')]);
    _setClientForTests(f.client);
    const r = await callJson({ ...base, label: "t" });
    expect(r?.data).toEqual({ ok: true });
    expect(r?.usage.inputTokens).toBe(100);
    expect(r?.usage.costUsd).toBeGreaterThan(0);
    const rec = recentCalls(1)[0];
    expect(rec).toMatchObject({ model: "claude-haiku-5-5", label: "t", ok: true, inputTokens: 100, outputTokens: 20 });
    expect(console.info).toHaveBeenCalled();
  });

  it("reintenta una vez si el JSON es inválido", async () => {
    const f = fake([good("no es json"), good()]);
    _setClientForTests(f.client);
    const r = await callJson(base);
    expect(r?.data.ok).toBe(true);
    expect(r?.usage.attempts).toBe(2);
    expect(f.calls()).toBe(2);
  });

  it("devuelve null tras dos respuestas inválidas (máx. 2 llamadas)", async () => {
    const f = fake([good('{"ok": "si"}'), good("{}")]);
    _setClientForTests(f.client);
    expect(await callJson(base)).toBeNull();
    expect(f.calls()).toBe(2);
  });

  it("devuelve null al agotar el tiempo", async () => {
    _setClientForTests({ complete: () => new Promise<LlmResponse>(() => {}) });
    const t0 = Date.now();
    expect(await callJson({ ...base, timeoutMs: 400 })).toBeNull();
    expect(Date.now() - t0).toBeLessThan(1500);
    expect(recentCalls(1)[0].ok).toBe(false);
  });

  it("extractJson tolera texto alrededor", () => {
    expect(extractJson('Claro: {"a":1} listo')).toEqual({ a: 1 });
    expect(() => extractJson("nada")).toThrow();
  });
});

describe("presupuesto", () => {
  it("por defecto 50 USD y respeta la variable de entorno", () => {
    expect(getBudgetUsd()).toBe(50);
    process.env.AI_MONTHLY_BUDGET_USD = "10";
    expect(getBudgetUsd()).toBe(10);
    process.env.AI_MONTHLY_BUDGET_USD = "abc";
    expect(getBudgetUsd()).toBe(50);
  });

  it("alerta al 70 % y corta lo no esencial al 100 %", async () => {
    expect(aiAvailable("nonEssential")).toBe(true);
    seedMonthlySpend(35);
    expect(budgetStatus().level).toBe("warn");
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(aiAvailable("nonEssential")).toBe(true);

    seedMonthlySpend(50);
    expect(budgetStatus().level).toBe("cut");
    expect(aiAvailable("nonEssential")).toBe(false);
    expect(aiAvailable("essential")).toBe(true);

    const f = fake([good()]);
    _setClientForTests(f.client);
    expect(await callJson({ ...base, feature: "nonEssential" })).toBeNull();
    expect(f.calls()).toBe(0);
    expect((await callJson({ ...base, feature: "essential" }))?.data.ok).toBe(true);

    seedMonthlySpend(75);
    expect(aiAvailable("essential")).toBe(false);
  });

  it("las llamadas suman al gasto del mes", async () => {
    _setClientForTests(fake([good()]).client);
    await callJson(base);
    expect(budgetStatus().spentUsd).toBeCloseTo(estimateCostUsd("claude-haiku-5-5", 100, 20), 10);
  });
});
