import { describe, expect, it } from "vitest";
import { agoText, groupByPlace, summarizePlace } from "./place";
import type { PublicSignal } from "./model";

const NOW = new Date("2026-11-05T14:00:00Z");
const MASP = "way/1370081491", BAR = "node/6736650585";
const sig = (over: Partial<PublicSignal>): PublicSignal => ({
  id: "s", cityKey: "sao-paulo-br", category: "afluencia", kind: "fila_larga", title: "Fila", detail: null, priceAmount: null, priceCurrency: null,
  observedAt: "2026-11-05T13:20:00Z", expiresAt: "2026-11-05T19:20:00Z", independentCount: 1, contradictedCount: 0, state: "por_confirmar", isMine: false,
  placeId: MASP, placeName: "Museu de Arte de São Paulo", ...over,
});

describe("resumen de reportes de un lugar", () => {
  it("sin reportes dice exactamente la frase honesta, no «todo bien»", () => {
    const s = summarizePlace([], MASP, NOW);
    expect(s.state).toBe("sin_reportes");
    expect(s.headline).toBe("Aún no hay reportes de viajeros aquí");
    expect(s.total).toBe(0);
  });
  it("los reportes de OTRO lugar no cuentan", () => {
    expect(summarizePlace([sig({ placeId: BAR })], MASP, NOW).state).toBe("sin_reportes");
  });
  it("un reporte caducado no cuenta", () => {
    expect(summarizePlace([sig({ expiresAt: "2026-11-05T13:59:00Z" })], MASP, NOW).state).toBe("sin_reportes");
  });
  it("un reporte de 1 persona se presenta como por confirmar, con su antigüedad y como no oficial", () => {
    const s = summarizePlace([sig({})], MASP, NOW);
    expect(s.state).toBe("por_confirmar");
    expect(s.headline).toMatch(/Fila larga/);
    expect(s.headline).toMatch(/1 viajero/);
    expect(s.headline).toMatch(/hace 40 min/);
    expect(s.headline).toMatch(/falta confirmar/i);
    expect(s.headline).toMatch(/no oficial/i);
  });
  it("tres personas distintas lo dejan corroborado, sin dejar de ser no oficial", () => {
    const s = summarizePlace([sig({ state: "corroborada", independentCount: 3 })], MASP, NOW);
    expect(s.state).toBe("corroborado");
    expect(s.corroborated).toHaveLength(1);
    expect(s.headline).toMatch(/3 viajeros/);
    expect(s.headline).toMatch(/no oficial/i);
  });
  it("un reporte en disputa se marca así y no cuenta como corroborado", () => {
    const s = summarizePlace([sig({ state: "en_disputa", contradictedCount: 2 })], MASP, NOW);
    expect(s.state).toBe("en_disputa");
    expect(s.corroborated).toHaveLength(0);
    expect(s.headline).toMatch(/en disputa/i);
  });
  it("con varios reportes muestra el más reciente y cuenta el resto", () => {
    const s = summarizePlace([sig({ id: "a", observedAt: "2026-11-05T12:00:00Z" }), sig({ id: "b", kind: "muy_lleno", observedAt: "2026-11-05T13:50:00Z" })], MASP, NOW);
    expect(s.headline).toMatch(/Muy lleno/);
    expect(s.headline).toMatch(/1 reporte más/);
    expect(s.total).toBe(2);
  });
  it("si hay uno corroborado y otro más reciente sin corroborar, el estado del lugar es el del corroborado", () => {
    const s = summarizePlace([sig({ id: "a", state: "corroborada", independentCount: 3, kind: "cerrado", category: "condiciones", observedAt: "2026-11-05T11:00:00Z" }), sig({ id: "b", observedAt: "2026-11-05T13:55:00Z" })], MASP, NOW);
    expect(s.state).toBe("corroborado");
  });
});

describe("agoText", () => {
  it.each([[30_000, "hace menos de 1 min"], [40 * 60_000, "hace 40 min"], [3 * 3_600_000, "hace 3 h"], [50 * 3_600_000, "hace 2 d"]])("%i ms → %s", (ms, text) => {
    expect(agoText(new Date(NOW.getTime() - ms).toISOString(), NOW)).toBe(text);
  });
  it("una fecha inválida no inventa una antigüedad", () => expect(agoText("basura", NOW)).toBe("hora desconocida"));
});

describe("groupByPlace", () => {
  it("agrupa por lugar e ignora los reportes sin lugar", () => {
    const g = groupByPlace([sig({ id: "1" }), sig({ id: "2", placeId: BAR }), sig({ id: "3", placeId: null, placeName: null })]);
    expect(Object.keys(g).sort()).toEqual([BAR, MASP].sort());
    expect(g[MASP]).toHaveLength(1);
  });
});
