import { describe, expect, it } from "vitest";
import { decideByTimestamp, isCloudDestinationId, mergeSaved } from "./merge";

const A = "2026-10-01T10:00:00.000Z";
const B = "2026-10-02T10:00:00.000Z";

describe("decideByTimestamp", () => {
  it("sin fechas no hace nada", () => expect(decideByTimestamp(null, null)).toBe("none"));
  it("solo local: sube", () => expect(decideByTimestamp(A, null)).toBe("push"));
  it("solo nube: baja", () => expect(decideByTimestamp(null, A)).toBe("pull"));
  it("gana la más reciente", () => {
    expect(decideByTimestamp(B, A)).toBe("push");
    expect(decideByTimestamp(A, B)).toBe("pull");
  });
  it("iguales no se tocan", () => expect(decideByTimestamp(A, A)).toBe("none"));
  it("una fecha inválida cuenta como ausente", () => {
    expect(decideByTimestamp("basura", A)).toBe("pull");
    expect(decideByTimestamp(A, "basura")).toBe("push");
    expect(decideByTimestamp("x", "y")).toBe("none");
  });
});

describe("mergeSaved", () => {
  const item = (destinationId: string, savedAt: string, tag = "") => ({ destinationId, savedAt, tag });

  it("une listas distintas y sube solo lo que la nube no tiene", () => {
    const r = mergeSaved([item("CUZ", A)], [item("SCL", A)]);
    expect(r.merged.map((m) => m.destinationId).sort()).toEqual(["CUZ", "SCL"]);
    expect(r.toPush.map((m) => m.destinationId)).toEqual(["CUZ"]);
    expect(r.pulled).toBe(1);
  });
  it("para el mismo destino gana el más reciente y no se duplica", () => {
    const r = mergeSaved([item("CUZ", A, "local")], [item("CUZ", B, "nube")]);
    expect(r.merged).toHaveLength(1);
    expect(r.merged[0]!.tag).toBe("nube");
    expect(r.toPush).toHaveLength(0);
    expect(r.pulled).toBe(1);
  });
  it("si lo local es más reciente, se sube", () => {
    const r = mergeSaved([item("CUZ", B, "local")], [item("CUZ", A, "nube")]);
    expect(r.merged[0]!.tag).toBe("local");
    expect(r.toPush).toHaveLength(1);
    expect(r.pulled).toBe(0);
  });
  it("idénticos: no hay nada que mover", () => {
    const r = mergeSaved([item("CUZ", A)], [item("CUZ", A)]);
    expect(r.toPush).toHaveLength(0);
    expect(r.pulled).toBe(0);
  });
  it("ordena con lo más reciente primero y tolera listas vacías", () => {
    expect(mergeSaved([item("CUZ", A), item("SCL", B)], []).merged.map((m) => m.destinationId)).toEqual(["SCL", "CUZ"]);
    expect(mergeSaved([], [])).toEqual({ merged: [], toPush: [], pulled: 0 });
  });
});

describe("isCloudDestinationId", () => {
  it("acepta códigos de catálogo y rechaza el resto", () => {
    expect(isCloudDestinationId("CUZ")).toBe(true);
    expect(isCloudDestinationId("cusco-pe")).toBe(false);
    expect(isCloudDestinationId("")).toBe(false);
  });
});
