import { beforeEach, describe, expect, it } from "vitest";
import santiago from "./__fixtures__/wikivoyage-es-santiago.json";
import { _clearGuideCacheForTests, excerpt, extractTips, fetchGuide, parseSections } from "./guide";

const NOW = new Date("2026-11-16T15:00:00Z");
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
beforeEach(() => _clearGuideCacheForTests());

describe("guía de Wikivoyage (texto real de «Santiago de Chile», 16-nov-2026)", () => {
  const tips = extractTips(santiago);
  it("encuentra lo que SÍ tiene texto; en la guía real en español «Seguridad», «Salud» y «Respetar» de Santiago están vacías y no se inventan", () => {
    expect(tips.map((t) => t.id)).toEqual(["movilidad", "comer"]);
    expect(tips.every((t) => t.lang === "es")).toBe(true);
  });
  it("cada consejo es texto de la guía, ni vacío ni gigante, y sin marcas de encabezado", () => {
    for (const t of tips) { expect(t.text.length).toBeGreaterThanOrEqual(40); expect(t.text.length).toBeLessThanOrEqual(620); expect(t.text).not.toMatch(/==/); }
  });
  it("el consejo de movilidad es el texto de la sección «Desplazarse» y no de otra", () => {
    const body = parseSections((Object.values((santiago as { query: { pages: Record<string, { extract: string }> } }).query.pages)[0]!).extract).find((s) => s.heading === "Desplazarse")!.body.replace(/\s+/g, " ").trim();
    expect(body.startsWith(tips.find((t) => t.id === "movilidad")!.text.slice(0, 40))).toBe(true);
  });
});

describe("parseSections y excerpt", () => {
  const txt = "intro\n== Comer ==\nHay mucho.\n=== Dulces ===\nSopaipillas.\n== Dormir ==\nHoteles.";
  it("separa por secciones de nivel 2 e incluye subsecciones sin su encabezado", () => {
    expect(parseSections(txt).map((s) => [s.heading, s.body.replace(/\s+/g, " ").trim()])).toEqual([["Comer", "Hay mucho. Sopaipillas."], ["Dormir", "Hoteles."]]);
  });
  it("no corta a media palabra y marca cuando recorta", () => {
    const e = excerpt("Palabra ".repeat(200), 100);
    expect(e.length).toBeLessThanOrEqual(101);
    expect(e.endsWith("…")).toBe(true);
    expect(e).not.toMatch(/Palabr$/);
  });
  it("prefiere terminar en una frase completa", () => {
    const e = excerpt("Primera frase larga y completa de prueba. Segunda frase que ya no entra del todo en el límite pedido aquí.", 70);
    expect(e).toBe("Primera frase larga y completa de prueba.");
  });
  it("un texto corto queda intacto", () => expect(excerpt("  Hola   mundo ", 600)).toBe("Hola mundo"));
});

describe("extractTips con respuestas raras", () => {
  it("página inexistente o basura → sin consejos, sin lanzar", () => {
    expect(extractTips({ query: { pages: { "-1": { missing: "" } } } })).toEqual([]);
    expect(extractTips(null)).toEqual([]);
    const largo = "Texto suficientemente largo para pasar el mínimo de cuarenta caracteres.";
    expect(extractTips({ query: { pages: { 1: { missing: "", extract: `== Comer ==\n${largo}` } } } })).toEqual([]); // marcada como inexistente
    expect(extractTips({ query: { pages: { 1: { extract: `== Comer ==\n${largo}` } } } }).map((t) => t.id)).toEqual(["comer"]);
    expect(extractTips({ query: { pages: { 1: { extract: "== Comer ==\ncorto" } } } })).toEqual([]);
  });
});

