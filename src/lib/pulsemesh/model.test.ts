import { describe, expect, it } from "vitest";
import { CATEGORIES, KINDS, friendlyError, parsePublicSignals, pilotCity, reportInputSchema, roundCoord, stateText, toInsertRow, validity } from "./model";

const ok = { category: "afluencia", kind: "fila_larga", title: "Fila larga en el ascensor" } as const;

describe("pilotCity", () => {
  it("reconoce las tres ciudades del piloto con distintas escrituras", () => {
    expect(pilotCity("Santiago")?.key).toBe("santiago-cl");
    expect(pilotCity("Santiago, Chile")?.key).toBe("santiago-cl");
    expect(pilotCity("Santiago de Chile")?.key).toBe("santiago-cl");
    expect(pilotCity("São Paulo")?.key).toBe("sao-paulo-br");
    expect(pilotCity("sao paulo, Brasil")?.key).toBe("sao-paulo-br");
    expect(pilotCity("Valparaíso")?.key).toBe("valparaiso-cl");
  });
  it("no confunde otras ciudades", () => {
    expect(pilotCity("Santiago de Compostela")).toBeNull();
    expect(pilotCity("Santiago, España")).toBeNull();
    expect(pilotCity("São Paulo, Brazil")?.key).toBe("sao-paulo-br");
    expect(pilotCity("Valparaíso, Chile")?.key).toBe("valparaiso-cl");
    expect(pilotCity("Buenos Aires")).toBeNull();
    expect(pilotCity("")).toBeNull();
  });
});

describe("reportInputSchema", () => {
  it("acepta un reporte válido", () => expect(reportInputSchema.safeParse(ok).success).toBe(true));
  it("rechaza títulos cortos o excesivos y tipos que no pertenecen a la categoría", () => {
    expect(reportInputSchema.safeParse({ ...ok, title: "ab" }).success).toBe(false);
    expect(reportInputSchema.safeParse({ ...ok, title: "x".repeat(121) }).success).toBe(false);
    expect(reportInputSchema.safeParse({ ...ok, kind: "lugar_nuevo" }).success).toBe(false);
  });
  it("la categoría seguridad no existe en el piloto", () => {
    expect(CATEGORIES).not.toContain("seguridad" as never);
    expect(reportInputSchema.safeParse({ ...ok, category: "seguridad" }).success).toBe(false);
  });
  it("precios exigen monto y moneda; el resto no admite monto", () => {
    const p = { category: "precios", kind: "precio_observado", title: "Menú del día" } as const;
    expect(reportInputSchema.safeParse(p).success).toBe(false);
    expect(reportInputSchema.safeParse({ ...p, priceAmount: 7500 }).success).toBe(false);
    expect(reportInputSchema.safeParse({ ...p, priceAmount: 7500, priceCurrency: "CLP" }).success).toBe(true);
    expect(reportInputSchema.safeParse({ ...ok, priceAmount: 10, priceCurrency: "CLP" }).success).toBe(false);
    expect(reportInputSchema.safeParse({ ...p, priceAmount: -1, priceCurrency: "CLP" }).success).toBe(false);
  });
  it("la ubicación va completa o no va", () => {
    expect(reportInputSchema.safeParse({ ...ok, lat: -33.4 }).success).toBe(false);
    expect(reportInputSchema.safeParse({ ...ok, lat: -33.4, lon: -70.6 }).success).toBe(true);
    expect(reportInputSchema.safeParse({ ...ok, lat: 95, lon: 0 }).success).toBe(false);
  });
  it("todos los tipos declarados pertenecen a una categoría válida", () => {
    for (const c of CATEGORIES) for (const k of KINDS[c]) expect(reportInputSchema.safeParse({ category: c, kind: k.kind, title: "Título válido", ...(c === "precios" ? { priceAmount: 1, priceCurrency: "CLP" } : {}) }).success).toBe(true);
  });
});

describe("toInsertRow", () => {
  it("redondea la ubicación a ~1 km y no envía columnas del servidor", () => {
    const row = toInsertRow({ ...ok, lat: -33.04567, lon: -71.61987 }, "u1", "valparaiso-cl");
    expect(row.lat_approx).toBe(-33.05);
    expect(row.lon_approx).toBe(-71.62);
    for (const k of ["expires_at", "flags", "hidden", "id", "created_at", "observed_at"]) expect(row).not.toHaveProperty(k);
    expect(row.user_id).toBe("u1");
  });
  it("sin ubicación ni precio envía null, y un detalle vacío no se guarda", () => {
    const row = toInsertRow({ ...ok, detail: "" }, "u1", "santiago-cl");
    expect(row).toMatchObject({ lat_approx: null, lon_approx: null, price_amount: null, detail: null });
  });
  it("roundCoord", () => expect(roundCoord(-23.5558)).toBe(-23.56));
});

describe("parsePublicSignals", () => {
  const row = { id: "s1", city_key: "santiago-cl", category: "afluencia", kind: "fila_larga", title: "Fila", detail: null, price_amount: null, price_currency: null,
    observed_at: "2026-10-31T10:00:00Z", expires_at: "2026-10-31T16:00:00Z", independent_count: 3, contradicted_count: 0, state: "corroborada", is_mine: false };
  it("interpreta filas válidas y convierte el monto que llega como texto", () => {
    const r = parsePublicSignals([{ ...row, category: "precios", price_amount: "7500.00", price_currency: "CLP" }]);
    expect(r[0]).toMatchObject({ priceAmount: 7500, state: "corroborada", independentCount: 3, isMine: false });
  });
  it("descarta filas fuera de contrato y entradas que no son listas", () => {
    expect(parsePublicSignals([row, { ...row, id: "x", category: "seguridad" }, { ...row, id: "y", state: "inventado" }, null, 5])).toHaveLength(1);
    expect(parsePublicSignals(null)).toEqual([]);
    expect(parsePublicSignals({})).toEqual([]);
  });
  it("lo más reciente primero", () => {
    const r = parsePublicSignals([{ ...row, id: "a" }, { ...row, id: "b", observed_at: "2026-10-31T12:00:00Z" }]);
    expect(r.map((x) => x.id)).toEqual(["b", "a"]);
  });
});

describe("textos", () => {
  it("el estado nunca se presenta como oficial", () => {
    expect(stateText({ state: "corroborada", independentCount: 3, contradictedCount: 0 })).toContain("no una fuente oficial");
    expect(stateText({ state: "por_confirmar", independentCount: 1, contradictedCount: 0 })).toContain("Falta que otras");
    expect(stateText({ state: "en_disputa", independentCount: 1, contradictedCount: 2 })).toContain("No lo tomes como cierto");
  });
  it("vigencia", () => {
    const now = new Date("2026-10-31T10:00:00Z");
    expect(validity("2026-10-31T15:30:00Z", now)).toBe("vigente por 6 h");
    expect(validity("2026-11-05T10:00:00Z", now)).toBe("vigente por 5 d");
    expect(validity("2026-10-31T09:00:00Z", now)).toBe("caducado");
    expect(validity("basura", now)).toBe("caducado");
  });
  it("errores de la base de datos se traducen", () => {
    expect(friendlyError({ message: "Límite diario de reportes alcanzado" })).toContain("20 reportes");
    expect(friendlyError({ message: "No puedes confirmar tu propio reporte" })).toContain("tu propio reporte");
    expect(friendlyError({ code: "23505" })).toContain("Ya habías respondido");
    expect(friendlyError({ code: "42501" })).toContain("Inicia sesión");
    expect(friendlyError(null)).toContain("Inténtalo de nuevo");
  });
});
