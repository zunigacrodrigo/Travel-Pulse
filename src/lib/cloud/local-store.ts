"use client";

import { getDna, replaceDna } from "@/lib/client/dna";
import { getSavedTrips, replaceTrips } from "@/lib/client/saved";
import { activitySchema, tripPlanSchema, tripSchema } from "@/lib/trip-twin/types";
import { emptyHistory, parseHistory } from "@/lib/trip-twin/history";
import type { LocalStore, TripDoc } from "./sync";

export const TRIP_KEY = "travel-pulse.trip-twin.v1";
export const HISTORY_KEY = "travel-pulse.trip-twin.history.v1";

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function readTripDoc(): TripDoc | null {
  const raw = readJson(TRIP_KEY);
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const trip = tripSchema.safeParse(r.trip);
  const plan = tripPlanSchema.safeParse(r.plan);
  if (!trip.success || !plan.success || !Array.isArray(r.activities)) return null;
  const activities = r.activities.flatMap((a) => {
    const p = activitySchema.safeParse(a);
    return p.success ? [p.data] : [];
  });
  const rawHistory = readJson(HISTORY_KEY);
  return { trip: trip.data, activities, plan: plan.data, history: rawHistory ? parseHistory(rawHistory) : emptyHistory() };
}

/** Dispositivo del viajero: localStorage, con los mismos formatos que usa la app. */
export const browserLocalStore: LocalStore = {
  getDna,
  replaceDna,
  getSaved: getSavedTrips,
  replaceSaved: replaceTrips,
  getTripDoc: readTripDoc,
  setTripDoc(doc) {
    try {
      localStorage.setItem(TRIP_KEY, JSON.stringify({ trip: doc.trip, activities: doc.activities, plan: doc.plan }));
      localStorage.setItem(HISTORY_KEY, JSON.stringify(doc.history));
    } catch {
      /* sin almacenamiento: la sincronización informará en el próximo intento */
    }
  },
};
