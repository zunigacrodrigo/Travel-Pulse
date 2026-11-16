import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LlmClient } from "../ai/client";
import { stripPII } from "../ai/interpret";
import { resetTelemetry } from "../ai/telemetry";
import { CITIES } from "@/lib/day/cities";
import { GOLD_PHRASES, MEASURE_NOW, measure, scoreIntent, type Gold } from "./measure";

beforeEach(() => { resetTelemetry(); vi.spyOn(console, "info").mockImplementation(() => {}); });
afterEach(() => vi.restoreAllMocks());

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const phraseOf = (user: string) => /<frase>\n([\s\S]*?)\n<\/frase>/.exec(user)?.[1] ?? "";

/** Un «modelo perfecto»: responde con la verdad de cada frase. */
const oracle: LlmClient = {
  async complete(req) {
    const g = GOLD_PHRASES.find((x) => stripPII(x.text) === phraseOf(req.user));
    const e = g?.expect;
    const body = { city: e?.city ? CITIES[e.city]!.name : null, date: e?.date ?? null, startTime: e?.startMin !== undefined ? hhmm(e.startMin) : null, endTime: e?.endMin !== undefined ? hhmm(e.endMin) : null, kinds: e?.kinds ?? [], pace: e?.pace ?? null };
    return { text: JSON.stringify(body), inputTokens: 300, outputTokens: 60 };
  },
};
/** Un «modelo mentiroso»: propone SIEMPRE los mismos datos plausibles, diga lo que diga la persona. */
const liar: LlmClient = {
  async complete() {
    return { text: JSON.stringify({ city: "São Paulo", date: "2026-11-30", startTime: "09:00", endTime: "21:00", kinds: ["museo", "pub", "parque"], pace: "intenso" }), inputTokens: 300, outputTokens: 60 };
  },
};
/** Un modelo que devuelve basura. */
const broken: LlmClient = { async complete() { return { text: "no soy json", inputTokens: 10, outputTokens: 5 }; } };

describe("el conjunto de frases de referencia", () => {
  it("tiene al menos 25 frases, sin duplicados y con fechas reales", () => {
    expect(GOLD_PHRASES.length).toBeGreaterThanOrEqual(25);
    expect(new Set(GOLD_PHRASES.map((g) => g.text)).size).toBe(GOLD_PHRASES.length);
    for (const g of GOLD_PHRASES) if (g.expect.date) {
      const [y, m, d] = g.expect.date.split("-").map(Number) as [number, number, number];
      const t = new Date(Date.UTC(y, m - 1, d));
      expect([t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()], g.text).toEqual([y, m, d]);
      expect(Date.parse(g.expect.date), g.text).toBeGreaterThanOrEqual(Date.parse("2026-11-16"));
    }
  });
  it("cada frase que nombra un día de la semana y una fecha las tiene coherentes", () => {
    const names = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
    for (const g of GOLD_PHRASES) {
      if (!g.expect.date) continue;
      const wd = names[new Date(g.expect.date + "T12:00:00Z").getUTCDay()]!;
      const said = names.filter((n) => g.text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").includes(n));
      if (said.length === 1 && /\b\d{1,2}\b/.test(g.text) && /(el|jueves|viernes|sabado|domingo|lunes|martes|miercoles)\s+\d{1,2}\b/.test(g.text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""))) expect(said[0], g.text).toBe(wd);
    }
  });
});

describe("scoreIntent", () => {
  const g: Gold["expect"] = { city: "sao-paulo-br", date: "2026-11-19", startMin: 695, kinds: ["museo", "pub"], pace: "tranquilo" };
  it("cuenta aciertos, omisiones, errores e invenciones por campo", () => {
    const s = scoreIntent(g, { city: "sao-paulo-br", date: "2026-11-20", kinds: ["pub", "museo"], endMin: 1200 });
    expect(s.city).toBe("correcto");
    expect(s.date).toBe("equivocado");
    expect(s.startMin).toBe("omitido");
    expect(s.endMin).toBe("inventado");
    expect(s.kinds).toBe("correcto"); // el orden no importa
    expect(s.pace).toBe("omitido");
  });
  it("un campo ausente en ambos lados no cuenta", () => {
    expect(scoreIntent({}, { kinds: [] }).city).toBe("na");
    expect(scoreIntent({}, { kinds: [] }).kinds).toBe("na");
  });
  it("tipos de lugar: producir alguno cuando no se esperaba ninguno es inventar", () => {
    expect(scoreIntent({}, { kinds: ["museo"] }).kinds).toBe("inventado");
  });
});

