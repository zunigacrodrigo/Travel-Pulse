import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/nominatim-sp-real.json";
import { parseOpeningHours } from "./openingHours";
import { KIND_META, normalizePlaces, type Kind, type Place } from "./places";
import { FALLBACK_TRAVEL_MIN, addStopWish, buildDay, swapOutdoorForIndoor, type DayRequest, type TravelData, type Wish } from "./planner";

const m = (h: number, min = 0) => h * 60 + min;
const THU = "2026-11-05", MON = "2026-11-02";
const mk = (id: string, kind: Kind, hours: string | null, name = id, indoor = KIND_META[kind].indoor): Place => ({
  id, name, kind, lat: 0, lon: 0, hoursRaw: hours, hours: parseOpeningHours(hours), website: null, wikidata: null, wikipedia: null, cuisine: null, importance: 0, indoor,
});
const empty: Record<Kind, Place[]> = { museo: [], galeria: [], restaurante: [], pub: [], parque: [] };
/** Matriz sintética de lógica: todos a 10 min a pie entre sí (los datos reales se prueban en otros archivos). */
const travel = (ids: string[], min = 10): TravelData => {
  const mat = ids.map((_, i) => ids.map((__, j) => (i === j ? 0 : min)));
  return { ids: ["origen", ...ids], foot: [["0", ...ids.map(() => "10")].map(Number), ...mat.map((r) => [10, ...r])].map((r, i) => r.map((v, j) => (i === j ? 0 : v))), car: null };
};
const req = (over: Partial<DayRequest> & { places: Place[] }): DayRequest => {
  const cands = { ...empty };
  for (const p of over.places) cands[p.kind] = [...cands[p.kind], p];
  return { date: THU, startMin: m(11), endMin: m(23), wishes: [], candidates: cands, travel: travel(over.places.map((p) => p.id)), weather: null, ...over };
};

describe("buildDay: horarios", () => {
  const masp = mk("masp", "museo", "Tu-Su 10:00-18:00; Th 10:00-20:00", "MASP");
  it("el jueves a las 11:00 programa el museo tras el traslado y lo marca abierto con su cierre", () => {
    const p = buildDay(req({ places: [masp], wishes: [{ kind: "museo" }] }));
    expect(p.stops).toHaveLength(1);
    expect(p.stops[0]).toMatchObject({ startMin: m(11, 10), endMin: m(12, 40), status: "abierto", closesAt: m(20) });
    expect(p.stops[0]!.travel).toEqual({ minutes: 10, mode: "foot" });
  });
  it("el lunes (cerrado) no lo programa y dice por qué", () => {
    const p = buildDay(req({ date: MON, places: [masp], wishes: [{ kind: "museo" }] }));
    expect(p.stops).toHaveLength(0);
    expect(p.unplaced[0]!.reason).toMatch(/cerrado ese día/);
  });
  it("jamás programa una visita que termina después del cierre", () => {
    const corto = mk("c", "museo", "Th 10:00-12:00");
    const p = buildDay(req({ places: [corto], wishes: [{ kind: "museo" }] })); // llegaría 11:10, 90 min => 12:40 > 12:00
    expect(p.stops).toHaveLength(0);
    expect(p.unplaced[0]!.reason).toMatch(/no cabe/);
  });
  it("si el primero no cabe, usa el siguiente que sí", () => {
    const corto = mk("c", "museo", "Th 10:00-12:00"), ok = mk("ok", "museo", "Th 10:00-20:00");
    expect(buildDay(req({ places: [corto, ok], wishes: [{ kind: "museo" }] })).stops[0]!.place.id).toBe("ok");
  });
  it("horario desconocido: se programa pero queda «sin confirmar», nunca «abierto»", () => {
    const r = mk("r", "restaurante", null, "Bar do Zé");
    const p = buildDay(req({ places: [r], wishes: [{ kind: "restaurante" }] }));
    expect(p.stops[0]!.status).toBe("sin_confirmar");
    expect(p.stops[0]!.closesAt).toBeNull();
    expect(p.stops[0]!.reasons.join(" ")).toMatch(/sin confirmar/);
  });
  it("prefiere un lugar con horario conocido sobre uno sin horario cuando ambos caben (orden de candidatos)", () => {
    const sin = mk("sin", "restaurante", null), con = mk("con", "restaurante", "Mo-Su 12:00-23:00");
    expect(buildDay(req({ places: [con, sin], wishes: [{ kind: "restaurante" }] })).stops[0]!.place.id).toBe("con");
  });
});

