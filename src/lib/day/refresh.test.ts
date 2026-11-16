import { describe, expect, it } from "vitest";
import lookup from "./__fixtures__/nominatim-lookup-real.json";
import meteo from "./__fixtures__/openmeteo-sp-real.json";
import { computeReviewData, fetchFreshHours, toLookupIds } from "./refresh";

const IDS = ["way/1370081491", "way/1190506909", "node/4973028945", "node/6736650585"];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const seen: string[] = [];
const okFetch = ((url: string) => { seen.push(String(url)); return Promise.resolve(json(lookup)); }) as unknown as typeof fetch;

describe("revisión con datos de hoy: horarios (grabación REAL de Nominatim, 16-nov-2026)", () => {
  it("convierte los ids de OpenStreetMap al formato de la API (N, W, R)", () => {
    expect(toLookupIds(["way/1", "node/2", "relation/3"])).toBe("W1,N2,R3");
  });
  it("ignora ids mal formados en vez de enviarlos a la API", () => {
    expect(toLookupIds(["way/1", "../etc/passwd", "node/x", "way/"])).toBe("W1");
  });
  it("devuelve el horario crudo de cada lugar, con la clave de la parada", async () => {
    const r = await fetchFreshHours(IDS, { fetchImpl: okFetch });
    expect(Object.keys(r).sort()).toEqual([...IDS].sort());
    expect(r["way/1370081491"]!.hoursRaw).toBe("Tu-Su 10:00-18:00; Th 10:00-20:00");
    expect(r["node/6736650585"]!.hoursRaw).toBe("Tu-Fr 18:00-03:30; Sa 20:00-04:30");
    expect(seen.at(-1)).toContain("osm_ids=W1370081491,W1190506909,N4973028945,N6736650585");
    expect(seen.at(-1)).toContain("extratags=1");
  });
  it("un lugar que la fuente no devuelve se omite: no se afirma nada sobre él", async () => {
    const parcial = (() => Promise.resolve(json((lookup as unknown[]).slice(0, 2)))) as unknown as typeof fetch;
    const r = await fetchFreshHours(IDS, { fetchImpl: parcial });
    expect(Object.keys(r)).toHaveLength(2);
    expect(r["node/6736650585"]).toBeUndefined();
  });
  it("un lugar sin horario en la fuente se informa como null, no como cerrado", async () => {
    const sinHorario = [{ ...(lookup as Array<Record<string, unknown>>)[0], extratags: {} }];
    const r = await fetchFreshHours(["way/1370081491"], { fetchImpl: (() => Promise.resolve(json(sinHorario))) as unknown as typeof fetch });
    expect(r["way/1370081491"]).toEqual({ hoursRaw: null });
  });
  it("sin ids válidos no llama a la red", async () => {
    let calls = 0;
    const r = await fetchFreshHours(["nada"], { fetchImpl: (() => { calls++; return Promise.resolve(json([])); }) as unknown as typeof fetch });
    expect(r).toEqual({}); expect(calls).toBe(0);
  });
  it("si la fuente falla, lanza un error clasificado (quien llama decide cómo degradar)", async () => {
    await expect(fetchFreshHours(IDS, { fetchImpl: (() => Promise.resolve(json({}, 503))) as unknown as typeof fetch })).rejects.toThrow();
  });
});

describe("computeReviewData: junta horarios y pronóstico y declara lo que no pudo consultar", () => {
  // La grabación real de Open-Meteo cubre 31-oct → 2-nov-2026: la consulta simulada cae dentro de ese período.
  const now = new Date("2026-10-31T15:00:00Z");
  const router = (rainOk: boolean, hoursOk: boolean) => ((url: string) => {
    const u = String(url);
    if (u.includes("nominatim")) return hoursOk ? Promise.resolve(json(lookup)) : Promise.resolve(json({}, 500));
    return rainOk ? Promise.resolve(json(meteo)) : Promise.resolve(json({}, 500));
  }) as unknown as typeof fetch;

  it("con ambas fuentes: devuelve horarios, la hora de la consulta y cada fuente en «ok»", async () => {
    const r = await computeReviewData({ city: "sao-paulo-br", date: "2026-11-01", places: IDS }, { fetchImpl: router(true, true), now });
    expect(r.checkedAt).toBe(now.toISOString());
    expect(Object.keys(r.hours)).toHaveLength(4);
    expect(r.sources.map((s) => s.status)).toEqual(["ok", "ok"]);
  });
  it("si cae el clima, igual entrega los horarios y avisa que no se evaluó la lluvia", async () => {
    const r = await computeReviewData({ city: "sao-paulo-br", date: "2026-11-01", places: IDS }, { fetchImpl: router(false, true), now });
    expect(r.weather).toBeNull();
    expect(Object.keys(r.hours)).toHaveLength(4);
    expect(r.warnings.join(" ")).toMatch(/lluvia/i);
    expect(r.sources.find((s) => s.name.includes("Open-Meteo"))!.status).toBe("error");
  });
  it("si caen los horarios, igual entrega el clima y avisa que no se verificaron", async () => {
    const r = await computeReviewData({ city: "sao-paulo-br", date: "2026-11-01", places: IDS }, { fetchImpl: router(true, false), now });
    expect(r.hours).toEqual({});
    expect(r.warnings.join(" ")).toMatch(/horarios/i);
  });
  it("una fecha fuera del alcance del pronóstico se declara fuera_de_alcance, no error", async () => {
    const r = await computeReviewData({ city: "sao-paulo-br", date: "2027-03-01", places: IDS }, { fetchImpl: router(true, true), now });
    expect(r.weather).toBeNull();
    expect(r.sources.find((s) => s.name.includes("Open-Meteo"))!.status).toBe("fuera_de_alcance");
  });
});
