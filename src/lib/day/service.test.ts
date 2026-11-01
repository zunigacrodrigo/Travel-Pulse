import { beforeEach, describe, expect, it } from "vitest";
import fixture from "./__fixtures__/nominatim-sp-real.json";
import meteo from "./__fixtures__/openmeteo-sp-real.json";
import wiki from "./__fixtures__/wikipedia-summary-real.json";
import { _resetMediaCache } from "./media";
import { _resetPlacesCache } from "./places";
import { computeDayPlan, dayInputSchema, type DayInput } from "./service";

const day = meteo.hourly.time[0]!.slice(0, 10);
const NOW = new Date(`${day}T00:00:00Z`);
const base: DayInput = { city: "sao-paulo-br", date: day, startMin: 660, endMin: 1380, wishes: [{ kind: "museo" }, { kind: "restaurante" }, { kind: "pub" }] };

/** Doble de la red: responde lo que respondió el mundo real al grabar los fixtures. */
function net(over: { nominatim?: "ok" | "fail"; osrm?: "ok" | "fail"; meteo?: "ok" | "fail"; wiki?: "ok" | "fail" } = {}): typeof fetch {
  return (async (input: string) => {
    const u = String(input);
    if (u.includes("nominatim")) {
      if (over.nominatim === "fail") return new Response("x", { status: 503 });
      const q = new URL(u).searchParams.get("q");
      const key = q === "museum" ? "museum" : q === "restaurant" ? "restaurant" : "pub";
      return new Response(JSON.stringify((fixture as Record<string, unknown>)[key]));
    }
    if (u.includes("routing.openstreetmap.de")) {
      if (over.osrm === "fail") return new Response("x", { status: 502 });
      const n = u.split("?")[0]!.split("/").pop()!.split(";").length;
      const foot = u.includes("routed-foot");
      return new Response(JSON.stringify({ code: "Ok", durations: Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 0 : (foot ? 900 : 300) + Math.abs(i - j) * 30))) }));
    }
    if (u.includes("wikipedia.org")) return over.wiki === "fail" ? new Response("x", { status: 429 }) : new Response(JSON.stringify(wiki));
    if (u.includes("open-meteo")) {
      if (over.meteo === "fail") return new Response("x", { status: 429 });
      return new Response(JSON.stringify(meteo));
    }
    return new Response("?", { status: 404 });
  }) as unknown as typeof fetch;
}

beforeEach(() => { _resetPlacesCache(); _resetMediaCache(); });

describe("dayInputSchema", () => {
  it("acepta una petición válida y rechaza ciudades fuera del piloto, campos extra y días de menos de una hora", () => {
    expect(dayInputSchema.safeParse(base).success).toBe(true);
    expect(dayInputSchema.safeParse({ ...base, city: "buenos-aires-ar" }).success).toBe(false);
    expect(dayInputSchema.safeParse({ ...base, extra: 1 }).success).toBe(false);
    expect(dayInputSchema.safeParse({ ...base, startMin: 700, endMin: 740 }).success).toBe(false);
    expect(dayInputSchema.safeParse({ ...base, wishes: [] }).success).toBe(false);
    expect(dayInputSchema.safeParse({ ...base, wishes: [{ kind: "tienda" }] }).success).toBe(false);
    expect(dayInputSchema.safeParse({ ...base, date: "5-11-2026" }).success).toBe(false);
  });
});

