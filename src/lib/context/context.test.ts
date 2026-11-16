import { describe, expect, it } from "vitest";
import air from "./__fixtures__/air-santiago.json";
import nager from "./__fixtures__/nager-cl-2026.json";
import { aqiLabel, airContext, fetchAir, parseAir, uvLabel, type AirHour } from "./air";
import { fetchHolidays, holidayContext, parseHolidays } from "./holidays";
import { computeDayContext } from "./service";

const NOW = new Date("2026-11-16T15:00:00Z");
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
const hrs = (aqi: number, uv: number): AirHour[] => Array.from({ length: 24 }, (_, hour) => ({ hour, aqi, pm25: null, uv: hour === 13 ? uv : 0 }));

describe("feriados (datos reales de Nager.Date, Chile 2026)", () => {
  const hols = parseHolidays(nager);
  it("lee todos los feriados del año y distingue los de todo el país", () => {
    expect(hols.length).toBe(nager.length);
    expect(hols.every((h) => /^\d{4}-\d{2}-\d{2}$/.test(h.date))).toBe(true);
    expect(hols.find((h) => h.date === "2026-12-25")).toMatchObject({ localName: expect.stringContaining("Navidad"), nationwide: true });
  });
  it("un feriado nacional pide atención y no afirma qué lugar cierra", () => {
    const [it0] = holidayContext(hols, "2026-12-25");
    expect(it0).toMatchObject({ severity: "aviso", certainty: "confirmado" });
    expect(it0!.title).toContain("Navidad");
    expect(it0!.detail).toMatch(/confírmalo|no tenemos ese dato/i);
  });
  it("la víspera de un feriado nacional solo informa", () => {
    const r = holidayContext(hols, "2026-12-24");
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ severity: "info" });
    expect(r[0]!.title).toMatch(/Mañana es feriado/);
  });
  it("un día corriente no genera nada", () => expect(holidayContext(hols, "2026-11-17")).toEqual([]));
  it("un feriado regional no se presenta como si valiera para toda la ciudad", () => {
    const r = holidayContext([{ date: "2026-11-18", localName: "Fiesta local", nationwide: false }], "2026-11-18");
    expect(r[0]!.detail).toMatch(/solo en algunas regiones/);
    expect(holidayContext([{ date: "2026-11-19", localName: "Fiesta local", nationwide: false }], "2026-11-18")).toEqual([]); // sin víspera
  });
  it("al leer, respeta que la fuente marque un feriado como no nacional", () => {
    expect(parseHolidays([{ date: "2026-11-18", localName: "Fiesta local", global: false }])[0]!.nationwide).toBe(false);
  });
  it("ignora basura sin lanzar", () => expect(parseHolidays([{ date: "x" }, null, 3, { date: "2026-01-01" }])).toEqual([]));
  it("consulta por país y año", async () => {
    let url = "";
    const r = await fetchHolidays("BR", 2026, { fetchImpl: (async (u: string) => { url = u; return json(nager); }) as typeof fetch });
    expect(url).toBe("https://date.nager.at/api/v3/PublicHolidays/2026/BR");
    expect(r.length).toBe(nager.length);
  });
});

describe("calidad del aire y UV (datos reales de Open-Meteo)", () => {
  it("lee las 24 horas del día pedido y descarta otros días", () => {
    expect(parseAir(air, "2026-11-18")).toHaveLength(24);
    expect(parseAir(air, "2026-11-17")).toHaveLength(24);
    expect(parseAir(air, "2026-11-19")).toEqual([]);
  });
  it("las escalas coinciden con las oficiales (EPA y OMS) en cada borde", () => {
    expect([50, 51, 100, 101, 150, 151, 200, 201].map(aqiLabel)).toEqual(["bueno", "moderado", "moderado", "dañino para personas sensibles", "dañino para personas sensibles", "dañino", "dañino", "muy dañino"]);
    expect([2.9, 3, 5.9, 6, 7.9, 8, 10.9, 11].map(uvLabel)).toEqual(["baja", "moderada", "moderada", "alta", "alta", "muy alta", "muy alta", "extrema"]);
  });
  it("aire malo o UV muy alto piden atención; lo normal solo informa", () => {
    const bad = airContext(hrs(130, 9));
    expect(bad.find((x) => x.kind === "aire")).toMatchObject({ severity: "aviso", certainty: "pronostico" });
    expect(bad.find((x) => x.kind === "uv")).toMatchObject({ severity: "aviso" });
    const ok = airContext(hrs(40, 4));
    expect(ok.every((x) => x.severity === "info")).toBe(true);
    expect(airContext(hrs(100, 7.9)).every((x) => x.severity === "info")).toBe(true); // 100 y 7,9 aún no son aviso
    expect(airContext(hrs(40, 8)).find((x) => x.kind === "uv")!.severity).toBe("aviso"); // 8 ya es «muy alta»
  });
  it("solo cuenta el tramo en que se anda por la calle (8–20 h)", () => {
    const night = Array.from({ length: 24 }, (_, hour) => ({ hour, aqi: hour < 6 ? 300 : 30, pm25: null, uv: 0 }));
    expect(airContext(night).find((x) => x.kind === "aire")!.severity).toBe("info");
  });
  it("el título dice la hora del máximo de UV", () => {
    expect(airContext(hrs(40, 9)).find((x) => x.kind === "uv")!.title).toContain("13:00");
  });
  it("sin datos no inventa nada", () => expect(airContext([])).toEqual([]));
  it("no consulta fuera del alcance del pronóstico", async () => {
    let calls = 0;
    const f = (async () => { calls++; return json(air); }) as typeof fetch;
    expect(await fetchAir(-33, -70, "2026-11-30", "America/Santiago", NOW, { fetchImpl: f })).toBeNull();
    expect(calls).toBe(0);
    expect((await fetchAir(-33, -70, "2026-11-18", "America/Santiago", NOW, { fetchImpl: f }))!.length).toBe(24);
  });
});

