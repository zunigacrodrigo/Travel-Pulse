import { describe, expect, it } from "vitest";
import { INTERESTS } from "@/lib/types";
import { SOURCE_IDS, sources } from "../sources";
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
const monthly = (id: string, month: number) => ds.monthly.find((m) => m.destinationId === id && m.month === month)!;

/** Fuentes que en versiones anteriores respaldaban números escritos o generados por nosotros. */
const FABRICATED_SOURCES = [SOURCE_IDS.curaduria, SOURCE_IDS.travelPulseEstimate, SOURCE_IDS.costoVida, SOURCE_IDS.openFlights, SOURCE_IDS.tendencias];

describe("catálogo de fuentes", () => {
  it("ids únicos y rangos válidos", () => {
    expect(sourceIds.size).toBe(sources.length);
    for (const s of sources) {
      expect(s.reliability).toBeGreaterThanOrEqual(0);
      expect(s.reliability).toBeLessThanOrEqual(1);
      expect(s.maxAgeDays).toBeGreaterThan(0);
      // Solo «sin fuente» puede tener fiabilidad cero.
      if (s.id !== SOURCE_IDS.sinFuente) expect(s.reliability).toBeGreaterThan(0);
    }
  });
});

describe("seedDataset: estructura editorial", () => {
  it("tiene 30 destinos con ids IATA únicos", () => {
    expect(ds.destinations).toHaveLength(30);
    expect(ids.size).toBe(30);
    for (const d of ds.destinations) expect(d.id).toMatch(/^[A-Z]{3}$/);
  });

  it("incluye los destinos clave", () => {
    for (const id of ["CUZ", "AQP", "SLA", "OAX", "MDE", "FLN"]) expect(ids.has(id)).toBe(true);
  });

  it("destinos: coordenadas, etiquetas y similares válidos", () => {
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
});

describe("seedDataset: ningún dato fabricado", () => {
  it("riesgo y conectividad: sin dato en la semilla (el riesgo llega en vivo del FCDO)", () => {
    for (const d of ds.destinations) {
      sourcedOk(d.riskLevel);
      expect(d.riskLevel.value, `${d.id}: la semilla no debe traer un nivel escrito a mano`).toBeNull();
      expect(d.riskReasons).toEqual([]);
      expect(Object.keys(d.connectivity)).toEqual([]);
    }
  });

  it("no hay precios de vuelo hasta conectar un proveedor real", () => {
    expect(ds.prices).toEqual([]);
  });

  it("temporada, saturación y costo diario: siempre «sin dato» con fuente declarada", () => {
    for (const m of ds.monthly) {
      for (const field of [m.season, m.saturation, m.dailyCostUsd]) {
        sourcedOk(field);
        expect(field.value).toBeNull();
        expect(field.sourceId).toBe(SOURCE_IDS.sinFuente);
      }
    }
  });

  it("ningún dato del dataset cita una fuente que respaldaba números inventados", () => {
    const used = new Set<string>();
    for (const d of ds.destinations) used.add(d.riskLevel.sourceId);
    for (const m of ds.monthly) [m.season, m.saturation, m.dailyCostUsd, m.climate].forEach((f) => used.add(f.sourceId));
    for (const t of ds.trends) [t.priceChange30dPct, t.interestChange30dPct].forEach((f) => used.add(f.sourceId));
    for (const f of FABRICATED_SOURCES) expect(used.has(f), `se usa ${f}`).toBe(false);
  });
});

describe("seedDataset: datos reales", () => {
  it("destination_monthly: 12 meses por destino", () => {
    expect(ds.monthly).toHaveLength(30 * 12);
    for (const id of ids) {
      const months = ds.monthly.filter((m) => m.destinationId === id).map((m) => m.month).sort((a, b) => a - b);
      expect(months).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    }
  });

  it("clima: cubre los 30 destinos, viene de Open-Meteo y está en rangos físicos", () => {
    for (const id of ids) {
      const rows = ds.monthly.filter((m) => m.destinationId === id);
      expect(rows.every((r) => r.climate.value !== null), `${id} sin clima completo`).toBe(true);
    }
    for (const m of ds.monthly) {
      sourcedOk(m.climate);
      expect(m.climate.sourceId).toBe(SOURCE_IDS.openMeteo);
      const c = m.climate.value!;
      expect(inRange(c.tempC, -15, 40)).toBe(true);
      expect(inRange(c.rainMm, 0, 1500)).toBe(true);
      expect(inRange(c.windKmh, 0, 60)).toBe(true);
    }
  });

  it("clima: coherencia física de datos reales (estaciones y hemisferios)", () => {
    // Cusco: temporada seca en el invierno austral, lluvias en el verano.
    expect(monthly("CUZ", 7).climate.value!.rainMm).toBeLessThan(monthly("CUZ", 1).climate.value!.rainMm);
    // Hemisferio sur: julio es más frío que enero. Hemisferio norte: al revés.
    expect(monthly("PUQ", 7).climate.value!.tempC).toBeLessThan(monthly("PUQ", 1).climate.value!.tempC);
    expect(monthly("CUN", 7).climate.value!.tempC).toBeGreaterThan(monthly("CUN", 1).climate.value!.tempC);
    // La altitud enfría: Cusco (3 400 m) es más frío que Cancún (nivel del mar) todo el año.
    for (let m = 1; m <= 12; m++) expect(monthly("CUZ", m).climate.value!.tempC).toBeLessThan(monthly("CUN", m).climate.value!.tempC);
  });

  it("tendencias: sin precio; el interés (Wikipedia) cubre casi todos con fuente y fecha", () => {
    expect(ds.trends).toHaveLength(30);
    let withInterest = 0;
    for (const t of ds.trends) {
      expect(ids.has(t.destinationId)).toBe(true);
      sourcedOk(t.priceChange30dPct);
      expect(t.priceChange30dPct.value).toBeNull();
      sourcedOk(t.interestChange30dPct);
      if (t.interestChange30dPct.value !== null) {
        withInterest++;
        expect(t.interestChange30dPct.sourceId).toBe(SOURCE_IDS.wikipedia);
        expect(inRange(t.interestChange30dPct.value, -100, 1000)).toBe(true);
      }
    }
    expect(withInterest).toBeGreaterThanOrEqual(25);
  });

  it("withMonthContext: sin saturación previa y sin precios", () => {
    const nov = withMonthContext(ds, "SCL", 11);
    expect(nov.trends.every((t) => t.prevMonthSaturation === undefined)).toBe(true);
    expect(nov.prices).toHaveLength(0);
    expect(withMonthContext(ds, "LIM", 11).prices).toHaveLength(0);
  });
});
