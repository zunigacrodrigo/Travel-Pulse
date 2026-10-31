import type { Activity, PlanChange, PlanItem, PlanViolation, Trip, TripPlan } from "./types";

const minute = 60_000;
const iso = (ms: number) => new Date(ms).toISOString();
const intersects = (aStart: number, aEnd: number, bStart: number, bEnd: number) => aStart < bEnd && bStart < aEnd;

function activityCost(activity: Activity, travelers: number): number | null {
  if (activity.cost.amount === null || activity.cost.basis === "unknown") return null;
  return activity.cost.basis === "per_person" ? activity.cost.amount * travelers : activity.cost.amount;
}

function openingWindowFor(activity: Activity, start: number, end: number): { start: number; end: number } | null {
  if (!activity.openingHours?.length) return null;
  return activity.openingHours
    .map((w) => ({ start: Date.parse(w.start), end: Date.parse(w.end) }))
    .find((w) => start >= w.start && end <= w.end) ?? null;
}

export interface BuildPlanOptions {
  version?: number;
  parentPlanId?: string | null;
  now?: string;
  statuses?: Record<string, PlanItem["status"]>;
}

/** Motor puro y determinista: no consulta red ni inventa duraciones de trayecto. */
export function buildTripPlan(trip: Trip, activities: Activity[], options: BuildPlanOptions = {}): TripPlan {
  const now = options.now ?? new Date().toISOString();
  const tripStart = Date.parse(trip.startAt);
  const tripEnd = Date.parse(trip.endAt);
  const violations: PlanViolation[] = [];
  const items: PlanItem[] = [];
  const seen = new Set<string>();
  let cursor = tripStart;
  let totalCost = 0;
  let unknownCost = false;
  let hasUnknownTravel = false;
  // El orden de entrada es deliberado: la interfaz o un optimizador pueden proponerlo;
  // este motor verifica factibilidad, no finge resolver el TSP óptimo.
  const sorted = [...activities];

  for (const activity of sorted) {
    if (seen.has(activity.id)) {
      violations.push({ code: "DUPLICATE_ACTIVITY", severity: "hard", activityIds: [activity.id], message: `La actividad ${activity.name} está duplicada.` });
      continue;
    }
    seen.add(activity.id);
    const status = options.statuses?.[activity.id] ?? "planned";
    if (status === "cancelled") continue;

    const travel = activity.travelMinutesFromPrevious;
    if (items.length === 0) {
      hasUnknownTravel = true;
      violations.push({ code: "UNKNOWN_ORIGIN_ROUTE", severity: "warning", activityIds: [activity.id], message: `No se definió el punto de partida físico del viajero; el traslado inicial hacia ${activity.name} no está calculado.` });
    } else if (travel === null) {
      hasUnknownTravel = true;
      violations.push({ code: "UNKNOWN_TRAVEL", severity: "warning", activityIds: [activity.id], message: `No se conoce el tiempo de traslado hacia ${activity.name}; la hora de llegada no puede considerarse confirmada.` });
    }
    const travelMs = items.length === 0 ? 0 : (travel ?? 0) * minute;
    let start = activity.fixedStart ? Date.parse(activity.fixedStart) : cursor + travelMs;
    if (!activity.fixedStart) start = Math.max(start, cursor + travelMs, activity.startNotBefore ? Date.parse(activity.startNotBefore) : Number.NEGATIVE_INFINITY);
    const end = start + activity.durationMinutes * minute;

    if (activity.fixedStart && start < cursor + travelMs) {
      violations.push({ code: "FIXED_TIME_CONFLICT", severity: "hard", activityIds: [activity.id, ...(items.length ? [items[items.length - 1]!.activityId] : [])], message: `El compromiso fijo ${activity.name} no deja tiempo suficiente para el traslado o la actividad anterior.` });
    }
    if (start < tripStart || end > tripEnd) {
      violations.push({ code: "OUTSIDE_TRIP_WINDOW", severity: activity.importance === "fixed" ? "hard" : "warning", activityIds: [activity.id], message: `${activity.name} queda fuera del intervalo disponible del viaje.` });
    }
    if (activity.openingHours?.length && !openingWindowFor(activity, start, end)) {
      violations.push({ code: "OUTSIDE_OPENING_HOURS", severity: "hard", activityIds: [activity.id], message: `${activity.name} no cabe en una ventana de apertura conocida.` });
    }
    const previous = items[items.length - 1];
    if (previous && intersects(start, end, Date.parse(previous.plannedStart), Date.parse(previous.plannedEnd))) {
      violations.push({ code: "OVERLAP", severity: "hard", activityIds: [previous.activityId, activity.id], message: `${activity.name} se solapa con otra actividad.` });
    }
    const cost = activityCost(activity, trip.travelers);
    if (cost === null) unknownCost = true;
    else totalCost += cost;

    items.push({
      activityId: activity.id,
      order: items.length + 1,
      plannedStart: iso(start),
      plannedEnd: iso(end),
      travelMinutesFromPrevious: items.length === 0 ? null : travel,
      travelEvidenceStatus: items.length === 0 ? "unknown" : activity.travelEvidence.status,
      status,
    });
    cursor = Math.max(cursor, end);
  }

  if (unknownCost) {
    violations.push({ code: "UNKNOWN_COST", severity: "warning", activityIds: activities.filter((a) => activityCost(a, trip.travelers) === null).map((a) => a.id), message: "Hay actividades con coste desconocido; el total es parcial y no permite certificar el presupuesto." });
  }
  if (!unknownCost && totalCost > trip.budget.amount) {
    violations.push({ code: "BUDGET_EXCEEDED", severity: "hard", activityIds: activities.map((a) => a.id), message: `El coste estimado (${totalCost.toFixed(2)} ${trip.budget.currency}) supera el presupuesto (${trip.budget.amount.toFixed(2)} ${trip.budget.currency}).` });
  }
  if (hasUnknownTravel && !violations.some((v) => v.code === "UNKNOWN_TRAVEL")) {
    violations.push({ code: "UNKNOWN_TRAVEL", severity: "warning", activityIds: [], message: "Hay desplazamientos sin duración conocida." });
  }

  const hasHardViolation = violations.some((v) => v.severity === "hard");
  return {
    id: `plan-${trip.id}-v${options.version ?? 1}`,
    tripId: trip.id,
    version: options.version ?? 1,
    status: hasHardViolation ? "infeasible" : "feasible",
    items,
    estimatedTotalCost: unknownCost ? null : Number(totalCost.toFixed(2)),
    currency: trip.budget.currency,
    violations,
    createdAt: now,
    parentPlanId: options.parentPlanId ?? null,
    demoData: activities.some((a) => a.demoData),
  };
}

