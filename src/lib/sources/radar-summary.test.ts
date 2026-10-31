import { describe, expect, it } from "vitest";
import { summarizeRadar } from "./radar-summary";
import type { DestinationLive } from "./overlay";

const base = (o: Partial<DestinationLive>): DestinationLive => ({
  id: "x", name: "X", country: "Chile", lat: 0, lon: 0, riskLevel: 1, riskOrigin: "live", riskObservedAt: "2026-10-31",
  advisoryUrl: null, advisoryUpdatedAt: null,
  quakes: { count: 0, minMag: 4.5, radiusKm: 300, days: 30, maxMag: null, strongest: null },
  ...o,
});

describe("summarizeRadar", () => {
  it("sin destinos no inventa nivel", () => {
    const s = summarizeRadar([]);
    expect(s.maxLevel).toBeNull();
    expect(s.alerts).toEqual([]);
  });
  it("cuenta niveles y toma el máximo", () => {
    const s = summarizeRadar([base({ id: "a", riskLevel: 1 }), base({ id: "b", riskLevel: 3 }), base({ id: "c", riskLevel: null })]);
    expect(s.counts).toEqual({ 1: 1, 2: 0, 3: 1, 4: 0 });
    expect(s.withData).toBe(2);
    expect(s.maxLevel).toBe(3);
  });
  it("solo alerta desde nivel 2 y rotula el dato no verificado", () => {
    const s = summarizeRadar([base({ id: "a", riskLevel: 1 }), base({ id: "b", name: "B", riskLevel: 2, riskOrigin: "seed" })]);
    expect(s.alerts).toHaveLength(1);
    expect(s.alerts[0]!.detail).toContain("sin verificar");
  });
  it("incluye sismos y ordena por gravedad", () => {
    const s = summarizeRadar([
      base({ id: "q", name: "Q", quakes: { count: 1, minMag: 4.5, radiusKm: 300, days: 30, maxMag: 5.2, strongest: { id: "1", mag: 5.2, place: "p", lat: 0, lon: 0, time: "", distanceKm: 120 } as never } }),
      base({ id: "r", name: "R", riskLevel: 3 }),
    ]);
    expect(s.alerts.map((a) => a.kind)).toEqual(["advisory", "quake"]);
    expect(s.alerts[1]!.detail).toContain("M5,2");
  });
});
