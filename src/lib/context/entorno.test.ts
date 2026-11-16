import { beforeEach, describe, expect, it } from "vitest";
import birds from "./__fixtures__/gbif-aves-santiago.json";
import wd from "./__fixtures__/wikidata-heritage-santiago.json";
import { computeEntorno } from "./entorno";
import { _clearHeritageCacheForTests, fetchHeritage, heritageQuery, parseHeritage } from "./heritage";
import { _clearNatureCacheForTests, fetchNature, parseNature, speciesName } from "./nature";

const NOW = new Date("2026-11-16T15:00:00Z");
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
const f = (fn: (u: string) => Response) => ((async (u: string) => fn(u)) as unknown) as typeof fetch;
beforeEach(() => { _clearHeritageCacheForTests(); _clearNatureCacheForTests(); });

describe("patrimonio (datos reales de Wikidata, Santiago, 16-nov-2026)", () => {
  const sites = parseHeritage(wd);
  it("agrupa las filas repetidas: un bien con varias declaratorias aparece una vez, con todas", () => {
    expect(new Set(sites.map((s) => s.id)).size).toBe(sites.length);
    const moneda = sites.find((s) => s.name === "Palacio de La Moneda")!;
    expect(moneda.designations).toEqual(expect.arrayContaining(["Monumento Histórico de Chile", "lista indicativa del Patrimonio de la Humanidad"]));
    expect(moneda.designations).toHaveLength(2);
    expect(sites.find((s) => s.name === "Cerro Santa Lucía")!.designations).toHaveLength(2);
  });
  it("ordena por idiomas de Wikipedia (qué tan conocido es), de mayor a menor, con enlace al dato de origen", () => {
    expect(sites[0]!.name).toBe("Palacio de La Moneda");
    expect(sites.map((s) => s.languages)).toEqual([...sites.map((s) => s.languages)].sort((a, b) => b - a));
    expect(sites[0]!.url).toBe("https://www.wikidata.org/wiki/Q1146881");
  });
  it("trae coordenadas reales dentro de Santiago", () => {
    for (const s of sites) { expect(s.lat).toBeGreaterThan(-33.6); expect(s.lat).toBeLessThan(-33.3); }
  });
  it("respeta el máximo y descarta bienes sin nombre (solo código)", () => {
    expect(parseHeritage(wd, 3)).toHaveLength(3);
    const raw = { results: { bindings: [{ x: { value: "http://www.wikidata.org/entity/Q1" }, xLabel: { value: "Q1" }, sl: { value: "9" } }] } };
    expect(parseHeritage(raw)).toEqual([]);
  });
  it("basura → vacío; una declaratoria sin nombre no se muestra como código", () => {
    expect(parseHeritage(null)).toEqual([]);
    expect(parseHeritage({ results: { bindings: [null, 3, {}] } })).toEqual([]);
    const raw = { results: { bindings: [{ x: { value: "http://www.wikidata.org/entity/Q2" }, xLabel: { value: "Plaza" }, desLabel: { value: "Q99" }, sl: { value: "4" } }] } };
    expect(parseHeritage(raw)[0]!.designations).toEqual([]);
  });
  it("una misma declaratoria repetida en varias filas se cuenta una vez", () => {
    const row = { x: { value: "http://www.wikidata.org/entity/Q5" }, xLabel: { value: "Iglesia" }, desLabel: { value: "Monumento Histórico" }, sl: { value: "3" } };
    expect(parseHeritage({ results: { bindings: [row, row, row] } })[0]!.designations).toEqual(["Monumento Histórico"]);
  });
  it("con el mismo número de idiomas ordena por nombre; con distinto, por más conocido", () => {
    const r = (id: string, name: string, sl: string) => ({ x: { value: `http://www.wikidata.org/entity/${id}` }, xLabel: { value: name }, sl: { value: sl } });
    const out = parseHeritage({ results: { bindings: [r("Q1", "Zeta", "5"), r("Q2", "Alfa", "5"), r("Q3", "Menor", "2"), r("Q4", "Mayor", "9")] } });
    expect(out.map((x) => x.name)).toEqual(["Mayor", "Alfa", "Zeta", "Menor"]);
  });
  it("la consulta usa longitud primero (formato WKT) y el radio pedido", () => {
    const q = heritageQuery(-33.4, -70.6, 4);
    expect(q).toContain('Point(-70.6 -33.4)');
    expect(q).toContain('wikibase:radius "4"');
  });
  it("caché de 7 días y copia vieja si Wikidata limita", async () => {
    let n = 0;
    const ok = f(() => { n++; return json(wd); });
    await fetchHeritage("santiago-cl", -33.4, -70.6, NOW, { fetchImpl: ok });
    await fetchHeritage("santiago-cl", -33.4, -70.6, new Date(NOW.getTime() + 6 * 86_400_000), { fetchImpl: ok });
    expect(n).toBe(1);
    const later = new Date(NOW.getTime() + 8 * 86_400_000);
    const r = await fetchHeritage("santiago-cl", -33.4, -70.6, later, { fetchImpl: f(() => json({}, 429)) });
    expect(r.stale).toBe(true);
    expect(r.sites.length).toBeGreaterThan(0);
  });
  it("sin copia y con la fuente caída, falla en vez de inventar", async () => {
    await expect(fetchHeritage("santiago-cl", -33.4, -70.6, NOW, { fetchImpl: f(() => json({}, 429)) })).rejects.toThrow();
  });
});

