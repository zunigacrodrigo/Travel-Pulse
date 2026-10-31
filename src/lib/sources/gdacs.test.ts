import { describe, expect, it } from "vitest";
import sample from "./__fixtures__/gdacs-real-sample.json";
import { fetchHazards, hazardsNear, parseHazards, type Hazard } from "./gdacs";

const NOW = new Date("2026-10-31T20:00:00Z");

describe("parseHazards (muestra real de GDACS)", () => {
  const hz = parseHazards(sample)!;
  it("interpreta todos los eventos reales de la muestra", () => {
    expect(hz.length).toBe(sample.features.length);
    for (const h of hz) {
      expect(["TC", "FL", "VO", "WF"]).toContain(h.type);
      expect(["Green", "Orange", "Red"]).toContain(h.alertLevel);
      expect(Math.abs(h.lat)).toBeLessThanOrEqual(90);
      expect(h.from).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      if (h.reportUrl) expect(h.reportUrl).toMatch(/^https:\/\//);
    }
  });
  it("rechaza lo que no es una colección y descarta eventos incompletos", () => {
    expect(parseHazards(null)).toBeNull();
    expect(parseHazards({ features: "x" })).toBeNull();
    const bad = { features: [{ type: "Feature", geometry: { type: "Point", coordinates: [999, 0] }, properties: { eventtype: "FL", alertlevel: "Green", fromdate: "2026-10-01T00:00:00" } },
      { type: "Feature", geometry: { type: "Point", coordinates: [10, 10] }, properties: { eventtype: "EQ", alertlevel: "Green", fromdate: "2026-10-01T00:00:00" } }] };
    expect(parseHazards(bad)).toEqual([]);
  });
  it("trata las fechas sin zona de GDACS como UTC", () => {
    const one = parseHazards({ features: [{ type: "Feature", geometry: { type: "Point", coordinates: [-70, -30] }, properties: { eventtype: "FL", eventid: 1, alertlevel: "Orange", fromdate: "2026-10-26T01:00:00", iscurrent: "true" } }] })!;
    expect(one[0]!.from).toBe("2026-10-26T01:00:00.000Z");
  });
});

describe("hazardsNear", () => {
  const h = (o: Partial<Hazard>): Hazard => ({ id: "x", type: "FL", name: "n", alertLevel: "Green", country: "Chile", lat: -33.4, lon: -70.6, from: "2026-10-20T00:00:00.000Z", to: null, modified: null, current: true, severityText: null, reportUrl: null, ...o });
  it("incluye solo lo vigente y dentro del radio de su tipo", () => {
    const r = hazardsNear([h({ id: "cerca" }), h({ id: "lejos", lat: 10, lon: 10 }), h({ id: "viejo", current: false }), h({ id: "terminado", to: "2026-10-20T00:00:00.000Z" })], -33.4, -70.6, NOW);
    expect(r.map((x) => x.id)).toEqual(["cerca"]);
  });
  it("ordena primero lo más grave y luego lo más cercano", () => {
    const r = hazardsNear([h({ id: "verde" }), h({ id: "rojo-lejos", alertLevel: "Red", lat: -34.4 }), h({ id: "rojo-cerca", alertLevel: "Red" })], -33.4, -70.6, NOW);
    expect(r.map((x) => x.id)).toEqual(["rojo-cerca", "rojo-lejos", "verde"]);
  });
  it("el radio depende del tipo: un volcán a 200 km queda fuera, un ciclón no", () => {
    const r = hazardsNear([h({ id: "vo", type: "VO", lat: -35.2 }), h({ id: "tc", type: "TC", lat: -35.2 })], -33.4, -70.6, NOW);
    expect(r.map((x) => x.id)).toEqual(["tc"]);
  });
});

describe("fetchHazards", () => {
  const ok = (body: unknown) => (async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;
  it("combina tipos sin duplicar y pide cada tipo por separado", async () => {
    const urls: string[] = [];
    const f = (async (u: string) => { urls.push(u); return new Response(JSON.stringify(sample), { status: 200 }); }) as unknown as typeof fetch;
    const r = await fetchHazards(NOW, { fetchImpl: f, base: "http://x" });
    expect(urls.filter((u) => u.includes("eventlist=WF")).every((u) => u.includes("alertlevel=Orange;Red"))).toBe(true);
    expect(new Set(r.map((h) => h.id)).size).toBe(r.length);
    expect(urls.some((u) => u.includes("eventlist=EQ"))).toBe(false);
  });
  it("un tipo que falla no tumba a los demás", async () => {
    let n = 0;
    const f = (async (u: string) => (u.includes("eventlist=FL") && ++n ? new Response("x", { status: 500 }) : new Response(JSON.stringify(sample), { status: 200 }))) as unknown as typeof fetch;
    expect((await fetchHazards(NOW, { fetchImpl: f, base: "http://x" })).length).toBeGreaterThan(0);
  });
  it("204 sin cuerpo (GDACS sin eventos) no es una falla: se trata como lista vacía", async () => {
    const f = (async (u: string) => (u.includes("eventlist=WF") ? new Response(null, { status: 204 }) : new Response(JSON.stringify(sample), { status: 200 }))) as unknown as typeof fetch;
    const r = await fetchHazards(NOW, { fetchImpl: f, base: "http://x" });
    expect(r.length).toBeGreaterThan(0);
  });
  it("si todos los tipos responden 204, devuelve vacío sin lanzar", async () => {
    const f = (async () => new Response(null, { status: 204 })) as unknown as typeof fetch;
    expect(await fetchHazards(NOW, { fetchImpl: f, base: "http://x" })).toEqual([]);
  });
  it("si todos fallan, lanza para que la capa de arriba declare «sin conexión»", async () => {
    const f = (async () => new Response("x", { status: 503 })) as unknown as typeof fetch;
    await expect(fetchHazards(NOW, { fetchImpl: f, base: "http://x" })).rejects.toThrow();
  });
  it("una respuesta no interpretable cuenta como falla", async () => {
    await expect(fetchHazards(NOW, { fetchImpl: ok({ nada: 1 }), base: "http://x" })).rejects.toThrow();
  });
});
