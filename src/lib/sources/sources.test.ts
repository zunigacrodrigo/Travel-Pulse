import { describe, expect, it } from "vitest";
import { seedDataset } from "@/lib/data";
import { assessSourced } from "@/lib/engine/data";
import { advisoryReason, FCDO_COUNTRY_SLUGS, parseAdvisory, riskFromStatuses } from "./fcdo";
import { SourceError } from "./http";
import { createLiveSources } from "./live";
import { applyLiveRisk, destinationsLive, notableQuakes } from "./overlay";
import { haversineKm, parseQuakes, quakesNear } from "./usgs";

const NOW = new Date("2026-10-31T15:00:00Z");

/* Forma observada en gov.uk el 2026-10-31 (Perú: alerta parcial; Etiopía: arreglo con valores). */
const advisoryBody = (status: string[], extra: Record<string, unknown> = {}) => ({
  public_updated_at: "2026-10-20T10:00:00Z",
  details: { alert_status: status, country: { name: "X", slug: "x" }, ...extra },
});

/* Forma documentada del feed GeoJSON del USGS. */
const quakeFeed = (features: unknown[]) => ({
  type: "FeatureCollection",
  metadata: { generated: 1, count: features.length, status: 200 },
  features,
});
const quake = (id: string, mag: number | null, lon: number, lat: number, ms: number, place = "10 km N of Somewhere") => ({
  type: "Feature",
  id,
  properties: { mag, place, time: ms, url: `https://earthquake.usgs.gov/${id}`, tsunami: 0 },
  geometry: { type: "Point", coordinates: [lon, lat, 35] },
});

describe("FCDO: riskFromStatuses", () => {
  it("sin alertas = nivel 1", () => {
    expect(riskFromStatuses([])).toEqual({ level: 1, scope: "none", avoidAll: false });
  });
  it("evitar viajes no esenciales a zonas = 2", () => {
    expect(riskFromStatuses(["avoid_all_but_essential_travel_to_parts"])).toMatchObject({ level: 2, scope: "parts", avoidAll: false });
  });
  it("evitar todo viaje a zonas = 2 y marca avoidAll", () => {
    expect(riskFromStatuses(["avoid_all_travel_to_parts"])).toMatchObject({ level: 2, scope: "parts", avoidAll: true });
  });
  it("no esencial a todo el país = 3; todo viaje a todo el país = 4", () => {
    expect(riskFromStatuses(["avoid_all_but_essential_travel_to_whole_country"])).toMatchObject({ level: 3, scope: "whole" });
    expect(riskFromStatuses(["avoid_all_travel_to_whole_country"])).toMatchObject({ level: 4, scope: "whole", avoidAll: true });
  });
  it("toma el peor caso entre varios valores", () => {
    expect(
      riskFromStatuses(["avoid_all_but_essential_travel_to_parts", "avoid_all_travel_to_whole_country"])?.level,
    ).toBe(4);
  });
  it("valor desconocido => null (no inventa un nivel)", () => {
    expect(riskFromStatuses(["something_new"])).toBeNull();
  });
});

describe("FCDO: parseAdvisory", () => {
  it("interpreta la respuesta y usa updated_at si existe", () => {
    const a = parseAdvisory(advisoryBody(["avoid_all_but_essential_travel_to_parts"], { updated_at: "2026-10-01T00:00:00Z" }), "peru", "Perú");
    expect(a).toMatchObject({ level: 2, updatedAt: "2026-10-01T00:00:00Z", url: "https://www.gov.uk/foreign-travel-advice/peru" });
  });
  it("cae a public_updated_at", () => {
    expect(parseAdvisory(advisoryBody([]), "chile", "Chile")?.updatedAt).toBe("2026-10-20T10:00:00Z");
  });
  it.each([null, 5, "x", {}, { details: {} }, { details: { alert_status: "no-array" } }, { details: { alert_status: [1] } }])(
    "rechaza forma inválida %#",
    (raw) => {
      expect(parseAdvisory(raw, "peru", "Perú")).toBeNull();
    },
  );
  it("razón en español según nivel y alcance", () => {
    const parts = parseAdvisory(advisoryBody(["avoid_all_but_essential_travel_to_parts"]), "peru", "Perú");
    expect(advisoryReason(parts!)).toMatch(/evitar viajes no esenciales a algunas zonas/);
    expect(advisoryReason(parseAdvisory(advisoryBody([]), "chile", "Chile")!)).toMatch(/Sin alerta vigente/);
  });
  it("cubre todos los países de la semilla", () => {
    const countries = new Set(seedDataset.destinations.map((d) => d.country));
    for (const c of countries) expect(FCDO_COUNTRY_SLUGS[c], c).toBeDefined();
  });
});

