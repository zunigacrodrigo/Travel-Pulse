import { beforeEach, describe, expect, it } from "vitest";
import type { GapRatings, TripRequest } from "@/lib/types";
import { computeGapValue, getRepository, hashIp, memoryRepository, memoryStore, resetMemoryStore } from "./repository";

const req: TripRequest = {
  origin: "SCL", budgetUsd: 1500, days: 8, month: 11, flexibleDates: false, travelers: 1, interests: ["aventura"],
};
const e: GapRatings = { autenticidad: 8, saturacion: 6, costo: 7, seguridad: 8, comida: 9 };
const r: GapRatings = { autenticidad: 7, saturacion: 4, costo: 6, seguridad: 8, comida: 9 };

describe("memoryRepository", () => {
  beforeEach(() => resetMemoryStore());

  it("getRepository usa memoria sin variables de Supabase", () => {
    delete process.env.SUPABASE_URL;
    expect(getRepository()).toBe(memoryRepository);
  });

  it("getDataset filtra por origen y completa prevMonthSaturation", async () => {
    const ds = await memoryRepository.getDataset("scl", 11);
    expect(ds.destinations).toHaveLength(30);
    expect(ds.prices.length).toBe(360);
    expect(ds.trends.find((t) => t.destinationId === "SLA")?.prevMonthSaturation).toBe(76);
    // FLN noviembre: saturación nula, pero octubre existe.
    expect(ds.trends.find((t) => t.destinationId === "FLN")?.prevMonthSaturation).toBe(80);
  });

  it("getDestination y getSources", async () => {
    expect((await memoryRepository.getDestination("cuz"))?.name).toBe("Cusco");
    expect(await memoryRepository.getDestination("XXX")).toBeNull();
    expect((await memoryRepository.getSources()).length).toBe(8);
  });

  it("guarda consulta y recomendaciones", async () => {
    const id = await memoryRepository.saveTripRequest(req, { anonId: "anon_12345678" });
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(memoryStore.tripRequests[0].anonId).toBe("anon_12345678");
  });

  it("nunca guarda la IP en claro", async () => {
    await memoryRepository.logOutboundClick({ destinationId: "CUZ", kind: "vuelos", url: "https://example.com", ip: "200.1.2.3" });
    const row = memoryStore.outboundClicks[0] as unknown as Record<string, unknown>;
    expect(row.ip).toBeUndefined();
    expect(row.ipHash).toBe(hashIp("200.1.2.3"));
    expect(JSON.stringify(row)).not.toContain("200.1.2.3");
  });

  it("calcula el gap con la expectativa previa del mismo actor", async () => {
    await memoryRepository.saveExpectation({ destinationId: "CUZ", ratings: e, anonId: "anon_12345678" });
    const gap = await memoryRepository.saveExperience({ destinationId: "CUZ", ratings: r, anonId: "anon_12345678", phrase: "<b>Muy bueno</b>" });
    expect(gap).toBe(computeGapValue(r, e));
    expect(gap).toBe(-0.8);
    expect(memoryStore.experiences[0].phrase).not.toContain("<");
    expect(await memoryRepository.getGapsForDestination("CUZ")).toEqual([-0.8]);
    // Otro actor sin expectativa: sin gap.
    expect(await memoryRepository.saveExperience({ destinationId: "CUZ", ratings: r, anonId: "anon_otro_1234" })).toBeNull();
  });

  it("rechaza valoraciones fuera de 1..10", async () => {
    await expect(
      memoryRepository.saveExpectation({ destinationId: "CUZ", ratings: { ...e, comida: 11 }, anonId: "anon_12345678" }),
    ).rejects.toThrow(RangeError);
  });

  it("logEvent ignora nombres inválidos", async () => {
    await memoryRepository.logEvent("results_viewed", { n: 5 });
    await memoryRepository.logEvent("Nombre Inválido!", {});
    expect(memoryStore.events).toHaveLength(1);
  });
});
