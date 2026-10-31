import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { _setClientForTests } from "@/lib/ai/client";
import { resetTelemetry } from "@/lib/ai/telemetry";
import { DEMO_ACTIVITIES, DEMO_TRIP } from "./demo";
import { buildTripPlan } from "./engine";
import { interpretTripTwinMessage } from "./assistant";

const context = {
  trip: DEMO_TRIP,
  activities: DEMO_ACTIVITIES,
  plan: buildTripPlan(DEMO_TRIP, DEMO_ACTIVITIES, { now: "2026-10-28T12:00:00Z" }),
};

beforeEach(() => {
  resetTelemetry();
  _setClientForTests(null);
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  _setClientForTests(undefined);
  vi.restoreAllMocks();
});

describe("Trip Twin assistant", () => {
  it("prepara una vista previa local para retrasar una actividad nombrada", async () => {
    const result = await interpretTripTwinMessage("Retrasa Visita cultural 30 minutos", context);
    expect(result.source).toBe("local");
    expect(result.proposal).toEqual({ type: "delay", activityId: "museum", delayMinutes: 30 });
    expect(result.preview).toMatchObject({ status: "feasible" });
    expect(result.message).toContain("el plan actual sigue sin cambios");
  });

  it("pide una actividad en vez de adivinar cuando falta el nombre", async () => {
    const result = await interpretTripTwinMessage("Quiero cancelar una actividad", context);
    expect(result.proposal).toBeNull();
    expect(result.message).toContain("nombre exacto");
  });

  it("no propone retirar compromisos fijos", async () => {
    const result = await interpretTripTwinMessage("Quita Compromiso con horario fijo", context);
    expect(result.proposal).toBeNull();
    expect(result.message).toContain("compromiso fijo");
  });

  it("no inventa minutos cuando la petición de retraso no los especifica", async () => {
    const result = await interpretTripTwinMessage("Retrasa Visita cultural", context);
    expect(result.proposal).toBeNull();
    expect(result.message).toContain("cuántos minutos");
  });

  it("usa la interpretación de Anthropic cuando está disponible y sigue proponiendo una acción validada", async () => {
    _setClientForTests({ complete: async () => ({ text: JSON.stringify({ intent: "cancel_activity", activityName: "Visita cultural", delayMinutes: null, budgetAmount: null }), inputTokens: 50, outputTokens: 25 }) });
    const result = await interpretTripTwinMessage("Quiero cambiar el itinerario", context);
    expect(result.source).toBe("anthropic");
    expect(result.proposal).toEqual({ type: "activity_cancelled", activityId: "museum" });
    expect(result.message).toContain("los cálculos son del motor determinista");
  });
});