describe("computeDayPlan", () => {
  it("arma el día con lugares, traslados y pronóstico, y cita sus fuentes", async () => {
    const r = await computeDayPlan(base, { fetchImpl: net(), now: NOW, spacingMs: 0 });
    expect(r.plan.stops.length).toBeGreaterThanOrEqual(2);
    expect(r.sources.map((s) => s.status)).toEqual(["ok", "ok", "ok", "ok"]);
    expect(r.weather?.hours).toHaveLength(24);
    expect(r.warnings).toEqual([]);
    for (const s of r.plan.stops) expect(s.endMin).toBeLessThanOrEqual(base.endMin);
  });
  it("agrega la foto y descripción de Wikipedia a las paradas que tienen artículo en OpenStreetMap", async () => {
    const r = await computeDayPlan(base, { fetchImpl: net(), now: NOW, spacingMs: 0 });
    const conArticulo = r.plan.stops.filter((s) => s.place.wikipedia);
    expect(conArticulo.length).toBeGreaterThan(0);
    for (const s of conArticulo) expect(r.media[s.place.id]?.thumbnailUrl).toMatch(/^https:\/\/thumb\.wikimedia\.org\//);
    expect(r.plan.stops.filter((s) => !s.place.wikipedia).every((s) => !(s.place.id in r.media))).toBe(true);
  });
  it("si Wikipedia falla, el día se arma igual y los lugares quedan sin foto (no es una advertencia)", async () => {
    const r = await computeDayPlan(base, { fetchImpl: net({ wiki: "fail" }), now: NOW, spacingMs: 0 });
    expect(r.plan.stops.length).toBeGreaterThan(0);
    expect(r.media).toEqual({});
    expect(r.warnings).toEqual([]);
  });
  it("devuelve los candidatos por tipo para poder cambiar un lugar", async () => {
    const r = await computeDayPlan(base, { fetchImpl: net(), now: NOW, spacingMs: 0 });
    expect(r.candidates.museo.length).toBeGreaterThan(0);
    expect(r.candidates.museo.length).toBeLessThanOrEqual(8);
    expect(r.candidates.galeria).toEqual([]);
  });
  it("si OpenStreetMap falla, lo dice y no inventa lugares", async () => {
    const r = await computeDayPlan(base, { fetchImpl: net({ nominatim: "fail" }), now: NOW, spacingMs: 0 });
    expect(r.plan.stops).toHaveLength(0);
    expect(r.warnings.join(" ")).toMatch(/No pudimos consultar museos/);
    expect(r.plan.unplaced).toHaveLength(3);
    expect(r.sources[0]!.status).toBe("error");
  });
  it("si fallan los traslados, arma el día igual con 30 min reservados y lo avisa", async () => {
    const r = await computeDayPlan(base, { fetchImpl: net({ osrm: "fail" }), now: NOW, spacingMs: 0 });
    expect(r.plan.stops.length).toBeGreaterThan(0);
    expect(r.plan.stops.every((s) => s.travel === null)).toBe(true);
    expect(r.warnings.join(" ")).toMatch(/traslados/);
  });
  it("si falla el pronóstico, lo avisa y no afirma nada de la lluvia", async () => {
    const r = await computeDayPlan(base, { fetchImpl: net({ meteo: "fail" }), now: NOW, spacingMs: 0 });
    expect(r.weather).toBeNull();
    expect(r.plan.stops.length).toBeGreaterThan(0);
    expect(r.plan.stops.every((s) => !s.rainOnVisit && !s.rainOnTravel)).toBe(true);
    expect(r.warnings.join(" ")).toMatch(/pronóstico/);
  });
  it("una fecha lejana no consulta el pronóstico y lo declara fuera de alcance", async () => {
    const r = await computeDayPlan({ ...base, date: "2027-03-04" }, { fetchImpl: net(), now: NOW, spacingMs: 0 });
    expect(r.weather).toBeNull();
    expect(r.sources.find((s) => s.name === "Open-Meteo")!.status).toBe("fuera_de_alcance");
  });
  it("respeta un lugar elegido aunque no esté entre los primeros 8", async () => {
    const todos = await computeDayPlan({ ...base, wishes: [{ kind: "museo" }] }, { fetchImpl: net(), now: NOW, spacingMs: 0 });
    _resetPlacesCache();
    const ultimo = todos.candidates.museo.at(-1)!;
    const r = await computeDayPlan({ ...base, wishes: [{ kind: "museo", pin: ultimo.id }] }, { fetchImpl: net(), now: NOW, spacingMs: 0 });
    expect(r.candidates.museo.some((p) => p.id === ultimo.id)).toBe(true);
  });
});