describe("buildDay: ritmo del día", () => {
  const places = [mk("masp", "museo", "Tu-Su 10:00-18:00; Th 10:00-20:00"), mk("rest", "restaurante", "Mo-Su 12:00-23:00"), mk("gal", "galeria", "Tu-Su 10:00-19:00"), mk("pub", "pub", "Mo-Su 17:00-24:00")];
  const wishes: Wish[] = [{ kind: "museo" }, { kind: "galeria" }, { kind: "restaurante" }, { kind: "pub" }];
  const plan = buildDay(req({ places, wishes }));
  it("ordena el día como un humano: museo, almuerzo, galería, pub", () => {
    expect(plan.stops.map((s) => s.place.kind)).toEqual(["museo", "restaurante", "galeria", "pub"]);
  });
  it("llegando a la hora de almorzar, el almuerzo va a continuación aunque haya otras actividades pendientes", () => {
    const orden = buildDay(req({ places, wishes: [{ kind: "galeria" }, { kind: "museo" }, { kind: "restaurante" }] })).stops.map((s) => s.place.kind);
    expect(orden.indexOf("restaurante")).toBe(1); // tras la primera actividad (termina antes de las 13:00), no al final
  });
  it("el almuerzo no antes de las 12:30 y el pub no antes de las 18:30", () => {
    expect(plan.stops.find((s) => s.place.kind === "restaurante")!.startMin).toBeGreaterThanOrEqual(m(12, 30));
    expect(plan.stops.find((s) => s.place.kind === "pub")!.startMin).toBeGreaterThanOrEqual(m(18, 30));
  });
  it("las actividades no se solapan y respetan los traslados", () => {
    for (let i = 1; i < plan.stops.length; i++) {
      const prev = plan.stops[i - 1]!, cur = plan.stops[i]!;
      expect(cur.startMin).toBeGreaterThanOrEqual(prev.endMin + (cur.travel?.minutes ?? FALLBACK_TRAVEL_MIN));
    }
  });
  it("no pasa de la hora de término del día", () => {
    const tarde = buildDay(req({ places, wishes, endMin: m(15) }));
    expect(tarde.stops.every((s) => s.endMin <= m(15))).toBe(true);
    expect(tarde.unplaced.some((u) => u.wish.kind === "pub")).toBe(true);
  });
  it("declara los supuestos de duración y que el auto no incluye tráfico", () => {
    expect(plan.assumptions.join(" ")).toMatch(/Museo: 90 min de visita \(supuesto/);
    expect(plan.assumptions.join(" ")).toMatch(/sin tráfico|no incluyen tráfico/);
  });
  it("sin datos de traslado reserva 30 min y lo avisa", () => {
    const p = buildDay({ ...req({ places, wishes: [{ kind: "museo" }] }), travel: { ids: ["origen", "masp"], foot: null, car: null } });
    expect(p.stops[0]!.startMin).toBe(m(11) + FALLBACK_TRAVEL_MIN);
    expect(p.stops[0]!.travel).toBeNull();
    expect(p.stops[0]!.reasons.join(" ")).toMatch(/Sin dato de traslado/);
  });
});

describe("buildDay: esperas", () => {
  const abreTarde = mk("tarde", "restaurante", "Mo-Su 18:00-23:00", "Abre a las 18"), almuerzo = mk("alm", "restaurante", "Mo-Su 12:00-16:00", "Almuerzo");
  it("para el almuerzo prefiere el que está abierto ahora antes que uno que abre a las 18:00", () => {
    const p = buildDay(req({ places: [abreTarde, almuerzo], wishes: [{ kind: "restaurante" }] }));
    expect(p.stops[0]!.place.id).toBe("alm");
    expect(p.stops[0]!.startMin).toBeLessThan(m(14));
  });
  it("si es la única opción, acepta esperar y avisa cuánto", () => {
    const p = buildDay(req({ places: [abreTarde], wishes: [{ kind: "restaurante" }] }));
    expect(p.stops[0]!.startMin).toBe(m(18));
    expect(p.stops[0]!.reasons.join(" ")).toMatch(/Abre a las 18:00: habrá que esperar/);
  });
  it("una espera corta (hasta 60 min) es aceptable y no genera aviso de espera larga", () => {
    const abre13 = mk("a13", "restaurante", "Mo-Su 13:00-22:00");
    const p = buildDay(req({ places: [abre13], wishes: [{ kind: "restaurante" }] }));
    expect(p.stops[0]!.startMin).toBe(m(13));
    expect(p.stops[0]!.reasons.join(" ")).not.toMatch(/habrá que esperar/);
  });
});

describe("buildDay: elección de la persona y alternativas", () => {
  const a = mk("a", "museo", "Th 10:00-20:00", "A"), b = mk("b", "museo", "Th 10:00-20:00", "B"), c = mk("c", "museo", "Th 10:00-20:00", "C");
  it("respeta el lugar elegido cuando se puede visitar", () => {
    const p = buildDay(req({ places: [a, b, c], wishes: [{ kind: "museo", pin: "c" }] }));
    expect(p.stops[0]!.place.id).toBe("c");
    expect(p.stops[0]!.reasons[0]).toMatch(/Lo elegiste tú/);
  });
  it("si lo elegido no se puede visitar, lo explica y propone otro", () => {
    const cerrado = mk("x", "museo", "Mo 10:00-18:00", "X");
    const p = buildDay(req({ places: [cerrado, a], wishes: [{ kind: "museo", pin: "x" }] }));
    expect(p.stops[0]!.place.id).toBe("a");
  });
  it("ofrece hasta 3 alternativas viables, sin repetir lo elegido", () => {
    const d = mk("d", "museo", "Th 10:00-20:00", "D"), e = mk("e", "museo", "Th 10:00-20:00", "E");
    const alt = buildDay(req({ places: [a, b, c, d, e], wishes: [{ kind: "museo" }] })).stops[0]!.alternatives;
    expect(alt).toHaveLength(3);
    expect(alt.map((x) => x.place.id)).not.toContain("a");
  });
  it("un lugar no se usa dos veces en el mismo día", () => {
    const p = buildDay(req({ places: [a, b], wishes: [{ kind: "museo" }, { kind: "museo" }] }));
    expect(new Set(p.stops.map((s) => s.place.id)).size).toBe(2);
  });
  it("sin candidatos explica que no hay en la zona", () => {
    expect(buildDay(req({ places: [], wishes: [{ kind: "pub" }] })).unplaced[0]!.reason).toMatch(/no hay pubs/i);
  });
});

describe("lluvia", () => {
  const wet = Array.from({ length: 24 }, (_, hour) => ({ hour, rainProb: hour >= 14 && hour < 17 ? 80 : 5, tempC: 20, precipMm: 0 }));
  const park = mk("park", "parque", null, "Parque Ibirapuera", false);
  const museo = mk("m", "museo", "Th 10:00-20:00", "Museu");
  it("un parque en horas de lluvia se marca; un museo no", () => {
    const p = buildDay(req({ places: [park, museo], wishes: [{ kind: "parque", minStart: m(14, 30) }, { kind: "museo" }], weather: wet }));
    expect(p.stops.find((s) => s.place.id === "park")!.rainOnVisit).toBe(true);
    expect(p.stops.find((s) => s.place.id === "m")!.rainOnVisit).toBe(false);
  });
  it("sin pronóstico no se afirma nada de la lluvia y se avisa", () => {
    const p = buildDay(req({ places: [park], wishes: [{ kind: "parque" }], weather: null }));
    expect(p.stops[0]!.rainOnVisit).toBe(false);
    expect(p.assumptions.join(" ")).toMatch(/Sin pronóstico/);
  });
  it("swapOutdoorForIndoor cambia solo lo que es al aire libre y lo cuenta", () => {
    const r = swapOutdoorForIndoor([{ kind: "parque", minStart: 100 }, { kind: "pub" }]);
    expect(r.wishes.map((w) => w.kind)).toEqual(["museo", "pub"]);
    expect(r.wishes[0]!.minStart).toBe(100);
    expect(r.changes).toHaveLength(1);
  });
  it("traslado bajo lluvia se marca", () => {
    const p = buildDay(req({ places: [museo], wishes: [{ kind: "museo", minStart: m(14, 30) }], weather: wet }));
    expect(p.stops[0]!.rainOnTravel).toBe(true);
  });
});

describe("«quiero un pub»", () => {
  it("agrega el deseo sin tocar los demás", () => {
    expect(addStopWish([{ kind: "museo" }], "pub", m(20))).toEqual([{ kind: "museo" }, { kind: "pub", minStart: m(20) }]);
  });
});

describe("con datos reales de São Paulo", () => {
  const museos = normalizePlaces(fixture.museum, "museo");
  const ids = museos.slice(0, 6).map((p) => p.id);
  it("un jueves de noviembre programa un museo real con horario verificado de OSM", () => {
    const p = buildDay({ date: THU, startMin: m(11), endMin: m(21), wishes: [{ kind: "museo" }], candidates: { ...empty, museo: museos.slice(0, 6) }, travel: travel(ids, 15), weather: null });
    expect(p.stops).toHaveLength(1);
    expect(p.stops[0]!.status).toBe("abierto");
    expect(p.stops[0]!.place.hoursRaw).toBeTruthy();
  });
  it("el lunes ningún museo del MASP aparece abierto: no se inventa disponibilidad", () => {
    const masp = museos.filter((p) => /Museu de Arte de São Paulo/.test(p.name));
    const p = buildDay({ date: MON, startMin: m(11), endMin: m(21), wishes: [{ kind: "museo" }], candidates: { ...empty, museo: masp }, travel: travel(masp.map((x) => x.id)), weather: null });
    expect(p.stops).toHaveLength(0);
  });
});
