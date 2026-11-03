import { describe, expect, it } from "vitest";
import { parseOpeningHours } from "@/lib/day/openingHours";
import { verifyItinerary, type StopInput } from "./checks";

// Horarios reales de OpenStreetMap (consultados el 3-nov-2026). 5-nov-2026 es jueves.
const mercado = parseOpeningHours("Mo-Sa 05:00-16:00");
const kido = parseOpeningHours("Tu-Sa 11:30-14:00, 18:30-21:30; Su 11:30-15:30");
const farol = parseOpeningHours("Mo-Fr 10:00-15:00");
const mk = (name: string, start: number | null, dur: number, raw: string | null, h: typeof mercado, extra: Partial<NonNullable<StopInput["found"]>> = {}): StopInput => ({
  name, plannedStart: start, durationMin: dur,
  found: { matchedName: name, lat: -23.5, lon: -46.6, category: "amenity", type: "restaurant", hoursRaw: raw, hours: h, confidence: "alta", ...extra },
});
const base = { isoDate: "2026-11-05", dayStart: 750, hours: null, sunsetMin: null };

describe("verifyItinerary con horarios reales", () => {
  it("mantiene una cena dentro del horario", () => {
    const v = verifyItinerary({ ...base, stops: [mk("Kidoairaku", 19 * 60 + 30, 90, "x", kido)], legs: [] });
    expect(v.stops[0]!.action).toBe("mantener");
  });
  it("manda a mover lo que cae fuera de horario y dice cuándo abre", () => {
    const v = verifyItinerary({ ...base, stops: [mk("Mercado", 17 * 60, 60, "Mo-Sa 05:00-16:00", mercado)], legs: [] });
    expect(v.stops[0]!.action).toBe("mover");
    expect(v.stops[0]!.headline).toContain("05:00–16:00");
  });
  it("sin horario no lo da por abierto: pide confirmar", () => {
    const v = verifyItinerary({ ...base, stops: [mk("Terraço", 15 * 60, 60, null, null)], legs: [] });
    expect(v.stops[0]!.action).toBe("confirmar");
    expect(v.stops[0]!.unknown.join(" ")).toContain("Horario sin confirmar");
  });
  it("avisa si el traslado real no deja llegar a la hora pedida", () => {
    const v = verifyItinerary({ ...base, stops: [mk("A", 12 * 60, 60, "x", mercado), mk("B", 13 * 60 + 10, 60, "x", mercado)], legs: [{ minutes: 25, mode: "car" }] });
    expect(v.stops[1]!.action).toBe("mover");
    expect(v.stops[1]!.headline).toContain("13:25");
  });
  it("lugar no encontrado => confirmar, nunca inventar", () => {
    const v = verifyItinerary({ ...base, stops: [{ name: "Hostel", plannedStart: null, durationMin: 30, found: null }], legs: [] });
    expect(v.stops[0]!.action).toBe("confirmar");
  });
  it("lugar cerrado el día completo (domingo) se detecta", () => {
    const v = verifyItinerary({ ...base, isoDate: "2026-11-08", stops: [mk("Farol", 11 * 60, 60, "Mo-Fr 10:00-15:00", farol)], legs: [] });
    expect(v.stops[0]!.action).toBe("mover");
    expect(v.stops[0]!.headline).toContain("cerrado");
  });
  it("lluvia probable en un mirador lo mueve; sin pronóstico lo dice", () => {
    const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, rainProb: h >= 15 && h <= 18 ? 80 : 5, tempC: 20, precipMm: 0 }));
    const s = mk("Sampa Sky", 16 * 60, 60, null, null, { category: "tourism", type: "viewpoint" });
    expect(verifyItinerary({ ...base, hours, stops: [s], legs: [] }).stops[0]!.action).toBe("mover");
    expect(verifyItinerary({ ...base, stops: [s], legs: [] }).stops[0]!.unknown.join(" ")).toContain("Sin pronóstico");
  });
  it("un mirador fuera del atardecer se reubica cerca de la puesta de sol", () => {
    const s = mk("Mirador", 13 * 60, 60, null, null, { category: "tourism", type: "viewpoint" });
    const v = verifyItinerary({ ...base, hours: Array.from({ length: 24 }, (_, h) => ({ hour: h, rainProb: 0, tempC: 20, precipMm: 0 })), sunsetMin: 18 * 60 + 20, stops: [s], legs: [] });
    expect(v.stops[0]!.headline).toContain("18:20");
  });
});
