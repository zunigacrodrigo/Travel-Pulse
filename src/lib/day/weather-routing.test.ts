import { describe, expect, it } from "vitest";
import car from "./__fixtures__/osrm-car-real.json";
import foot from "./__fixtures__/osrm-foot-real.json";
import meteo from "./__fixtures__/openmeteo-sp-real.json";
import { fetchDayWeather, parseHourly, rainRiskBetween, rainWindows } from "./weather";
import { fetchMatrix, leg, parseMatrix } from "./routing";

describe("pronóstico por hora (Open-Meteo real)", () => {
  const day = meteo.hourly.time[0]!.slice(0, 10);
  const hours = parseHourly(meteo, day);
  it("interpreta las 24 horas del día pedido y solo ese día", () => {
    expect(hours).toHaveLength(24);
    expect(hours[0]!.hour).toBe(0);
    expect(hours.every((h) => h.hour >= 0 && h.hour <= 23)).toBe(true);
    expect(parseHourly(meteo, "1999-01-01")).toEqual([]);
  });
  it("entradas inválidas no rompen nada", () => {
    expect(parseHourly(null, day)).toEqual([]);
    expect(parseHourly({ hourly: {} }, day)).toEqual([]);
  });
  const wet = [0, 1, 2, 3].map((hour) => ({ hour: 13 + hour, rainProb: [20, 70, 90, 30][hour]!, tempC: 20, precipMm: 0 }));
  it("detecta tramos con riesgo de lluvia y la hora más probable", () => {
    expect(rainWindows(wet)).toEqual([{ fromHour: 14, toHour: 16, maxProb: 90 }]);
    expect(rainWindows([])).toEqual([]);
  });
  it("un tramo toca la lluvia si se solapa con una hora mojada", () => {
    expect(rainRiskBetween(wet, 14 * 60 + 30, 15 * 60)).toBe(true);
    expect(rainRiskBetween(wet, 16 * 60, 17 * 60)).toBe(false);
    expect(rainRiskBetween(wet, 13 * 60, 14 * 60)).toBe(false);
  });
  it("sin dato de probabilidad no se supone lluvia", () => {
    expect(rainRiskBetween([{ hour: 10, rainProb: null, tempC: null, precipMm: null }], 600, 660)).toBe(false);
  });
  it("fuera del alcance del pronóstico devuelve null sin consultar", async () => {
    let calls = 0;
    const f = (async () => { calls++; return new Response("{}"); }) as unknown as typeof fetch;
    expect(await fetchDayWeather(0, 0, "2027-06-01", "America/Sao_Paulo", new Date("2026-11-01T00:00:00Z"), { fetchImpl: f })).toBeNull();
    expect(calls).toBe(0);
  });
  it("con datos reales devuelve las horas", async () => {
    const f = (async () => new Response(JSON.stringify(meteo))) as unknown as typeof fetch;
    const r = await fetchDayWeather(-23.5, -46.6, day, "America/Sao_Paulo", new Date(`${day}T00:00:00Z`), { fetchImpl: f });
    expect(r).toHaveLength(24);
  });
});

describe("traslados (OSRM real de FOSSGIS)", () => {
  it("a pie es mucho más lento que en auto para el mismo tramo (no se mezclan los modos)", () => {
    const f = parseMatrix(foot, 3)!, c = parseMatrix(car, 3)!;
    expect(f[0]![1]!).toBeGreaterThan(c[0]![1]! * 2);
    expect(f[0]![1]!).toBeGreaterThanOrEqual(30); // 2,6 km a pie: más de media hora
  });
  it("la diagonal es cero y la matriz es completa", () => {
    const f = parseMatrix(foot, 3)!;
    expect(f.map((r, i) => r[i])).toEqual([0, 0, 0]);
    expect(f.every((r) => r.length === 3)).toBe(true);
  });
  it("rechaza respuestas incompletas, con errores o con pares sin ruta", () => {
    expect(parseMatrix(null, 3)).toBeNull();
    expect(parseMatrix({ code: "NoRoute" }, 3)).toBeNull();
    expect(parseMatrix({ code: "Ok", durations: [[0, null], [1, 0]] }, 2)).toBeNull();
    expect(parseMatrix({ code: "Ok", durations: [[0, 1]] }, 2)).toBeNull();
  });
  it("tramo corto: a pie; tramo largo: en auto sin tráfico", () => {
    expect(leg([[0, 12], [12, 0]], [[0, 3], [3, 0]], 0, 1)).toEqual({ minutes: 12, mode: "foot" });
    const f = parseMatrix(foot, 3)!, c = parseMatrix(car, 3)!;
    expect(leg(f, c, 0, 1)).toEqual({ minutes: c[0]![1]!, mode: "car" });
  });
  it("si falla el auto usa lo que haya; si no hay nada, null", () => {
    expect(leg([[0, 40], [40, 0]], null, 0, 1)).toEqual({ minutes: 40, mode: "foot" });
    expect(leg(null, null, 0, 1)).toBeNull();
  });
  it("fetchMatrix arma la URL con longitud,latitud y el perfil correcto", async () => {
    const urls: string[] = [];
    const f = (async (u: string) => { urls.push(u); return new Response(JSON.stringify(foot)); }) as unknown as typeof fetch;
    const pts = [{ lat: -23.5614, lon: -46.6559 }, { lat: -23.5505, lon: -46.6333 }, { lat: -23.587, lon: -46.67 }];
    expect(await fetchMatrix(pts, "foot", { fetchImpl: f })).not.toBeNull();
    expect(urls[0]).toContain("routed-foot/table/v1/foot/-46.65590,-23.56140;");
    await fetchMatrix(pts, "car", { fetchImpl: f });
    expect(urls[1]).toContain("routed-car/table/v1/driving/");
  });
});
