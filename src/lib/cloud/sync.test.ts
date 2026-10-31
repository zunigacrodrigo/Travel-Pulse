import { describe, expect, it } from "vitest";
import { buildTripPlan } from "@/lib/trip-twin/engine";
import { DEMO_ACTIVITIES, DEMO_TRIP } from "@/lib/trip-twin/demo";
import { defaultDna, type TravelDna } from "@/lib/client/dna-core";
import type { SavedTrip } from "@/lib/client/saved";
import { emptyHistory } from "@/lib/trip-twin/history";
import { syncAll, type CloudStore, type LocalStore, type TripDoc } from "./sync";

const T1 = "2026-10-01T10:00:00.000Z";
const T2 = "2026-10-02T10:00:00.000Z";
const dna = (updatedAt: string, origin = "SCL"): TravelDna => ({ ...defaultDna(new Date(updatedAt)), origin });
const saved = (id: string, savedAt: string): SavedTrip => ({
  destinationId: id, name: id, code: id, score: 70, totalUsd: 900, savedAt,
  request: { origin: "SCL", budgetUsd: 1500, days: 8, month: 11, flexibleDates: false, travelers: 1, interests: [] },
});
const tripDoc = (now: string, demo: boolean): TripDoc => {
  const acts = DEMO_ACTIVITIES.map((a) => ({ ...a, demoData: demo }));
  return { trip: DEMO_TRIP, activities: acts, plan: buildTripPlan(DEMO_TRIP, acts, { now }), history: emptyHistory() };
};

function fakes(init: { localDna?: TravelDna | null; cloudDna?: unknown; localSaved?: SavedTrip[]; cloudSaved?: SavedTrip[]; localTrip?: TripDoc | null; cloudTrip?: TripDoc | null; fail?: Partial<Record<keyof CloudStore, boolean>>; profileRows?: number }) {
  const s = { dna: init.localDna ?? null, saved: init.localSaved ?? [], trip: init.localTrip ?? null, cloudDna: init.cloudDna ?? null, cloudSaved: init.cloudSaved ?? [], cloudTrip: init.cloudTrip ?? null, upserts: 0 };
  const boom = (k: keyof CloudStore) => { if (init.fail?.[k]) throw new Error(`falla ${k}`); };
  const cloud: CloudStore = {
    async getDna() { boom("getDna"); return s.cloudDna; },
    async setDna(_u, d) { boom("setDna"); if (init.profileRows === 0) return 0; s.cloudDna = d; return 1; },
    async listSaved() { boom("listSaved"); return s.cloudSaved; },
    async upsertSaved(_u, items) { boom("upsertSaved"); s.upserts += items.length; s.cloudSaved = [...s.cloudSaved.filter((c) => !items.some((i) => i.destinationId === c.destinationId)), ...items]; },
    async getTrip() { boom("getTrip"); return s.cloudTrip; },
    async upsertTrip(_u, _id, doc) { boom("upsertTrip"); s.cloudTrip = doc; },
  };
  const local: LocalStore = {
    getDna: () => s.dna, replaceDna: (d) => { s.dna = d; },
    getSaved: () => s.saved, replaceSaved: (l) => { s.saved = l; },
    getTripDoc: () => s.trip, setTripDoc: (d) => { s.trip = d; },
  };
  return { s, cloud, local };
}