export function replanTrip(trip: Trip, activities: Activity[], basePlan: TripPlan, change: PlanChange, now: string): { plan: TripPlan; explanation: string; tradeoffs: string[] } {
  let updatedTrip = trip;
  let updatedActivities = activities.map((a) => ({ ...a }));
  const statuses: Record<string, PlanItem["status"]> = Object.fromEntries(basePlan.items.map((item) => [item.activityId, item.status]));
  const completedIds = new Set(basePlan.items.filter((item) => item.status === "completed").map((item) => item.activityId));

  if (change.type === "activity_cancelled") {
    if (completedIds.has(change.activityId)) throw new Error("No se puede cancelar una actividad ya completada.");
    if (!updatedActivities.some((a) => a.id === change.activityId)) throw new Error("Actividad desconocida.");
    statuses[change.activityId] = "cancelled";
    updatedActivities = updatedActivities.filter((a) => a.id !== change.activityId);
  } else if (change.type === "delay") {
    if (completedIds.has(change.activityId)) throw new Error("No se puede retrasar una actividad ya completada.");
    const target = updatedActivities.find((a) => a.id === change.activityId);
    if (!target) throw new Error("Actividad desconocida.");
    if (target.importance === "fixed") throw new Error("El compromiso fijo no se puede desplazar automáticamente.");
    // El retraso se modela conservadoramente como tiempo adicional de preparación/espera antes de esta actividad.
    const baseItem = basePlan.items.find((item) => item.activityId === change.activityId);
    if (!baseItem) throw new Error("La actividad no aparece en el plan base.");
    target.startNotBefore = iso(Date.parse(baseItem.plannedStart) + change.delayMinutes * minute);
  } else if (change.type === "budget_changed") {
    updatedTrip = { ...trip, budget: { ...trip.budget, amount: change.amount } };
  }

  const plan = buildTripPlan(updatedTrip, updatedActivities, {
    version: basePlan.version + 1,
    parentPlanId: basePlan.id,
    now,
    statuses,
  });
  const tradeoffs: string[] = [];
  if (change.type === "activity_cancelled") tradeoffs.push(`Se retiró ${change.activityId}; se conservan las demás actividades no afectadas.`);
  if (change.type === "delay") tradeoffs.push(`Se añadieron ${change.delayMinutes} minutos al margen previo a ${change.activityId}.`);
  if (change.type === "budget_changed") tradeoffs.push(`El presupuesto cambió a ${change.amount} ${trip.budget.currency}.`);
  if (plan.violations.some((v) => v.severity === "hard")) tradeoffs.push("La alternativa conserva conflictos duros y requiere una decisión del viajero.");
  if (plan.violations.some((v) => v.code === "UNKNOWN_COST" || v.code === "UNKNOWN_TRAVEL")) tradeoffs.push("La evidencia incompleta impide certificar el coste o la duración de todos los trayectos.");
  return { plan, explanation: plan.status === "feasible" ? "Se generó una nueva versión del itinerario. Revisa los cambios y la evidencia antes de aceptarla." : "No se pudo generar un itinerario completamente factible con las restricciones actuales.", tradeoffs };
}
