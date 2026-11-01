import { beforeEach, describe, expect, it } from "vitest";
import real from "./__fixtures__/wikipedia-summary-real.json";
import { _resetMediaCache, fetchMedia, parseSummary, parseWikipediaTag, shorten } from "./media";

describe("parseWikipediaTag", () => {
  it("separa idioma y título", () => expect(parseWikipediaTag("pt:Museu de Arte de São Paulo")).toEqual({ lang: "pt", title: "Museu de Arte de São Paulo" }));
  it("rechaza lo que no tiene el formato", () => {
    for (const t of ["", null, undefined, "Museu", "x:y", ":Museu", "pt:"]) expect(parseWikipediaTag(t as string)).toBeNull();
  });
});

describe("parseSummary con la respuesta real de Wikipedia", () => {
  const m = parseSummary(real)!;
  it("trae título, descripción, foto y enlace a la página", () => {
    expect(m.title).toBe("Museu de Arte de São Paulo");
    expect(m.description).toMatch(/museu/i);
    expect(m.pageUrl).toMatch(/^https:\/\/pt\.wikipedia\.org\/wiki\//);
  });
  it("la miniatura real es de thumb.wikimedia.org y se acepta", () => {
    expect(m.thumbnailUrl).toMatch(/^https:\/\/thumb\.wikimedia\.org\//);
  });
  it("el resumen se acorta sin cortar palabras", () => {
    expect(m.extract!.length).toBeLessThanOrEqual(221);
    expect(m.extract).not.toMatch(/\s$/);
  });
});

describe("seguridad de la foto", () => {
  const base = { title: "X", content_urls: { desktop: { page: "https://pt.wikipedia.org/wiki/X" } } };
  it("descarta imágenes de otros dominios o sin https", () => {
    expect(parseSummary({ ...base, thumbnail: { source: "https://evil.example/x.png" } })!.thumbnailUrl).toBeNull();
    expect(parseSummary({ ...base, thumbnail: { source: "http://upload.wikimedia.org/x.png" } })!.thumbnailUrl).toBeNull();
    expect(parseSummary({ ...base, thumbnail: { source: "javascript:alert(1)" } })!.thumbnailUrl).toBeNull();
    expect(parseSummary({ ...base, thumbnail: { source: "https://upload.wikimedia.org/x.png" } })!.thumbnailUrl).toMatch(/upload\.wikimedia\.org/);
  });
  it("sin página de Wikipedia válida no hay resultado", () => {
    expect(parseSummary({ title: "X" })).toBeNull();
    expect(parseSummary({ title: "X", content_urls: { desktop: { page: "https://evil.example/x" } } })).toBeNull();
    expect(parseSummary(null)).toBeNull();
  });
});

describe("shorten", () => {
  it("no toca los textos cortos", () => expect(shorten("Hola.")).toBe("Hola."));
  it("corta en el último punto si hay uno razonable", () => expect(shorten(`${"a".repeat(100)}. ${"b".repeat(200)}`, 220)).toBe(`${"a".repeat(100)}.`));
  it("si no, corta en una palabra y agrega puntos suspensivos", () => expect(shorten("palabra ".repeat(60), 50)).toMatch(/palabra…$/));
});

describe("fetchMedia", () => {
  beforeEach(() => _resetMediaCache());
  it("consulta el idioma correcto, guarda en caché y no repite la consulta", async () => {
    const urls: string[] = [];
    const f = (async (u: string) => { urls.push(u); return new Response(JSON.stringify(real)); }) as unknown as typeof fetch;
    const a = await fetchMedia("pt:Museu de Arte de São Paulo", { fetchImpl: f });
    const b = await fetchMedia("pt:Museu de Arte de São Paulo", { fetchImpl: f });
    expect(a).toEqual(b);
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain("https://pt.wikipedia.org/api/rest_v1/page/summary/Museu_de_Arte_de_S%C3%A3o_Paulo");
  });
  it("un fallo de red o límite de uso devuelve null (sin foto) y se reintenta después", async () => {
    let calls = 0;
    const f = (async () => { calls++; return calls === 1 ? new Response("x", { status: 429 }) : new Response(JSON.stringify(real)); }) as unknown as typeof fetch;
    expect(await fetchMedia("pt:Museu X", { fetchImpl: f })).toBeNull();
    expect(await fetchMedia("pt:Museu X", { fetchImpl: f })).not.toBeNull();
  });
  it("una etiqueta inválida ni consulta", async () => {
    let calls = 0;
    const f = (async () => { calls++; return new Response("{}"); }) as unknown as typeof fetch;
    expect(await fetchMedia("sin formato", { fetchImpl: f })).toBeNull();
    expect(calls).toBe(0);
  });
});
