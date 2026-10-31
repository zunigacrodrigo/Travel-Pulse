import { describe, expect, it } from "vitest";
import { pickRelevantSignal } from "./trip-link";
import type { TravelSignal } from "./types";

const NOW = Date.parse("2026-11-04T15:00:00Z");
const base: TravelSignal = { id: "s1", title: "Demoras en el tren", detail: "Salidas con 15 minutos de demora", place: "Estación Alameda", city: "Santiago", type: "Transporte", createdAt: "2026-11-04T14:30:00Z", expiresAt: "2026-11-04T18:30:00Z", source: "comunidad", evidence: "observación directa", confirmations: 0, reporter: "Viajero" } as TravelSignal;

describe("pickRelevantSignal", () => {
  it("elige la señal vigente más reciente de la ciudad del viaje", () => {
    const older = { ...base, id: "s0", createdAt: "2026-11-04T13:50:00Z" };
    expect(pickRelevantSignal([older, base], "Santiago, Chile", NOW)?.id).toBe("s1");
  });
  it("ignora señales caducadas, de otra ciudad y los ejemplos", () => {
    const rows = [{ ...base, id: "x1", expiresAt: "2026-11-04T14:00:00Z" }, { ...base, id: "x2", city: "Valparaíso" }, { ...base, id: "x3", source: "demo" }];
    expect(pickRelevantSignal(rows, "Santiago, Chile", NOW)).toBeNull();
  });
  it("tolera datos inválidos del almacenamiento", () => {
    expect(pickRelevantSignal("basura", "Santiago", NOW)).toBeNull();
    expect(pickRelevantSignal([null, 3, {}], "Santiago", NOW)).toBeNull();
  });
});
