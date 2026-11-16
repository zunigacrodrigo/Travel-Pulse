import { beforeEach, describe, expect, it } from "vitest";
import notesRaw from "./__fixtures__/osm-notes-santiago.json";
import pv from "./__fixtures__/pageviews-santa-lucia.json";
import transitRaw from "./__fixtures__/transitous-santiago.json";
import { TIE_BAND, curate, evidenceOf } from "./curate";
import { _resetInterestCache, fetchViews30, parsePageviews } from "./interest";
import type { Place } from "./places";
import { fetchNotes, notesNear, parseNotes } from "./street-notes";
import { describeTransit, fetchTransit, parseTransit } from "./transit";

const NOW = new Date("2026-11-16T15:00:00Z");
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
const P = (id: string, over: Partial<Place> = {}): Place => ({ id, name: id, kind: "museo", lat: -33.44, lon: -70.65, hoursRaw: "x", hours: { rules: [] } as unknown as Place["hours"], website: "https://x", wikidata: "Q1", wikipedia: `es:${id}`, cuisine: null, importance: 0.5, indoor: true, ...over });
const V = (o: Record<string, number | null>) => new Map(Object.entries(o));
beforeEach(() => _resetInterestCache());

describe("interés real: lecturas de Wikipedia (grabación REAL, Cerro Santa Lucía, 30 días)", () => {
  it("suma los 30 días de la respuesta real", () => {
    const total = (pv as { items: { views: number }[] }).items.reduce((a, b) => a + b.views, 0);
    expect(parsePageviews(pv)).toBe(total);
    expect(total).toBeGreaterThan(500);
  });
  it("basura o sin días → null (desconocido, no cero)", () => {
    expect(parsePageviews(null)).toBeNull();
    expect(parsePageviews({ items: [] })).toBeNull();
    expect(parsePageviews({ items: [{ views: "x" }, { views: -3 }] })).toBeNull();
  });
  it("consulta el artículo y el idioma de la etiqueta de OSM, 30 días hasta ayer, y guarda 24 h", async () => {
    const urls: string[] = [];
    const f = (async (u: string) => { urls.push(u); return json(pv); }) as unknown as typeof fetch;
    expect(await fetchViews30("es:Cerro Santa Lucía", NOW, { fetchImpl: f })).toBe(parsePageviews(pv));
    expect(urls[0]).toContain("/es.wikipedia/all-access/user/Cerro_Santa_Luc%C3%ADa/daily/20261017/20261115");
    await fetchViews30("es:Cerro Santa Lucía", NOW, { fetchImpl: f });
    expect(urls).toHaveLength(1);
  });
  it("sin etiqueta válida o con la fuente caída → null, sin lanzar", async () => {
    expect(await fetchViews30("sin-formato", NOW)).toBeNull();
    expect(await fetchViews30("es:X", NOW, { fetchImpl: (async () => json({}, 500)) as unknown as typeof fetch })).toBeNull();
  });
});

