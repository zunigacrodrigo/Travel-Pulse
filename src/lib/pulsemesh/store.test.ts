import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PulseError, supabasePulseStore } from "./store";

/** Cliente falso que registra la consulta construida y devuelve lo que se le indique. */
function fake(result: { data?: unknown; error?: { code?: string; message?: string } | null }) {
  const calls: Array<[string, unknown[]]> = [];
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "order", "limit"]) q[m] = (...a: unknown[]) => { calls.push([m, a]); return q; };
  q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: result.data ?? [], error: result.error ?? null }).then(res);
  return { db: { from: (t: string) => { calls.push(["from", [t]]); return q; } } as unknown as SupabaseClient, calls };
}
const row = { id: "s1", city_key: "sao-paulo-br", category: "afluencia", kind: "fila_larga", title: "Fila", detail: null, price_amount: null, price_currency: null,
  observed_at: "2026-11-05T10:00:00Z", expires_at: "2026-11-05T16:00:00Z", independent_count: 1, contradicted_count: 0, state: "por_confirmar", is_mine: false,
  place_id: "way/1", place_name: "A" };

describe("listForPlaces", () => {
  it("consulta la vista pública filtrando por ciudad y por la lista de lugares", async () => {
    const { db, calls } = fake({ data: [row] });
    const r = await supabasePulseStore(db).listForPlaces("sao-paulo-br", ["way/1", "node/2"]);
    expect(calls).toContainEqual(["from", ["pulse_signals_public"]]);
    expect(calls).toContainEqual(["eq", ["city_key", "sao-paulo-br"]]);
    expect(calls).toContainEqual(["in", ["place_id", ["way/1", "node/2"]]]);
    expect(r[0]).toMatchObject({ placeId: "way/1" });
  });
  it("descarta ids mal formados antes de consultar y no repite", async () => {
    const { db, calls } = fake({ data: [] });
    await supabasePulseStore(db).listForPlaces("sao-paulo-br", ["way/1", "way/1", "x", "way/2; drop"]);
    expect(calls).toContainEqual(["in", ["place_id", ["way/1"]]]);
  });
  it("sin lugares válidos no consulta la red", async () => {
    const { db, calls } = fake({ data: [] });
    expect(await supabasePulseStore(db).listForPlaces("sao-paulo-br", ["x"])).toEqual([]);
    expect(calls).toEqual([]);
  });
  it("si la base falla, lanza un error con un mensaje para la persona", async () => {
    const { db } = fake({ error: { code: "XX000", message: "boom" } });
    await expect(supabasePulseStore(db).listForPlaces("sao-paulo-br", ["way/1"])).rejects.toBeInstanceOf(PulseError);
  });
});