describe("contexto del día (todas las fuentes juntas)", () => {
  const route = (over: Partial<Record<"nager" | "air", () => Response | Promise<Response>>> = {}) =>
    (async (u: string) => (u.includes("nager.at") ? (over.nager ?? (() => json(nager)))() : (over.air ?? (() => json(air)))())) as unknown as typeof fetch;

  it("ciudad desconocida → null", async () => expect(await computeDayContext("atlantis", "2026-11-18", { now: NOW, fetchImpl: route() })).toBeNull());
  it("junta aire, UV y feriado, con avisos primero", async () => {
    const r = (await computeDayContext("santiago-cl", "2026-12-25", { now: new Date("2026-12-24T12:00:00Z"), fetchImpl: route() }))!;
    expect(r.items[0]!.kind).toBe("feriado");
    expect(r.items[0]!.severity).toBe("aviso");
    expect(r.fetchedAt).toBe("2026-12-24T12:00:00.000Z");
  });
  it("los avisos van antes que lo informativo aunque se hayan reunido después", async () => {
    const bad = JSON.parse(JSON.stringify(air));
    bad.hourly.us_aqi = bad.hourly.us_aqi.map(() => 160);
    const hol = [{ date: "2026-11-19", localName: "Fiesta", global: true }]; // víspera = info, se reúne antes que el aire
    const r = (await computeDayContext("santiago-cl", "2026-11-18", { now: NOW, fetchImpl: route({ nager: () => json(hol), air: () => json(bad) }) }))!;
    expect(r.items.map((i) => i.severity)).toEqual([...r.items.map((i) => i.severity)].sort((a) => (a === "aviso" ? -1 : 1)));
    expect(r.items[0]!.severity).toBe("aviso");
    expect(r.items.at(-1)!.severity).toBe("info");
  });
  it("si una fuente falla, las otras siguen y la falla se informa", async () => {
    const r = (await computeDayContext("santiago-cl", "2026-11-18", { now: NOW, fetchImpl: route({ nager: () => json({}, 500) }) }))!;
    expect(r.gaps.map((g) => g.source)).toEqual(["Feriados (Nager.Date)"]);
    expect(r.items.some((i) => i.kind === "aire")).toBe(true);
  });
  it("una fecha lejana dice por qué no hay aire, sin inventar", async () => {
    const r = (await computeDayContext("santiago-cl", "2026-12-20", { now: NOW, fetchImpl: route() }))!;
    expect(r.items.some((i) => i.kind === "aire" || i.kind === "uv")).toBe(false);
    expect(r.gaps[0]!.reason).toMatch(/hasta 4 días/);
  });
  it("usa el país de la ciudad", async () => {
    const urls: string[] = [];
    await computeDayContext("sao-paulo-br", "2026-11-18", { now: NOW, fetchImpl: (async (u: string) => { urls.push(u); return json(u.includes("nager") ? [] : air); }) as unknown as typeof fetch });
    expect(urls.find((u) => u.includes("nager"))).toContain("/2026/BR");
  });
  it("la víspera de un 31 de diciembre mira también el año siguiente", async () => {
    const urls: string[] = [];
    await computeDayContext("santiago-cl", "2026-12-31", { now: new Date("2026-12-30T12:00:00Z"), fetchImpl: (async (u: string) => { urls.push(u); return json(u.includes("nager") ? [] : air); }) as unknown as typeof fetch });
    expect(urls.filter((u) => u.includes("nager")).map((u) => u.slice(-7))).toEqual(["2026/CL", "2027/CL"]);
  });
});
