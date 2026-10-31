import { describe, expect, it } from "vitest";
import { INTERESTS } from "@/lib/types";
import { sources } from "../sources";
import { seedDataset, withMonthContext } from "./index";

const ds = seedDataset;
const sourceIds = new Set(sources.map((s) => s.id));
const ids = new Set(ds.destinations.map((d) => d.id));
const ISO = /^\d{4}-\d{2}-\d{2}$/;

function sourcedOk(s: { sourceId: string; observedAt: string }) {
  expect(sourceIds.has(s.sourceId), `fuente desconocida ${s.sourceId}`).toBe(true);
  expect(s.observedAt).toMatch(ISO);
}

const inRange = (v: number | null, lo: number, hi: number) => v === null || (v >= lo && v <= hi);

describe("catálogo de fuentes", () => {
  it("ids únicos y rangos válidos", () => {
    expect(sourceIds.size).toBe(sources.length);
    for (const s of sources) {
      expect(s.reliability).toBeGreaterThan(0);
      expect(s.reliability).toBeLessThanOrEqual(1);
      expect(s.maxAgeDays).toBeGreaterThan(0);
    }
  });
});

describe("seedDataset", () => {
  it("tiene 30 destinos con ids IATA únicos", () => {
    expect(ds.destinations).toHaveLength(30);
    expect(ids.size).toBe(30);
    for (const d of ds.destinations) expect(d.id).toMatch(/^[A-Z]{3}$/);
  });

  it("incluye los destinos de la historia demo", () => {
    for (const id of ["CUZ", "AQP", "SLA", "OAX", "MDE", "FLN"]) expect(ids.has(id)).toBe(true);
  });

  it("destinos: coordenadas, etiquetas, riesgo, conectividad y similares válidos", () => {
    for (const d of ds.destinations) {
      expect(d.lat).toBeGreaterThanOrEqual(-90);
      expect(d.lat).toBeLessThanOrEqual(90);
      expect(d.lon).toBeGreaterThanOrEqual(-180);
      expect(d.lon).toBeLessThanOrEqual(180);
      expect(d.altitudeM).toBeGreaterThanOrEqual(0);
      expect(d.altitudeM).toBeLessThan(5000);
      expect(Object.keys(d.tags).sort()).toEqual([...INTERESTS].sort());
      for (const k of INTERESTS) {
        expect(Number.isInteger(d.tags[k])).toBe(true);
        expect(inRange(d.tags[k], 0, 5)).toBe(true);
      }
      sourcedOk(d.riskLevel);
      expect([1, 2, 3, 4]).toContain(d.riskLevel.value);
      expect(d.riskReasons.length).toBeGreaterThan(0);
      for (const r of d.riskReasons) expect(r.toLowerCase()).not.toMatch(/barrio/);
      const c = d.connectivity.SCL;
      expect(c, `${d.id} sin conectividad SCL`).toBeDefined();
      sourcedOk(c);
      expect(c.value!.flightHours).toBeGreaterThan(0);
      expect(c.value!.weeklyFrequency).toBeGreaterThan(0);
      expect(d.similar.length).toBeGreaterThanOrEqual(2);
      expect(d.similar.length).toBeLessThanOrEqual(3);
      for (const s of d.similar) {
        expect(ids.has(s), `${d.id} similar inexistente ${s}`).toBe(true);
        expect(s).not.toBe(d.id);
      }
      expect(d.blurb).not.toMatch(/\d/);
      for (const col of [d.poster.sky, d.poster.sun, d.poster.far, d.poster.near, d.poster.accent]) {
        expect(col).toMatch(/^#[0-9A-F]{6}$/i);
      }
    }
  });

  it("al menos un destino con riesgo 3 y uno con riesgo 4", () => {
    const levels = ds.destinations.map((d) => d.riskLevel.value);
    expect(levels).toContain(3);
    expect(levels).toContain(4);
  });

  it("destination_monthly: 12 meses por destino, valores en rango", () => {
    expect(ds.monthly).toHaveLength(30 * 12);
    for (const id of ids) {
      const months = ds.monthly.filter((m) => m.destinationId === id).map((m) => m.month).sort((a, b) => a - b);
      expect(months).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    }
    for (const m of ds.monthly) {
      [m.season, m.saturation, m.dailyCostUsd, m.climate].forEach(sourcedOk);
      expect(inRange(m.season.value, 0, 100)).toBe(true);
      expect(inRange(m.saturation.value, 0, 100)).toBe(true);
      expect(inRange(m.dailyCostUsd.value, 20, 400)).toBe(true);
      const c = m.climate.value!;
      expect(inRange(c.tempC, -10, 40)).toBe(true);
      expect(inRange(c.rainMm, 0, 500)).toBe(true);
      expect(inRange(c.windKmh, 0, 60)).toBe(true);
    }
  });

  it("precios desde SCL: 12 meses por destino, positivos y realistas", () => {
    expect(ds.prices).toHaveLength(30 * 12);
    for (const p of ds.prices) {
      expect(p.origin).toBe("SCL");
      expect(ids.has(p.destinationId)).toBe(true);
      sourcedOk(p.flightUsd);
      sourcedOk(p.usualFlightUsd);
      expect(inRange(p.flightUsd.value, 80, 2000)).toBe(true);
      expect(inRange(p.usualFlightUsd.value, 80, 2000)).toBe(true);
    }
    // Algunas oportunidades: precio actual ≥10% bajo lo habitual.
    const deals = ds.prices.filter(
      (p) => p.flightUsd.value !== null && p.usualFlightUsd.value !== null && p.flightUsd.value <= p.usualFlightUsd.value * 0.9,
    );
    expect(deals.length).toBeGreaterThan(5);
  });

  it("tendencias: una por destino con fuentes válidas", () => {
    expect(ds.trends).toHaveLength(30);
    for (const t of ds.trends) {
      expect(ids.has(t.destinationId)).toBe(true);
      sourcedOk(t.priceChange30dPct);
      sourcedOk(t.interestChange30dPct);
    }
  });

  it("FLN en noviembre: sin precio de vuelo ni saturación", () => {
    const p = ds.prices.find((x) => x.destinationId === "FLN" && x.month === 11)!;
    expect(p.flightUsd.value).toBeNull();
    const m = ds.monthly.find((x) => x.destinationId === "FLN" && x.month === 11)!;
    expect(m.saturation.value).toBeNull();
    expect(m.climate.value).not.toBeNull();
  });

  it("historia demo: totales aproximados para 8 días, 1 viajero, noviembre", () => {
    const total = (id: string) => {
      const p = ds.prices.find((x) => x.destinationId === id && x.month === 11)!;
      const m = ds.monthly.find((x) => x.destinationId === id && x.month === 11)!;
      return p.flightUsd.value! + m.dailyCostUsd.value! * 8;
    };
    expect(total("CUZ")).toBe(1180);
    expect(total("SLA")).toBe(890);
    expect(total("OAX")).toBe(1420);
    expect(total("MDE")).toBe(1250);
    expect(total("AQP")).toBe(1040);
  });

  it("withMonthContext completa prevMonthSaturation y filtra por origen", () => {
    const nov = withMonthContext(ds, "SCL", 11);
    const cuz = nov.trends.find((t) => t.destinationId === "CUZ")!;
    expect(cuz.prevMonthSaturation).toBe(58);
    expect(nov.prices.every((p) => p.origin === "SCL")).toBe(true);
    expect(withMonthContext(ds, "LIM", 11).prices).toHaveLength(0);
  });
});
