import { validateDna, type TravelDna } from "@/lib/client/dna-core";
import type { SavedTrip } from "@/lib/client/saved";
import { activitySchema, tripPlanSchema, tripSchema, type Activity, type Trip, type TripPlan } from "@/lib/trip-twin/types";
import { emptyHistory, parseHistory, type History } from "@/lib/trip-twin/history";
import { decideByTimestamp, isCloudDestinationId, mergeSaved, type SyncDecision } from "./merge";

/** Viaje activo de Trip Twin tal como se guarda en un dispositivo o en la nube. */
export interface TripDoc {
  trip: Trip;
  activities: Activity[];
  plan: TripPlan;
  history: History;
}

/** Lo que el sincronizador necesita de la nube. La implementación real usa Supabase. */
export interface CloudStore {
  getDna(userId: string): Promise<unknown>;
  /** Devuelve cuántas filas se actualizaron (0 = el perfil no existe). */
  setDna(userId: string, dna: TravelDna): Promise<number>;
  listSaved(userId: string): Promise<unknown[]>;
  upsertSaved(userId: string, items: SavedTrip[]): Promise<void>;
  getTrip(userId: string, localId: string): Promise<unknown | null>;
  upsertTrip(userId: string, localId: string, doc: TripDoc): Promise<void>;
}

/** Lo que el sincronizador necesita del dispositivo. */
export interface LocalStore {
  getDna(): TravelDna | null;
  replaceDna(dna: TravelDna): void;
  getSaved(): SavedTrip[];
  replaceSaved(list: SavedTrip[]): void;
  getTripDoc(): TripDoc | null;
  setTripDoc(doc: TripDoc): void;
}

export interface SyncReport {
  at: string;
  dna: SyncDecision;
  savedPushed: number;
  savedPulled: number;
  trip: SyncDecision;
  /** Mensajes legibles; cada bloque falla por separado y no impide a los demás. */
  errors: string[];
}

export const ACTIVE_TRIP_ID = "active";

const message = (e: unknown) => (e instanceof Error ? e.message : "error desconocido");

/** Valida lo que llega de la nube: nunca se confía en él. */
export function parseTripDoc(raw: unknown): TripDoc | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const trip = tripSchema.safeParse(r.trip);
  const plan = tripPlanSchema.safeParse(r.plan);
  if (!trip.success || !plan.success || !Array.isArray(r.activities)) return null;
  const activities = r.activities.flatMap((a) => {
    const p = activitySchema.safeParse(a);
    return p.success ? [p.data] : [];
  });
  return { trip: trip.data, activities, plan: plan.data, history: r.history === undefined ? emptyHistory() : parseHistory(r.history) };
}

/**
 * Sincroniza Travel DNA, guardados y el viaje activo. Local primero: nunca borra nada local
 * por un fallo de red, y el itinerario de demostración no se sube (no es dato del usuario).
 */
export async function syncAll(cloud: CloudStore, local: LocalStore, userId: string, now: Date = new Date()): Promise<SyncReport> {
  const report: SyncReport = { at: now.toISOString(), dna: "none", savedPushed: 0, savedPulled: 0, trip: "none", errors: [] };

  // --- Travel DNA
  try {
    const mine = local.getDna();
    const theirs = validateDna(await cloud.getDna(userId));
    const decision = decideByTimestamp(mine?.updatedAt, theirs?.updatedAt);
    if (decision === "push" && mine) {
      if ((await cloud.setDna(userId, mine)) === 0) throw new Error("no se encontró tu perfil en la nube");
    } else if (decision === "pull" && theirs) {
      local.replaceDna(theirs);
    }
    report.dna = decision;
  } catch (e) {
    report.errors.push(`Travel DNA: ${message(e)}`);
  }

  // --- Guardados
  try {
    const mine = local.getSaved();
    const theirs = (await cloud.listSaved(userId)) as SavedTrip[];
    const { merged, toPush, pulled } = mergeSaved(mine, theirs);
    const pushable = toPush.filter((t) => isCloudDestinationId(t.destinationId));
    if (pushable.length) await cloud.upsertSaved(userId, pushable);
    if (pulled > 0) local.replaceSaved(merged);
    report.savedPushed = pushable.length;
    report.savedPulled = pulled;
  } catch (e) {
    report.errors.push(`Guardados: ${message(e)}`);
  }

  // --- Viaje activo (el de demostración cuenta como ausente)
  try {
    const mine = local.getTripDoc();
    const mineUser = mine && !mine.plan.demoData ? mine : null;
    const theirs = parseTripDoc(await cloud.getTrip(userId, ACTIVE_TRIP_ID));
    const decision = decideByTimestamp(mineUser?.plan.createdAt, theirs?.plan.createdAt);
    if (decision === "push" && mineUser) await cloud.upsertTrip(userId, ACTIVE_TRIP_ID, mineUser);
    else if (decision === "pull" && theirs) local.setTripDoc(theirs);
    report.trip = decision;
  } catch (e) {
    report.errors.push(`Viaje: ${message(e)}`);
  }

  return report;
}
