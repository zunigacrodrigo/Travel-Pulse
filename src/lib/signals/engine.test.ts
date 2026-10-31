import { describe, expect, it } from "vitest";
import { createSignal, sameCity, signalConfidence, signalStatus } from "./engine";
import type { TravelSignal } from "./types";

describe("Travel Pulse signal engine", () => {
  it("matches city aliases and accents without matching shared prefixes", () => {
    expect(sameCity("Santiago, Chile", "Santiago de Chile")).toBe(true);
    expect(sameCity("São Paulo, Brasil", "Sao Paulo")).toBe(true);
    expect(sameCity("San Francisco, United States", "San Jose, United States")).toBe(false);
  });
  it("creates a community signal with an expiry based on its type", () => {
    const now = new Date("2026-10-27T12:00:00.000Z");
    const signal = createSignal({ title: "Fila en el acceso norte", detail: "Se observó una fila de unas veinte personas en la entrada norte.", place: "Acceso norte", city: "São Paulo", type: "Afluencia", evidence: "observación directa" }, now);
    expect(signal.source).toBe("comunidad");
    expect(Date.parse(signal.expiresAt) - Date.parse(signal.createdAt)).toBe(3 * 60 * 60 * 1000);
  });
  it("rejects underspecified reports", () => {
    expect(() => createSignal({ title: "Fila", detail: "ok", place: "X", city: "SP", type: "Otro", evidence: "observación directa" })).toThrow();
  });
  it("labels signals as recent, pending confirmation, or expired", () => {
    const base: Pick<TravelSignal, "createdAt" | "expiresAt"> = { createdAt: "2026-10-27T11:30:00.000Z", expiresAt: "2026-10-27T14:00:00.000Z" };
    expect(signalStatus(base, Date.parse("2026-10-27T11:45:00.000Z"))).toBe("reciente");
    expect(signalStatus(base, Date.parse("2026-10-27T12:45:00.000Z"))).toBe("por confirmar");
    expect(signalStatus(base, Date.parse("2026-10-27T15:00:00.000Z"))).toBe("caducada");
  });
  it("increases explainable confidence with evidence and corroboration", () => {
    expect(signalConfidence({ confirmations: 3, evidence: "foto", source: "comunidad" })).toBeGreaterThan(signalConfidence({ confirmations: 0, evidence: "observación directa", source: "demo" }));
    expect(signalConfidence({ confirmations: 0, evidence: "foto", source: "comunidad" })).toBe(signalConfidence({ confirmations: 0, evidence: "observación directa", source: "comunidad" }));
  });
});