describe("USGS: parseQuakes", () => {
  it("interpreta eventos y ordena del más reciente al más antiguo", () => {
    const q = parseQuakes(quakeFeed([quake("a", 5, -70, -20, 1_000), quake("b", 6, -71, -21, 2_000)]));
    expect(q?.map((x) => x.id)).toEqual(["b", "a"]);
    expect(q?.[0]).toMatchObject({ mag: 6, lat: -21, lon: -71, depthKm: 35, tsunami: false });
  });
  it("descarta eventos incompletos o con coordenadas imposibles", () => {
    const q = parseQuakes(quakeFeed([quake("ok", 5, 0, 0, 1), quake("nomag", null, 0, 0, 1), quake("lat", 5, 0, 95, 1), { id: "x" }]));
    expect(q?.map((x) => x.id)).toEqual(["ok"]);
  });
  it("devuelve null si no es un FeatureCollection", () => {
    expect(parseQuakes({ type: "Other" })).toBeNull();
    expect(parseQuakes(null)).toBeNull();
  });
});

describe("USGS: distancia y cercanía", () => {
  it("haversine Santiago–Buenos Aires ≈ 1.140 km", () => {
    const d = haversineKm(-33.4489, -70.6693, -34.6037, -58.3816);
    expect(d).toBeGreaterThan(1100);
    expect(d).toBeLessThan(1180);
  });
  it("cuenta solo sismos dentro del radio, la ventana y la magnitud", () => {
    const day = 86_400_000;
    const t = NOW.getTime();
    const quakes = parseQuakes(
      quakeFeed([
        quake("near-strong", 6.1, -72.0, -13.6, t - 2 * day),
        quake("near-weak", 4.6, -72.1, -13.4, t - 3 * day),
        quake("far", 7.0, 140, 35, t - 1 * day),
        quake("old", 6.5, -72, -13.5, t - 40 * day),
        quake("future", 6.5, -72, -13.5, t + day),
      ]),
    )!;
    const r = quakesNear(quakes, -13.5319, -71.9675, NOW);
    expect(r.count).toBe(2);
    expect(r.maxMag).toBe(6.1);
    expect(r.strongest?.id).toBe("near-strong");
    expect(r.strongest!.distanceKm).toBeLessThan(300);
  });
  it("notableQuakes filtra por magnitud y días", () => {
    const t = NOW.getTime();
    const q = parseQuakes(quakeFeed([quake("a", 6, 0, 0, t - 86_400_000), quake("b", 5, 0, 0, t), quake("c", 7, 0, 0, t - 30 * 86_400_000)]))!;
    expect(notableQuakes(q, NOW).map((x) => x.id)).toEqual(["a"]);
  });
});

/** fetch falso: responde según la URL. */
function fakeFetch(routes: (url: string) => Response | Promise<Response> | "throw") {
  const calls: string[] = [];
  const impl = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const r = routes(url);
    if (r === "throw") throw new TypeError("fetch failed");
    return r;
  }) as typeof fetch;
  return { impl, calls };
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("createLiveSources", () => {
  const happy = (url: string) =>
    url.includes("foreign-travel-advice")
      ? json(advisoryBody(url.endsWith("/peru") ? ["avoid_all_but_essential_travel_to_parts"] : []))
      : json(quakeFeed([quake("q1", 6, -72, -13.5, NOW.getTime() - 86_400_000)]));

  it("obtiene avisos de los 14 países y sismos; estado ok", async () => {
    const f = fakeFetch(happy);
    const live = createLiveSources({ fetchImpl: f.impl, now: () => NOW });
    const s = await live.refresh();
    expect(Object.keys(s.advisories)).toHaveLength(Object.keys(FCDO_COUNTRY_SLUGS).length);
    expect(s.advisories["Perú"].advisory.level).toBe(2);
    expect(s.quakes).toHaveLength(1);
    expect(s.status.fcdo.state).toBe("ok");
    expect(s.status.usgs.state).toBe("ok");
    expect(f.calls.some((u) => u.endsWith("/earthquakes/feed/v1.0/summary/4.5_month.geojson"))).toBe(true);
  });

  it("respeta el TTL: una segunda llamada no vuelve a consultar", async () => {
    const f = fakeFetch(happy);
    const live = createLiveSources({ fetchImpl: f.impl, now: () => NOW });
    await live.refresh();
    const n = f.calls.length;
    await live.refresh();
    expect(f.calls.length).toBe(n);
    await live.refresh(true);
    expect(f.calls.length).toBeGreaterThan(n);
  });

  it("llamadas simultáneas comparten la misma consulta", async () => {
    const f = fakeFetch(happy);
    const live = createLiveSources({ fetchImpl: f.impl, now: () => NOW });
    await Promise.all([live.refresh(), live.refresh(), live.refresh()]);
    expect(f.calls.filter((u) => u.includes("/api/content/foreign-travel-advice/peru"))).toHaveLength(1);
  });

  it("sin red: estado unavailable y sin datos (no inventa)", async () => {
    const live = createLiveSources({ fetchImpl: fakeFetch(() => "throw").impl, now: () => NOW });
    const s = await live.refresh();
    expect(s.status.fcdo).toMatchObject({ state: "unavailable", count: 0, fetchedAt: null });
    expect(s.status.usgs.state).toBe("unavailable");
    expect(s.status.usgs.error).toMatch(/fetch failed/);
  });

  it("falla posterior conserva el último dato bueno y marca stale", async () => {
    let ok = true;
    const f = fakeFetch((u) => (ok ? happy(u) : "throw"));
    let t = NOW.getTime();
    const live = createLiveSources({ fetchImpl: f.impl, now: () => new Date(t) });
    await live.refresh();
    ok = false;
    t += 7 * 3_600_000;
    const s = await live.refresh();
    expect(s.status.fcdo.state).toBe("stale");
    expect(s.status.usgs.state).toBe("stale");
    expect(s.advisories["Perú"].advisory.level).toBe(2);
    expect(s.quakes).toHaveLength(1);
    expect(s.status.usgs.fetchedAt).toBe(NOW.toISOString());
  });

  it("HTTP 500 en algunos países: stale parcial, los demás se conservan", async () => {
    const f = fakeFetch((u) => (u.endsWith("/chile") ? json({}, 500) : happy(u)));
    const live = createLiveSources({ fetchImpl: f.impl, now: () => NOW });
    const s = await live.refresh();
    expect(s.status.fcdo.state).toBe("stale");
    expect(s.status.fcdo.error).toMatch(/1 de 14/);
    expect(s.advisories["Chile"]).toBeUndefined();
    expect(s.advisories["Perú"]).toBeDefined();
  });

  it("respuesta no interpretable no se acepta", async () => {
    const f = fakeFetch((u) => (u.includes("advice") ? json({ details: { alert_status: ["raro"] } }) : json({ type: "x" })));
    const s = await createLiveSources({ fetchImpl: f.impl, now: () => NOW }).refresh();
    expect(s.status.fcdo.state).toBe("unavailable");
    expect(s.status.usgs.state).toBe("unavailable");
  });

  it("timeout: aborta y lo clasifica", async () => {
    const slow = (async (_u: RequestInfo | URL, init?: RequestInit) =>
      new Promise((_res, rej) => init?.signal?.addEventListener("abort", () => rej(new DOMException("a", "AbortError"))))) as typeof fetch;
    const s = await createLiveSources({ fetchImpl: slow, now: () => NOW, timeoutMs: 20 }).refresh();
    expect(s.status.usgs.error).toMatch(/Sin respuesta en 20 ms/);
    expect(new SourceError("timeout", "x").kind).toBe("timeout");
  });
});