describe("measure con un modelo perfecto", () => {
  it("la IA nunca empeora a las reglas: no suma errores ni invenciones", async () => {
    const r = await measure(oracle, MEASURE_NOW);
    expect(r.n).toBe(GOLD_PHRASES.length);
    expect(r.ai).not.toBeNull();
    for (const f of ["city", "date", "startMin", "endMin", "kinds", "pace"] as const) {
      expect(r.ai!.perField[f].equivocado, f).toBeLessThanOrEqual(r.rules.perField[f].equivocado);
      expect(r.ai!.perField[f].inventado, f).toBeLessThanOrEqual(r.rules.perField[f].inventado);
      expect(r.ai!.perField[f].correcto, f).toBeGreaterThanOrEqual(r.rules.perField[f].correcto);
    }
  });
  it("la IA aporta datos que las reglas no entienden y el informe lo cuantifica", async () => {
    const r = await measure(oracle, MEASURE_NOW);
    const gained = (["city", "date", "startMin", "endMin", "kinds", "pace"] as const).reduce((a, f) => a + r.ai!.perField[f].correcto - r.rules.perField[f].correcto, 0);
    expect(gained).toBeGreaterThan(0);
    expect(r.proposals.accepted).toBeGreaterThan(0);
  });
  it("registra tokens, costo y latencia de las llamadas", async () => {
    const r = await measure(oracle, MEASURE_NOW);
    expect(r.calls.ok).toBe(GOLD_PHRASES.length);
    expect(r.calls.inputTokens).toBe(300 * GOLD_PHRASES.length);
    expect(r.calls.costUsd).toBeGreaterThan(0);
    expect(r.calls.costUsd).toBeLessThan(0.1); // 30 frases con Haiku: centavos
  });
  it("no se filtran datos personales al modelo", async () => {
    expect((await measure(oracle, MEASURE_NOW)).piiLeaks).toBe(0);
  });
});

describe("measure con un modelo MENTIROSO (propone siempre los mismos datos)", () => {
  it("no logra colar una ciudad, fecha u hora que la persona no dijo", async () => {
    const r = await measure(liar, MEASURE_NOW);
    for (const f of ["city", "date", "startMin", "endMin"] as const) {
      expect(r.ai!.perField[f].inventado, `${f} inventado`).toBe(r.rules.perField[f].inventado);
      expect(r.ai!.perField[f].equivocado, `${f} equivocado`).toBeLessThanOrEqual(r.rules.perField[f].equivocado + 0);
    }
  });
  it("tampoco logra colar tipos de lugar ni un ritmo sin ninguna pista en la frase", async () => {
    const r = await measure(liar, MEASURE_NOW);
    expect(r.ai!.perField.kinds.inventado).toBe(r.rules.perField.kinds.inventado);
    expect(r.ai!.perField.pace.inventado).toBe(r.rules.perField.pace.inventado);
  });
  it("las propuestas rechazadas se cuentan", async () => {
    const r = await measure(liar, MEASURE_NOW);
    expect(r.proposals.rejected).toBeGreaterThan(0);
  });
});

describe("measure con un modelo roto", () => {
  it("cae a las reglas en todas las frases, sin error, y lo informa", async () => {
    const r = await measure(broken, MEASURE_NOW);
    expect(r.calls.failed).toBe(GOLD_PHRASES.length);
    for (const f of ["city", "date", "startMin", "endMin", "kinds", "pace"] as const) expect(r.ai!.perField[f]).toEqual(r.rules.perField[f]);
  });
});

describe("measure sin cliente", () => {
  it("devuelve solo la línea base de reglas", async () => {
    const r = await measure(null, MEASURE_NOW);
    expect(r.ai).toBeNull();
    expect(r.calls.ok + r.calls.failed).toBe(0);
  });
});