describe("fetchGuide", () => {
  const ok = (() => json(santiago)) as unknown as typeof fetch;
  it("ciudad sin guía conocida → null y sin llamadas", async () => {
    let n = 0;
    expect(await fetchGuide("atlantis", NOW, { fetchImpl: (async () => { n++; return ok(""); }) as unknown as typeof fetch })).toBeNull();
    expect(n).toBe(0);
  });
  it("trae la guía con enlace y licencia", async () => {
    const g = (await fetchGuide("santiago-cl", NOW, { fetchImpl: ok }))!;
    expect(g.pageUrl).toBe("https://es.wikivoyage.org/wiki/Santiago_de_Chile");
    expect(g.license).toBe("CC BY-SA 4.0");
    expect(g.stale).toBe(false);
    expect(g.tips.map((t) => t.id)).toEqual(["movilidad", "comer"]);
  });
  it("la segunda vez usa la copia guardada (no vuelve a pedir en 24 h)", async () => {
    let n = 0;
    const f = (async (u: string) => { if (u.includes("es.wikivoyage")) n++; return json(santiago); }) as unknown as typeof fetch;
    await fetchGuide("santiago-cl", NOW, { fetchImpl: f });
    await fetchGuide("santiago-cl", new Date(NOW.getTime() + 23 * 3_600_000), { fetchImpl: f });
    expect(n).toBe(1);
    await fetchGuide("santiago-cl", new Date(NOW.getTime() + 25 * 3_600_000), { fetchImpl: f });
    expect(n).toBe(2);
  });
  it("si Wikivoyage limita (429) sirve la copia vieja marcada como tal", async () => {
    await fetchGuide("santiago-cl", NOW, { fetchImpl: ok });
    const g = (await fetchGuide("santiago-cl", new Date(NOW.getTime() + 30 * 3_600_000), { fetchImpl: (async () => json({}, 429)) as unknown as typeof fetch }))!;
    expect(g.stale).toBe(true);
    expect(g.tips.length).toBe(2);
  });
  it("sin copia y con la fuente caída, falla (la pantalla lo dirá) en vez de inventar", async () => {
    await expect(fetchGuide("santiago-cl", NOW, { fetchImpl: (async () => json({}, 429)) as unknown as typeof fetch })).rejects.toThrow();
  });
  it("una página sin consejos útiles no se guarda como si fuera buena", async () => {
    let n = 0;
    const vacio = (async (u: string) => { if (u.includes("es.wikivoyage")) n++; return json({ query: { pages: { "-1": { missing: "" } } } }); }) as unknown as typeof fetch;
    await fetchGuide("santiago-cl", NOW, { fetchImpl: vacio });
    await fetchGuide("santiago-cl", NOW, { fetchImpl: vacio });
    expect(n).toBe(2);
  });
  describe("respaldo en inglés cuando la sección está vacía en español", () => {
    // Texto SINTÉTICO con la forma de la guía inglesa (el encabezado «Stay safe» existe en la real; el texto, no verificado).
    const en = { query: { pages: { 1: { extract: "== Get around ==\nUse the metro, it is fast and cheap but crowded at rush hour. Buy a card.\n== Stay safe ==\nPickpocketing is common around Plaza de Armas and on the metro; keep valuables in front pockets and avoid empty streets at night." } } } };
    const both = (async (u: string) => json(u.includes("en.wikivoyage") ? en : santiago)) as unknown as typeof fetch;
    it("completa SOLO la seguridad con la guía inglesa y la marca como inglés", async () => {
      const g = (await fetchGuide("santiago-cl", NOW, { fetchImpl: both }))!;
      expect(g.tips.map((t) => [t.id, t.lang])).toEqual([["movilidad", "es"], ["seguridad", "en"], ["comer", "es"]]);
      expect(g.tips.find((t) => t.id === "seguridad")!.text).toMatch(/Pickpocketing/);
    });
    it("si el respaldo falla, igual entrega lo que hay en español", async () => {
      const f = (async (u: string) => (u.includes("en.wikivoyage") ? json({}, 429) : json(santiago))) as unknown as typeof fetch;
      expect((await fetchGuide("santiago-cl", NOW, { fetchImpl: f }))!.tips.map((t) => t.id)).toEqual(["movilidad", "comer"]);
    });
    it("si el español ya trae seguridad, no pide la guía inglesa", async () => {
      const es = { query: { pages: { 1: { extract: "== Seguridad ==\nEvite las calles solas de noche y no muestre el teléfono en el metro; hay carteristas.\n" } } } };
      const hosts: string[] = [];
      await fetchGuide("santiago-cl", NOW, { fetchImpl: (async (u: string) => { hosts.push(new URL(u).host); return json(es); }) as unknown as typeof fetch });
      expect(hosts).toEqual(["es.wikivoyage.org"]);
    });
  });
});
