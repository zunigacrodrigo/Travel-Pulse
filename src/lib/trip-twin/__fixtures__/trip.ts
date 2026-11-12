import type { Activity, Trip } from "../types";

/**
 * SOLO PARA PRUEBAS. Datos inventados para ejercitar la mecánica del motor (restricciones, deshacer, sincronizar).
 * Ningún código de producto debe importar este archivo.
 */
export const FIXTURE_TRIP: Trip = {
  id: "fixture-trip",
  destination: "São Paulo, Brasil",
  startAt: "2026-11-04T09:00:00-03:00",
  endAt: "2026-11-04T18:00:00-03:00",
  timeZone: "America/Sao_Paulo",
  budget: { amount: 150, currency: "USD" },
  travelers: 2,
};

const fixtureEvidence = {
  status: "estimated" as const,
  sourceId: "test-fixture",
  observedAt: "2026-10-27T12:00:00-03:00",
  expiresAt: null,
};
const unknownEvidence = {
  status: "unknown" as const,
  sourceId: null,
  observedAt: null,
  expiresAt: null,
};

export const FIXTURE_ACTIVITIES: Activity[] = [
  {
    id: "cultural-walk", name: "Paseo cultural", location: { latitude: -23.56, longitude: -46.65 },
    durationMinutes: 75, importance: "high", cost: { amount: 8, currency: "USD", basis: "per_person" },
    travelMinutesFromPrevious: 0, travelEvidence: fixtureEvidence, hoursEvidence: fixtureEvidence, costEvidence: fixtureEvidence, demoData: true,
  },
  {
    id: "lunch", name: "Almuerzo local", location: { latitude: -23.55, longitude: -46.64 },
    durationMinutes: 70, importance: "normal", cost: { amount: 18, currency: "USD", basis: "per_person" },
    travelMinutesFromPrevious: 20, travelEvidence: fixtureEvidence, hoursEvidence: fixtureEvidence, costEvidence: fixtureEvidence, demoData: true,
  },
  {
    id: "museum", name: "Visita cultural", location: { latitude: -23.56, longitude: -46.65 },
    durationMinutes: 90, importance: "normal", cost: { amount: 12, currency: "USD", basis: "per_person" },
    travelMinutesFromPrevious: 25, travelEvidence: fixtureEvidence, hoursEvidence: fixtureEvidence, costEvidence: fixtureEvidence, demoData: true,
  },
  {
    id: "fixed-event", name: "Compromiso con horario fijo", location: { latitude: -23.60, longitude: -46.70 },
    durationMinutes: 60, importance: "fixed", fixedStart: "2026-11-04T16:00:00-03:00",
    cost: { amount: null, currency: "USD", basis: "unknown" }, travelMinutesFromPrevious: 35,
    travelEvidence: fixtureEvidence, hoursEvidence: unknownEvidence, costEvidence: unknownEvidence, demoData: true,
  },
];
