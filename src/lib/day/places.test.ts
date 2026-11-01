import { beforeEach, describe, expect, it } from "vitest";
import fixture from "./__fixtures__/nominatim-sp-real.json";
import { _resetPlacesCache, fetchPlaces, normalizePlaces, rankPlaces } from "./places";

describe("normalizePlaces con respuestas reales de São Paulo", () => {
  it("museos: conserva los reales y trae el MASP con su horario interpretado", () => {
    const r = normalizePlaces(fixture.museum, "museo");
    expect(r.length).toBeGreaterThan(10);
    const masp = r.find((p) => /Museu de Arte de São Paulo/.test(p.name))!;
    expect(masp.hoursRaw).toBe("Tu-Su 10:00-18:00; Th 10:00-20:00");
    expect(masp.hours).not.toBeNull();
    expect(masp.indoor).toBe(true);
  });
  it("restaurantes: descarta la «food court» llamada Restaurant y los nombres que son calles", () => {
    const r = normalizePlaces(fixture.restaurant, "restaurante");
    expect(r.some((p) => p.name === "Restaurant")).toBe(false);
    expect(r.some((p) => /^Rua /i.test(p.name))).toBe(false);
    expect(r.every((p) => p.kind === "restaurante")).toBe(true);
  });
  it("cada lugar trae coordenadas válidas y un id estable", () => {
    for (const k of ["museum", "restaurant", "pub"] as const) {
      const kind = k === "museum" ? "museo" : k === "restaurant" ? "restaurante" : "pub";
      for (const p of normalizePlaces(fixture[k], kind)) {
        expect(Math.abs(p.lat)).toBeLessThanOrEqual(90);
        expect(p.id).toMatch(/\//);
      }
    }
  });
  it("sin horario interpretable queda en null: jamás se supone abierto", () => {
    const sinHorario = normalizePlaces(fixture.restaurant, "restaurante").filter((p) => !p.hoursRaw);
    expect(sinHorario.length).toBeGreaterThan(0);
    expect(sinHorario.every((p) => p.hours === null)).toBe(true);
  });
  it("entradas inválidas no rompen nada", () => {
    expect(normalizePlaces(null, "museo")).toEqual([]);
    expect(normalizePlaces([null, 5, {}], "museo")).toEqual([]);
    expect(normalizePlaces([{ name: "X", lat: "abc", lon: "1", category: "tourism", type: "museum" }], "museo")).toEqual([]);
  });
  it("un tipo no se mezcla con otro", () => {
    expect(normalizePlaces(fixture.museum, "restaurante")).toEqual([]);
  });
  it("mismo nombre a menos de 150 m = un solo lugar", () => {
    const dup = [
      { osm_type: "node", osm_id: 1, lat: "-23.5614", lon: "-46.6559", name: "Museu X", category: "tourism", type: "museum", extratags: {} },
      { osm_type: "way", osm_id: 2, lat: "-23.5615", lon: "-46.6560", name: "Museu X", category: "tourism", type: "museum", extratags: {} },
      { osm_type: "way", osm_id: 3, lat: "-23.6000", lon: "-46.7000", name: "Museu X", category: "tourism", type: "museum", extratags: {} },
    ];
    expect(normalizePlaces(dup, "museo")).toHaveLength(2);
  });
});

describe("galerías y centros culturales de São Paulo (datos reales)", () => {
  const g = normalizePlaces(fixture.galeria, "galeria");
  it("incluye centros de arte (Tomie Ohtake, CCBB, SESC) y galerías de arte", () => {
    const nombres = g.map((p) => p.name).join(" | ");
    expect(nombres).toMatch(/Tomie Ohtake/);
    expect(nombres).toMatch(/Banco do Brasil/);
    expect(nombres).toMatch(/Galeria Marta Tabra/);
  });
  it("el CCBB trae su horario real y lo demás queda sin confirmar", () => {
    expect(g.find((p) => /Banco do Brasil/.test(p.name))!.hoursRaw).toBe("We-Mo 09:00-21:00");
    expect(g.find((p) => /Tomie Ohtake/.test(p.name))!.hours).toBeNull();
  });
});

describe("rankPlaces: completitud y notoriedad, no calidad", () => {
  it("con horario primero, luego sitio web/wikidata, luego importancia", () => {
    const base = { id: "a", kind: "museo" as const, lat: 0, lon: 0, hoursRaw: null, hours: null, website: null, wikidata: null, wikipedia: null, cuisine: null, importance: 0, indoor: true };
    const conHorario = { ...base, id: "h", name: "H", hoursRaw: "24/7", hours: { days: [], holidayCaveat: false } };
    const conWeb = { ...base, id: "w", name: "W", website: "https://x.org" };
    const famoso = { ...base, id: "f", name: "F", importance: 0.9 };
    expect(rankPlaces([famoso, conWeb, conHorario]).map((p) => p.id)).toEqual(["h", "w", "f"]);
  });
});

describe("fetchPlaces", () => {
  beforeEach(() => _resetPlacesCache());
  it("pide el tipo correcto dentro de un cuadro acotado y guarda en caché", async () => {
    const urls: string[] = [];
    const f = (async (u: string) => { urls.push(u); return new Response(JSON.stringify(fixture.museum)); }) as unknown as typeof fetch;
    const c = { lat: -23.5614, lon: -46.6559 };
    const a = await fetchPlaces("museo", c, { fetchImpl: f, spacingMs: 0 });
    const b = await fetchPlaces("museo", c, { fetchImpl: f, spacingMs: 0 });
    expect(a.length).toBeGreaterThan(0);
    expect(b).toEqual(a);
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain("q=museum");
    expect(urls[0]).toContain("bounded=1");
    expect(urls[0]).toContain("extratags=1");
  });
  it("las galerías piden centros de arte Y «galeria de arte» (dos consultas, sin repetir lugares)", async () => {
    const urls: string[] = [];
    const f = (async (u: string) => { urls.push(u); return new Response(JSON.stringify(fixture.galeria)); }) as unknown as typeof fetch;
    const r = await fetchPlaces("galeria", { lat: -23.5614, lon: -46.6559 }, { fetchImpl: f, spacingMs: 0 });
    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain("q=arts%20centre");
    expect(urls[1]).toContain("q=galeria%20de%20arte");
    expect(new Set(r.map((p) => p.id)).size).toBe(r.length);
  });
  it("una respuesta que no es lista da vacío, y un error de red se propaga", async () => {
    const ok = (async () => new Response("{}")) as unknown as typeof fetch;
    expect(await fetchPlaces("pub", { lat: 1, lon: 1 }, { fetchImpl: ok, spacingMs: 0 })).toEqual([]);
    const bad = (async () => new Response("x", { status: 503 })) as unknown as typeof fetch;
    await expect(fetchPlaces("pub", { lat: 2, lon: 2 }, { fetchImpl: bad, spacingMs: 0 })).rejects.toThrow();
  });
});