describe("curador", () => {
  const places = [P("Famoso"), P("Medio"), P("Oculto"), P("SinArticulo", { wikipedia: null, wikidata: null })];
  const views = V({ Famoso: 5000, Medio: 300, Oculto: 20, SinArticulo: null });
  it("«lo imperdible» pone primero lo más leído; «descubrir» lo invierte", () => {
    expect(curate(places, views, "clasico").map((c) => c.place.id)).toEqual(["Famoso", "Medio", "Oculto", "SinArticulo"]);
    expect(curate(places, views, "descubrir").map((c) => c.place.id)[0]).toBe("Oculto");
    expect(curate(places, views, "descubrir").map((c) => c.place.id).at(-1)).not.toBe("Oculto");
  });
  it("las razones dicen la cifra real y qué mide; lo desconocido se declara, no se trata como cero", () => {
    const c = curate(places, views, "clasico");
    expect(c[0]!.why[0]).toMatch(/De lo más buscado: unas 5\.000 lecturas en Wikipedia el último mes/);
    const sin = c.find((x) => x.place.id === "SinArticulo")!;
    expect(sin.views30).toBeNull();
    expect(sin.why[0]).toMatch(/Sin dato de interés/);
    expect(curate(places, views, "descubrir")[0]!.why[0]).toMatch(/Poco buscado \(unas 20 lecturas/);
  });
  it("en «descubrir» un lugar sin evidencia no gana por ser desconocido: no te manda a ciegas", () => {
    const ciego = P("Ciego", { hours: null, website: null, wikipedia: null, wikidata: null });
    const out = curate([ciego, P("Oculto")], V({ Ciego: null, Oculto: 20 }), "descubrir");
    expect(out[0]!.place.id).toBe("Oculto");
    expect(out.find((c) => c.place.id === "Ciego")!.why.join(" ")).toMatch(/horario no está confirmado/);
  });
  it("evidencia: horario 0,5 + web 0,2 + artículo o Wikidata 0,3", () => {
    expect(evidenceOf(P("a"))).toBeCloseTo(1);
    expect(evidenceOf(P("a", { hours: null }))).toBeCloseTo(0.5);
    expect(evidenceOf(P("a", { website: null, wikipedia: null }))).toBeCloseTo(0.8); // queda Wikidata
    expect(evidenceOf(P("a", { hours: null, website: null, wikipedia: null, wikidata: null }))).toBe(0);
  });
  it("«Otra propuesta» rota solo los lugares equivalentes y es determinista", () => {
    const eq = [P("A"), P("B"), P("C"), P("Lejos")];
    const v = V({ A: 1000, B: 950, C: 900, Lejos: 3 });
    const base = curate(eq, v, "clasico", 0).map((c) => c.place.id);
    expect(base).toEqual(["A", "B", "C", "Lejos"]);
    expect(curate(eq, v, "clasico", 1).map((c) => c.place.id)).toEqual(["B", "C", "A", "Lejos"]);
    expect(curate(eq, v, "clasico", 2).map((c) => c.place.id)).toEqual(["C", "A", "B", "Lejos"]);
    expect(curate(eq, v, "clasico", 3).map((c) => c.place.id)).toEqual(base); // da la vuelta
    expect(curate(eq, v, "clasico", 1)).toEqual(curate(eq, v, "clasico", 1));
  });
  it("un lugar claramente mejor no rota: la variedad no degrada la elección", () => {
    const out = curate([P("Top"), P("Bajo", { hours: null, website: null })], V({ Top: 9000, Bajo: 5 }), "clasico", 1);
    expect(out[0]!.place.id).toBe("Top");
    expect(out[0]!.score - out[1]!.score).toBeGreaterThan(TIE_BAND);
  });
  it("sin ningún dato de interés ordena por evidencia y lo dice", () => {
    const out = curate([P("SinHorario", { hours: null }), P("Completo")], V({ SinHorario: null, Completo: null }), "clasico");
    expect(out[0]!.place.id).toBe("Completo");
    expect(out[0]!.why[0]).toMatch(/Sin dato de interés/);
  });
  it("lista vacía → vacío", () => expect(curate([], new Map(), "clasico")).toEqual([]));
});

describe("transporte público (grabación REAL de Transitous: Plaza de Armas → Costanera Center, Santiago)", () => {
  const o = parseTransit(transitRaw)!;
  it("elige la opción más rápida que usa transporte y conserva línea, operador y estaciones", () => {
    const all = (transitRaw as { itineraries: { duration: number }[] }).itineraries.map((i) => Math.round(i.duration / 60));
    expect(o.minutes).toBe(Math.min(...all));
    const metro = o.legs.find((l) => l.mode === "metro")!;
    expect(metro.line).toMatch(/^L\d/);
    expect(metro.agency).toBe("Metro de Santiago");
    expect(metro.from && metro.to).toBeTruthy();
  });
  it("se describe en palabras, con caminata y línea", () => {
    const t = describeTransit(o);
    expect(t).toMatch(/camina \d+ min → Metro L\d/);
    expect(t).toMatch(/\(\d+ min\)/);
  });
  it("una ruta solo a pie no cuenta como transporte público; sin itinerarios → null", () => {
    expect(parseTransit({ itineraries: [{ duration: 600, legs: [{ mode: "WALK", duration: 600 }] }] })).toBeNull();
    expect(parseTransit({ itineraries: [] })).toBeNull(); // respuesta real de Valparaíso y Antofagasta
    expect(parseTransit(null)).toBeNull();
  });
  it("consulta origen, destino y hora; si la fuente falla devuelve null sin lanzar", async () => {
    let url = "";
    const r = await fetchTransit({ lat: -33.4372, lon: -70.6506 }, { lat: -33.417, lon: -70.6066 }, "2026-11-17T10:00:00-03:00", { fetchImpl: (async (u: string) => { url = u; return json(transitRaw); }) as unknown as typeof fetch });
    const q = new URL(url).searchParams;
    expect(q.get("fromPlace")).toBe("-33.4372,-70.6506");
    expect(q.get("toPlace")).toBe("-33.417,-70.6066");
    expect(q.get("time")).toBe("2026-11-17T10:00:00-03:00");
    expect(r!.minutes).toBe(o.minutes);
    expect(await fetchTransit({ lat: 0, lon: 0 }, { lat: 1, lon: 1 }, "x", { fetchImpl: (async () => json({}, 503)) as unknown as typeof fetch })).toBeNull();
  });
});

describe("avisos de la calle (grabación REAL de notas de OpenStreetMap, centro de Santiago)", () => {
  const notes = parseNotes(notesRaw);
  it("lee las notas abiertas con texto, fecha y enlace", () => {
    expect(notes.length).toBeGreaterThanOrEqual(1);
    expect(notes[0]!.text).toMatch(/semáforos/);
    expect(notes[0]!.text).not.toMatch(/#OsmAnd/);
    expect(notes[0]!.url).toMatch(/openstreetmap\.org\/note\/\d+$/);
  });
  it("solo asocia las que están cerca de la parada y son recientes", () => {
    const n = notes[0]!;
    const cerca = { id: "a", lat: n.lat + 0.001, lon: n.lon }; // ≈110 m
    const lejos = { id: "b", lat: n.lat + 0.01, lon: n.lon }; // ≈1,1 km
    const r = notesNear(notes, [cerca, lejos], NOW);
    expect(Object.keys(r)).toEqual(["a"]);
    expect(notesNear(notes, [cerca], new Date("2028-01-01T00:00:00Z"))).toEqual({}); // ya es vieja
  });
  it("descarta notas cerradas, sin texto útil o mal formadas", () => {
    const f = (status: string, text: string) => ({ geometry: { coordinates: [-70.6, -33.4] }, properties: { id: 1, status, date_created: "2026-11-01 10:00:00 UTC", comments: [{ text }] } });
    expect(parseNotes({ features: [f("closed", "calle cortada por obras"), f("open", "ok"), null, {}] })).toEqual([]);
    expect(parseNotes({ features: [f("open", "calle cortada por obras")] })).toHaveLength(1);
  });
  it("una sola consulta con una caja que cubre las paradas; si falla → null; sin paradas no consulta", async () => {
    let url = "", n = 0;
    const f = (async (u: string) => { url = u; n++; return json(notesRaw); }) as unknown as typeof fetch;
    await fetchNotes([{ lat: -33.44, lon: -70.65 }, { lat: -33.42, lon: -70.61 }], { fetchImpl: f });
    expect(new URL(url).searchParams.get("bbox")).toBe("-70.65400,-33.44400,-70.60600,-33.41600");
    expect(n).toBe(1);
    expect(await fetchNotes([], { fetchImpl: f })).toEqual([]);
    expect(n).toBe(1);
    expect(await fetchNotes([{ lat: 0, lon: 0 }], { fetchImpl: (async () => json({}, 500)) as unknown as typeof fetch })).toBeNull();
  });
});
