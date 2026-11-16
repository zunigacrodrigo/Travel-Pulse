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
