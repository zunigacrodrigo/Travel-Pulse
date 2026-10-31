import { describe, expect, it } from "vitest";
import type { Interest } from "@/lib/types";
import { defaultDna, dnaToRequest, exportDna, suggestInterests, validateDna, type TravelDna } from "./dna-core";

const NOW = new Date("2026-10-31T13:00:00Z");

function dna(over: Partial<TravelDna> = {}): TravelDna {
  return { ...defaultDna(NOW), ...over };
}

describe("validateDna", () => {
  it("acepta un perfil válido y lo normaliza", () => {
    const out = validateDna({ ...dna(), origin: "scl", interests: ["comida", "comida", "playa"] });
    expect(out).toMatchObject({ origin: "SCL", interests: ["comida", "playa"], pace: null });
  });

  it("descarta intereses desconocidos y campos extra", () => {
    const out = validateDna({ ...dna(), interests: ["comida", "ninguno", 3], religion: "x", salud: "y" });
    expect(out?.interests).toEqual(["comida"]);
    expect(out).not.toHaveProperty("religion");
    expect(out).not.toHaveProperty("salud");
  });

  it("acota números fuera de rango", () => {
    const out = validateDna({ ...dna(), budgetUsd: 5, days: 900, travelers: 0 });
    expect(out).toMatchObject({ budgetUsd: 100, days: 60, travelers: 1 });
  });

  it("rechaza lo que no es un perfil", () => {
    expect(validateDna(null)).toBeNull();
    expect(validateDna("hola")).toBeNull();
    expect(validateDna({})).toBeNull();
    expect(validateDna({ ...dna(), version: 2 })).toBeNull();
    expect(validateDna({ ...dna(), origin: "SANTIAGO" })).toBeNull();
    expect(validateDna({ ...dna(), budgetUsd: Number.NaN })).toBeNull();
    expect(validateDna({ ...dna(), flexibleDates: "sí" })).toBeNull();
    expect(validateDna({ ...dna(), interests: "comida" })).toBeNull();
  });

  it("ritmo desconocido pasa a null y fecha inválida a la época", () => {
    const out = validateDna({ ...dna(), pace: "frenético", updatedAt: "ayer" });
    expect(out?.pace).toBeNull();
    expect(out?.updatedAt).toBe("1970-01-01T00:00:00.000Z");
  });

  it("sobrevive a un ciclo exportar → importar sin pérdida", () => {
    const original = dna({ interests: ["cultura", "naturaleza"], pace: "tranquilo", budgetUsd: 2200 });
    expect(validateDna(JSON.parse(exportDna(original)))).toEqual(original);
  });
});

describe("dnaToRequest", () => {
  it("copia las preferencias y toma el mes de quien llama", () => {
    const req = dnaToRequest(dna({ interests: ["playa"], budgetUsd: 1800, days: 5, travelers: 2 }), 3);
    expect(req).toEqual({
      origin: "SCL",
      budgetUsd: 1800,
      days: 5,
      month: 3,
      flexibleDates: true,
      travelers: 2,
      interests: ["playa"],
    });
  });

  it("no comparte la lista de intereses con el perfil", () => {
    const p = dna({ interests: ["playa"] });
    const req = dnaToRequest(p, 11);
    req.interests.push("lujo");
    expect(p.interests).toEqual(["playa"]);
  });

  it("acota el mes", () => {
    expect(dnaToRequest(dna(), 99).month).toBe(12);
    expect(dnaToRequest(dna(), -4).month).toBe(1);
  });
});

describe("suggestInterests", () => {
  const trip = (...interests: Interest[]) => ({ request: { interests } });

  it("sugiere intereses repetidos en varios guardados que no están en el perfil", () => {
    const saved = [trip("playa", "comida"), trip("playa"), trip("aventura")];
    expect(suggestInterests(saved, dna({ interests: [] }))).toEqual([{ interest: "playa", trips: 2 }]);
  });

  it("no sugiere lo que el perfil ya tiene", () => {
    const saved = [trip("playa"), trip("playa")];
    expect(suggestInterests(saved, dna({ interests: ["playa"] }))).toEqual([]);
  });

  it("cuenta cada interés una sola vez por viaje", () => {
    expect(suggestInterests([trip("playa", "playa")], null)).toEqual([]);
  });

  it("ordena por frecuencia y luego por el orden del catálogo", () => {
    const saved = [trip("comida", "aventura"), trip("comida", "aventura"), trip("comida")];
    expect(suggestInterests(saved, null).map((s) => s.interest)).toEqual(["comida", "aventura"]);
  });

  it("sin guardados no hay sugerencias", () => {
    expect(suggestInterests([], null)).toEqual([]);
  });
});
