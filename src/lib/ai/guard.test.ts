import { describe, expect, it } from "vitest";
import { checkNumbers, extractNumbers, guardText, hasUnsafeLanguage, parseNumberToken } from "./guard";

const facts = [
  "Precio: 88 de 100. US$1.180 de US$1.500",
  "Clima: 18 °C, lluvia 12,5 mm, 3.399 m de altitud",
  "Vuelo 10% bajo lo habitual, 6 horas, 2.100 km",
];

describe("parseNumberToken", () => {
  it.each([
    ["1180", 1180],
    ["1.180", 1180],
    ["1,180", 1180],
    ["12,5", 12.5],
    ["3.5", 3.5],
    ["0,500", 0.5],
    ["1.180.000", 1180000],
    ["1.180,50", 1180.5],
    ["1,180.50", 1180.5],
  ])("%s -> %s", (tok, n) => expect(parseNumberToken(tok)).toBe(n));
});

describe("checkNumbers (pre-chequeo de cifras)", () => {
  it.each([
    "El costo total es US$1.180 y cabe en tu presupuesto.",
    "Cuesta 1180 dólares en total.",
    "Son 1,180 dólares.",
    "Vuelo 10% bajo lo habitual.",
    "Hay unos 12,5 mm de lluvia a 3.399 m de altura.",
    "Recorrerás 2.100 km en 6 horas.",
    "Sin cifras: buen momento para ir.",
  ])("acepta: %s", (t) => expect(checkNumbers(t, facts)).toEqual({ ok: true, unmatched: [] }));

  it.each([
    ["El costo total es US$1.200.", ["1.200"]],
    ["Ahorras 15% en el vuelo.", ["15"]],
    ["Hace 25 °C y 3 días de lluvia.", ["25", "3"]],
    ["Cuesta 118 dólares.", ["118"]],
    ["Está a 3.400 m.", ["3.400"]],
  ])("rechaza: %s", (t, un) => {
    const r = checkNumbers(t, facts);
    expect(r.ok).toBe(false);
    expect(r.unmatched).toEqual(un);
  });

  it("extractNumbers separa tokens", () => {
    expect(extractNumbers("de 5 a 7 días, US$1.180").map((n) => n.value)).toEqual([5, 7, 1180]);
  });
});

describe("lenguaje inseguro", () => {
  it.each([
    "Es un destino 100% seguro.",
    "Totalmente seguro para viajar.",
    "Viaja sin riesgo alguno.",
    "Tu viaje está garantizado.",
    "Evita ese barrio peligroso.",
    "Los locales son ladrones.",
  ])("detecta: %s", (t) => expect(hasUnsafeLanguage(t)).toBe(true));

  it("no marca texto normal", () => {
    expect(hasUnsafeLanguage("El nivel de riesgo oficial es bajo y el clima acompaña.")).toBe(false);
  });

  it("guardText prioriza el motivo", () => {
    expect(guardText("Viaje 100% seguro", facts).reason).toBe("unsafe_language");
    expect(guardText("Cuesta US$999", facts).reason).toBe("number_mismatch");
    expect(guardText("  ", facts).reason).toBe("empty");
    expect(guardText("Buen momento, cuesta US$1.180", facts).ok).toBe(true);
  });
});
