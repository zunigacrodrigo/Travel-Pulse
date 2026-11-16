import { describe, expect, it } from "vitest";
import { KINDS } from "./places";
import { orderKindsByInterests, unmappedInterests } from "./preferences";

describe("Travel DNA → Mi día", () => {
  it("sin intereses declarados, el orden no cambia", () => {
    expect(orderKindsByInterests([])).toEqual([...KINDS]);
  });
  it("comida pone los restaurantes primero", () => {
    expect(orderKindsByInterests(["comida"])[0]).toBe("restaurante");
  });
  it("cultura pone museos y galerías antes que el resto", () => {
    const order = orderKindsByInterests(["cultura"]);
    expect(order.slice(0, 2).sort()).toEqual(["galeria", "museo"]);
  });
  it("el orden de declaración manda cuando hay varios intereses", () => {
    expect(orderKindsByInterests(["naturaleza", "comida"])[0]).toBe("parque");
    expect(orderKindsByInterests(["comida", "naturaleza"])[0]).toBe("restaurante");
  });
  it("no pierde ni duplica ningún tipo de lugar", () => {
    const order = orderKindsByInterests(["cultura", "comida", "cultura"]);
    expect([...order].sort()).toEqual([...KINDS].sort());
  });
  it("los intereses sin equivalente se reportan, no se traducen", () => {
    expect(unmappedInterests(["romance", "lujo", "comida"])).toEqual(["romance", "lujo"]);
  });
  it("«aventura» no se traduce a parques: la relación no es directa", () => {
    expect(orderKindsByInterests(["aventura"])).toEqual([...KINDS]);
    expect(unmappedInterests(["aventura"])).toEqual(["aventura"]);
  });
  it("el orden es estable: los tipos sin interés mantienen su orden original", () => {
    expect(orderKindsByInterests(["comida"])).toEqual(["restaurante", "museo", "galeria", "pub", "parque"]);
  });
});

import { paceFactor, visitMinutes, PACE_FACTOR } from "./preferences";

describe("ritmo del viajero → duración de las visitas", () => {
  it("sin ritmo declarado, la duración es la de siempre", () => {
    expect(visitMinutes("museo", null)).toBe(90);
    expect(visitMinutes("museo", undefined)).toBe(90);
    expect(paceFactor(null)).toBe(1);
  });
  it("equilibrado no cambia nada", () => expect(visitMinutes("restaurante", "equilibrado")).toBe(75));
  it("tranquilo alarga y intenso acorta, redondeado a 5 min", () => {
    expect(visitMinutes("museo", "tranquilo")).toBe(115);   // 90 × 1,25 = 112,5 → 115
    expect(visitMinutes("museo", "intenso")).toBe(70);       // 90 × 0,8 = 72 → 70
    for (const k of ["museo", "galeria", "restaurante", "pub", "parque"] as const) {
      for (const p of ["tranquilo", "equilibrado", "intenso"] as const) expect(visitMinutes(k, p) % 5).toBe(0);
    }
  });
  it("el orden se respeta: intenso < equilibrado < tranquilo", () => {
    expect(PACE_FACTOR.intenso).toBeLessThan(PACE_FACTOR.equilibrado);
    expect(PACE_FACTOR.equilibrado).toBeLessThan(PACE_FACTOR.tranquilo);
  });
});