describe("overlay", () => {
  it("sin datos vivos devuelve el mismo dataset", () => {
    expect(applyLiveRisk(seedDataset, null)).toBe(seedDataset);
  });

  it("reemplaza el riesgo con fuente fcdo, fecha de consulta y razón; agrega fuentes; no muta", async () => {
    const live = createLiveSources({
      fetchImpl: fakeFetch((u) =>
        u.includes("advice") ? json(advisoryBody(u.endsWith("/peru") ? ["avoid_all_but_essential_travel_to_parts"] : [])) : json(quakeFeed([])),
      ).impl,
      now: () => NOW,
    });
    const snap = await live.refresh();
    const before = JSON.stringify(seedDataset);
    const ds = applyLiveRisk(seedDataset, snap);
    expect(JSON.stringify(seedDataset)).toBe(before);
    const cuz = ds.destinations.find((d) => d.id === "CUZ")!;
    expect(cuz.riskLevel).toEqual({ value: 2, sourceId: "fcdo", observedAt: "2026-10-31" });
    expect(cuz.riskReasons[0]).toMatch(/FCDO/);
    expect(ds.sources.map((s) => s.id)).toEqual(expect.arrayContaining(["fcdo", "usgs"]));
    expect(ds.sources.filter((s) => s.id === "fcdo")).toHaveLength(1);
  });

  it("el motor trata el riesgo vivo como fresco (a diferencia de la semilla vencida)", async () => {
    const snap = await createLiveSources({
      fetchImpl: fakeFetch((u) => (u.includes("advice") ? json(advisoryBody([])) : json(quakeFeed([])))).impl,
      now: () => NOW,
    }).refresh();
    const ds = applyLiveRisk(seedDataset, snap);
    const cuz = ds.destinations.find((d) => d.id === "CUZ")!;
    const a = assessSourced(cuz.riskLevel, ds.sources, NOW);
    expect(a.stale).toBe(false);
    expect(a.quality).toBeGreaterThan(0.85);
  });

  it("destinationsLive distingue riesgo vivo de semilla y cuenta sismos", async () => {
    const snap = await createLiveSources({
      fetchImpl: fakeFetch((u) =>
        u.includes("advice")
          ? u.endsWith("/peru")
            ? json(advisoryBody(["avoid_all_but_essential_travel_to_parts"]))
            : json({}, 503)
          : json(quakeFeed([quake("q", 6, -72, -13.5, NOW.getTime() - 86_400_000)])),
      ).impl,
      now: () => NOW,
    }).refresh();
    const rows = destinationsLive(seedDataset, snap, NOW);
    const cuz = rows.find((r) => r.id === "CUZ")!;
    expect(cuz).toMatchObject({ riskLevel: 2, riskOrigin: "live", quakes: { count: 1, maxMag: 6 } });
    const scl = rows.find((r) => r.country === "Chile")!;
    expect(scl.riskOrigin).toBe("seed");
    expect(scl.advisoryUrl).toBeNull();
  });
});