describe("aves (datos reales de GBIF, Santiago, 16-nov-2026)", () => {
  const { total, species } = parseNature(birds);
  it("nombra especies sin la autoría y descarta registros que solo llegan a género", () => {
    expect(species.map((s) => s.scientificName)).toContain("Turdus falcklandii");
    expect(species.every((s) => /^[A-Z][a-z]+ [a-z-]+$/.test(s.scientificName))).toBe(true);
    expect(species.map((s) => s.scientificName)).not.toContain("Daptrius");
    expect(total).toBe(290190);
  });
  it("ordena por registros y devuelve como máximo 6", () => {
    expect(species.length).toBeLessThanOrEqual(6);
    expect(species.map((s) => s.records)).toEqual([...species.map((s) => s.records)].sort((a, b) => b - a));
    expect(species[0]).toEqual({ scientificName: "Turdus falcklandii", records: 30300 });
  });
  it("speciesName: casos de borde", () => {
    expect(speciesName("Zenaida auriculata (Des Murs, 1847)")).toBe("Zenaida auriculata");
    expect(speciesName("Daptrius Vieillot, 1816")).toBeNull();
    expect(speciesName("Cyanoliseus patagonus subsp. bloxami")).toBe("Cyanoliseus patagonus");
    expect(speciesName("")).toBeNull();
  });
  it("suma las variantes de una misma especie", () => {
    const raw = { count: 10, facets: [{ counts: [{ name: "Turdus falcklandii Quoy, 1824", count: 5 }, { name: "Turdus falcklandii (otra autoría)", count: 3 }, { name: "Passer domesticus (L.)", count: 1 }] }] };
    expect(parseNature(raw).species).toEqual([{ scientificName: "Turdus falcklandii", records: 8 }, { scientificName: "Passer domesticus", records: 1 }]);
  });
  it("basura → vacío", () => { expect(parseNature(null)).toEqual({ total: 0, species: [] }); expect(parseNature({ facets: [] })).toEqual({ total: 0, species: [] }); });
  it("ordena por registros aunque la fuente no venga ordenada", () => {
    const raw = { count: 9, facets: [{ counts: [{ name: "Aus bus", count: 1 }, { name: "Cus dus", count: 7 }, { name: "Eus fus", count: 3 }] }] };
    expect(parseNature(raw).species.map((x) => x.records)).toEqual([7, 3, 1]);
  });
  it("acepta epítetos con guion y no un resultado vacío en la caché", async () => {
    expect(speciesName("Aus bus-cus Author, 1900")).toBe("Aus bus-cus");
    let n = 0;
    const vacio = f(() => { n++; return json({ count: 0, facets: [{ counts: [] }] }); });
    await fetchNature("santiago-cl", -33.4, -70.6, NOW, { fetchImpl: vacio });
    await fetchNature("santiago-cl", -33.4, -70.6, NOW, { fetchImpl: vacio });
    expect(n).toBe(2);
  });
  it("consulta aves de los últimos 5 años en una caja alrededor del centro", async () => {
    let url = "";
    const r = await fetchNature("santiago-cl", -33.4372, -70.6506, NOW, { fetchImpl: f((u) => { url = u; return json(birds); }) });
    const q = new URL(url).searchParams;
    expect(q.get("classKey")).toBe("212");
    expect(q.get("year")).toBe("2021,2026");
    expect(q.get("occurrenceStatus")).toBe("PRESENT");
    expect(q.get("decimalLatitude")!.split(",").map(Number).map((x) => +x.toFixed(2))).toEqual([-33.54, -33.34]);
    expect(r.yearFrom).toBe(2021);
  });
  it("caché de 7 días y copia vieja si GBIF falla", async () => {
    let n = 0;
    const ok = f(() => { n++; return json(birds); });
    await fetchNature("santiago-cl", -33.4, -70.6, NOW, { fetchImpl: ok });
    await fetchNature("santiago-cl", -33.4, -70.6, new Date(NOW.getTime() + 6 * 86_400_000), { fetchImpl: ok });
    expect(n).toBe(1);
    expect((await fetchNature("santiago-cl", -33.4, -70.6, new Date(NOW.getTime() + 8 * 86_400_000), { fetchImpl: f(() => json({}, 500)) })).stale).toBe(true);
  });
});

describe("entorno (patrimonio + aves)", () => {
  const route = (over: { wd?: Response; gbif?: Response } = {}) => f((u) => (u.includes("wikidata") ? (over.wd ?? json(wd)) : (over.gbif ?? json(birds))));
  it("ciudad desconocida → null", async () => expect(await computeEntorno("atlantis", { now: NOW, fetchImpl: route() })).toBeNull());
  it("junta ambas fuentes", async () => {
    const e = (await computeEntorno("santiago-cl", { now: NOW, fetchImpl: route() }))!;
    expect(e.heritage!.sites.length).toBeGreaterThan(0);
    expect(e.nature!.species.length).toBeGreaterThan(0);
    expect(e.gaps).toEqual([]);
  });
  it("si una falla, la otra sigue y la falla se informa con su fuente", async () => {
    const a = (await computeEntorno("santiago-cl", { now: NOW, fetchImpl: route({ wd: json({}, 429) }) }))!;
    expect(a.heritage).toBeNull(); expect(a.nature).not.toBeNull();
    expect(a.gaps.map((g) => g.source)).toEqual(["Patrimonio (Wikidata)"]);
    _clearNatureCacheForTests(); _clearHeritageCacheForTests();
    const b = (await computeEntorno("santiago-cl", { now: NOW, fetchImpl: route({ gbif: json({}, 500) }) }))!;
    expect(b.nature).toBeNull(); expect(b.heritage).not.toBeNull();
    expect(b.gaps.map((g) => g.source)).toEqual(["Aves (GBIF)"]);
  });
});