describe("syncAll", () => {
  it("sube el DNA local si la nube no tiene", async () => {
    const f = fakes({ localDna: dna(T1) });
    const r = await syncAll(f.cloud, f.local, "u");
    expect(r.dna).toBe("push");
    expect((f.s.cloudDna as TravelDna).updatedAt).toBe(T1);
  });
  it("baja el DNA de la nube en un dispositivo nuevo", async () => {
    const f = fakes({ cloudDna: dna(T1, "LIM") });
    const r = await syncAll(f.cloud, f.local, "u");
    expect(r.dna).toBe("pull");
    expect(f.s.dna?.origin).toBe("LIM");
  });
  it("el DNA más reciente gana en ambos sentidos", async () => {
    const a = fakes({ localDna: dna(T2, "SCL"), cloudDna: dna(T1, "LIM") });
    await syncAll(a.cloud, a.local, "u");
    expect((a.s.cloudDna as TravelDna).origin).toBe("SCL");
    const b = fakes({ localDna: dna(T1, "SCL"), cloudDna: dna(T2, "LIM") });
    await syncAll(b.cloud, b.local, "u");
    expect(b.s.dna?.origin).toBe("LIM");
  });
  it("ignora un DNA corrupto en la nube sin romper nada", async () => {
    const f = fakes({ localDna: dna(T1), cloudDna: { basura: true } });
    const r = await syncAll(f.cloud, f.local, "u");
    expect(r.dna).toBe("push");
    expect(r.errors).toEqual([]);
  });
  it("avisa si el perfil no existe en la nube", async () => {
    const f = fakes({ localDna: dna(T1), profileRows: 0 });
    const r = await syncAll(f.cloud, f.local, "u");
    expect(r.errors[0]).toContain("Travel DNA");
  });

  it("une guardados, sube lo nuevo y solo destinos del catálogo", async () => {
    const f = fakes({ localSaved: [saved("CUZ", T1), saved("cusco-pe", T1)], cloudSaved: [saved("SCL", T1)] });
    const r = await syncAll(f.cloud, f.local, "u");
    expect(r.savedPushed).toBe(1);
    expect(r.savedPulled).toBe(1);
    expect(f.s.saved.map((x) => x.destinationId).sort()).toEqual(["CUZ", "SCL", "cusco-pe"]);
    expect(f.s.cloudSaved.map((x) => x.destinationId).sort()).toEqual(["CUZ", "SCL"]);
  });
  it("sincronizar dos veces no repite trabajo", async () => {
    const f = fakes({ localSaved: [saved("CUZ", T1)], localDna: dna(T1) });
    await syncAll(f.cloud, f.local, "u");
    const second = await syncAll(f.cloud, f.local, "u");
    expect(second).toMatchObject({ dna: "none", savedPushed: 0, savedPulled: 0, trip: "none" });
  });

  it("no sube el itinerario de demostración", async () => {
    const f = fakes({ localTrip: tripDoc(T1, true) });
    const r = await syncAll(f.cloud, f.local, "u");
    expect(r.trip).toBe("none");
    expect(f.s.cloudTrip).toBeNull();
  });
  it("sube el viaje real del usuario y lo baja en otro dispositivo", async () => {
    const a = fakes({ localTrip: tripDoc(T1, false) });
    expect((await syncAll(a.cloud, a.local, "u")).trip).toBe("push");
    const b = fakes({ cloudTrip: a.s.cloudTrip });
    expect((await syncAll(b.cloud, b.local, "u")).trip).toBe("pull");
    expect(b.s.trip?.plan.createdAt).toBe(T1);
  });
  it("la demo local no pisa un viaje real en la nube", async () => {
    const f = fakes({ localTrip: tripDoc(T2, true), cloudTrip: tripDoc(T1, false) });
    const r = await syncAll(f.cloud, f.local, "u");
    expect(r.trip).toBe("pull");
    expect(f.s.trip?.plan.demoData).toBe(false);
  });
  it("un viaje corrupto en la nube se ignora", async () => {
    const f = fakes({ localTrip: tripDoc(T1, false), cloudTrip: { trip: 1 } as never });
    expect((await syncAll(f.cloud, f.local, "u")).trip).toBe("push");
  });

  it("un fallo en un bloque no impide los demás ni toca lo local", async () => {
    const f = fakes({ localDna: dna(T1), localSaved: [saved("CUZ", T1)], fail: { getDna: true } });
    const r = await syncAll(f.cloud, f.local, "u");
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toContain("Travel DNA");
    expect(r.savedPushed).toBe(1);
    expect(f.s.dna?.updatedAt).toBe(T1);
    expect(f.s.saved).toHaveLength(1);
  });
  it("si la red cae por completo, lo local queda intacto", async () => {
    const f = fakes({ localDna: dna(T1), localSaved: [saved("CUZ", T1)], localTrip: tripDoc(T1, false), fail: { getDna: true, listSaved: true, getTrip: true } });
    const r = await syncAll(f.cloud, f.local, "u");
    expect(r.errors).toHaveLength(3);
    expect(f.s.dna).not.toBeNull();
    expect(f.s.saved).toHaveLength(1);
    expect(f.s.trip).not.toBeNull();
  });
});
