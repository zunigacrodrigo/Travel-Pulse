/**
 * Medición del Director contra la API REAL de Anthropic. Se salta salvo que se pida expresamente:
 *   LIVE_ANTHROPIC=1 ANTHROPIC_API_KEY=... npm run medir:director
 * Gasta unos centavos de dólar (≈32 llamadas a Haiku) y escribe el informe en docs/evidence/director-live.txt.
 */
import { describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { getLlmClient } from "../ai/client";
import { formatReport, measure } from "./measure";

const live = process.env.LIVE_ANTHROPIC === "1" && !!process.env.ANTHROPIC_API_KEY;

describe.skipIf(!live)("Director con la API real", () => {
  it("mide reglas vs reglas+IA sobre las frases de referencia y no inventa datos", async () => {
    const client = getLlmClient();
    expect(client).not.toBeNull();
    const r = await measure(client);
    const text = formatReport(r);
    mkdirSync("docs/evidence", { recursive: true });
    writeFileSync("docs/evidence/director-live.txt", `${new Date().toISOString()}\n${text}\n`);
    console.log(text);
    expect(r.calls.ok).toBeGreaterThan(0);
    expect(r.piiLeaks).toBe(0);
    for (const f of ["city", "date", "startMin", "endMin"] as const) expect(r.ai!.perField[f].inventado).toBeLessThanOrEqual(r.rules.perField[f].inventado);
  }, 300_000);
});
