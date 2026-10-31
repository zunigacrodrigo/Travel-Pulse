"use client";

import type { PosterPalette, TripRequest } from "@/lib/types";
import { validateRequest } from "./query";
import { createJsonStore, useJsonStore } from "./storage";

export interface SavedTrip {
  destinationId: string;
  name: string;
  /** Código IATA que se muestra grande. */
  code: string;
  score: number | null;
  totalUsd: number | null;
  /** ISO 8601. */
  savedAt: string;
  request: TripRequest;
  country?: string;
  poster?: PosterPalette;
}

function validateTrips(raw: unknown): SavedTrip[] {
  if (!Array.isArray(raw)) return [];
  const out: SavedTrip[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const t = item as Record<string, unknown>;
    const request = validateRequest(t.request);
    if (!request || typeof t.destinationId !== "string" || typeof t.name !== "string") continue;
    out.push({
      destinationId: t.destinationId,
      name: t.name,
      code: typeof t.code === "string" ? t.code : t.destinationId,
      score: typeof t.score === "number" ? t.score : null,
      totalUsd: typeof t.totalUsd === "number" ? t.totalUsd : null,
      savedAt: typeof t.savedAt === "string" ? t.savedAt : new Date().toISOString(),
      request,
      country: typeof t.country === "string" ? t.country : undefined,
      poster: typeof t.poster === "object" && t.poster !== null ? (t.poster as PosterPalette) : undefined,
    });
  }
  return out;
}

const store = createJsonStore<SavedTrip[]>("tp-saved", [], validateTrips);

export function getSavedTrips(): SavedTrip[] {
  return store.get();
}

export function saveTrip(trip: SavedTrip): void {
  const rest = store.get().filter((t) => t.destinationId !== trip.destinationId);
  store.set([trip, ...rest]);
}

export function removeTrip(destinationId: string): void {
  store.set(store.get().filter((t) => t.destinationId !== destinationId));
}

/** Lista guardada; null mientras no se ha hidratado el cliente. */
export function useSavedTrips(): SavedTrip[] | null {
  return useJsonStore(store, null);
}

export function useIsSaved(destinationId: string): boolean {
  const list = useSavedTrips();
  return !!list?.some((t) => t.destinationId === destinationId);
}
