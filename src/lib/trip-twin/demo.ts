import type { Activity, Trip } from "./types";

/** Datos sintéticos para probar la mecánica. No son horarios, precios ni rutas verificados. */
export const DEMO_TRIP: Trip = {
  id: "sao-paulo-demo",
  destination: "São Paulo, Brasil",
  startAt: "2026-11-04T09:00:00-03:00",
  endAt: "2026-11-04T18:00:00-03:00",
  timeZone: "America/Sao_Paulo",
  budget: { amount: 150, currency: "USD" },
  travelers: 2,
};

const demoEvidence = {
  status: "estimated" as const,
  sourceId: "synthetic-demo-data",
  observedAt: "2026-10-27T12:00:00-03:00",
  expiresAt: null,
};
const unknownEvidence = {
  status: "unknown" as const,
  sourceId: null,
  observedAt: null,
  expiresAt: null,
};

export const DEMO_ACTIVITIES: Activity[] = [
  {
    id: "cultural-walk", name: "Paseo cultural", location: { latitude: -23.56, longitude: -46.65 },
    durationMinutes: 75, importance: "high", cost: { amount: 8, currency: "USD", basis: "per_person" },
    travelMinutesFromPrevious: 0, travelEvidence: demoEvidence, hoursEvidence: demoEvidence, costEvidence: demoEvidence, demoData: true,
  },
  {
    id: "lunch", name: "Almuerzo local", location: { latitude: -23.55, longitude: -46.64 },
    durationMinutes: 70, importance: "normal", cost: { amount: 18, currency: "USD", basis: "per_person" },
    travelMinutesFromPrevious: 20, travelEvidence: demoEvidence, hoursEvidence: demoEvidence, costEvidence: demoEvidence, demoData: true,
  },
  {
    id: "museum", name: "Visita cultural", location: { latitude: -23.56, longitude: -46.65 },
    durationMinutes: 90, importance: "normal", cost: { amount: 12, currency: "USD", basis: "per_person" },
    travelMinutesFromPrevious: 25, travelEvidence: demoEvidence, hoursEvidence: demoEvidence, costEvidence: demoEvidence, demoData: true,
  },
  {
    id: "fixed-event", name: "Compromiso con horario fijo", location: { latitude: -23.60, longitude: -46.70 },
    durationMinutes: 60, importance: "fixed", fixedStart: "2026-11-04T16:00:00-03:00",
    cost: { amount: null, currency: "USD", basis: "unknown" }, travelMinutesFromPrevious: 35,
    travelEvidence: demoEvidence, hoursEvidence: unknownEvidence, costEvidence: unknownEvidence, demoData: true,
  },
];
