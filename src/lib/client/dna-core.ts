/**
 * Travel DNA (Módulo 8 del prompt maestro): el perfil de preferencias del viajero.
 *
 * Principios:
 *  - Solo contiene preferencias que el viajero declara. Nunca se infieren rasgos
 *    personales ni sensibles.
 *  - Vive en el dispositivo (ver `dna.ts`); el usuario puede revisarlo, corregirlo,
 *    exportarlo y borrarlo.
 *  - Las sugerencias a partir de sus viajes guardados son opcionales: el viajero
 *    decide si las agrega.
 *
 * Este archivo es puro (sin DOM ni localStorage) para poder probarlo.
 */
import { INTERESTS, type Interest, type TripRequest } from "@/lib/types";

export const DNA_VERSION = 1;
export const PACES = ["tranquilo", "equilibrado", "intenso"] as const;
export type Pace = (typeof PACES)[number];

export const PACE_LABELS: Record<Pace, string> = {
  tranquilo: "Tranquilo",
  equilibrado: "Equilibrado",
  intenso: "Intenso",
};

export interface TravelDna {
  version: typeof DNA_VERSION;
  /** ISO 8601 de la última edición del viajero. */
  updatedAt: string;
  /** Código IATA de salida habitual. */
  origin: string;
  budgetUsd: number;
  days: number;
  travelers: number;
  flexibleDates: boolean;
  interests: Interest[];
  pace: Pace | null;
}

const clampInt = (n: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(n)));

/** Perfil inicial con los mismos valores por defecto de la búsqueda. */
export function defaultDna(now: Date): TravelDna {
  return {
    version: DNA_VERSION,
    updatedAt: now.toISOString(),
    origin: "SCL",
    budgetUsd: 1500,
    days: 8,
    travelers: 1,
    flexibleDates: true,
    interests: [],
    pace: null,
  };
}

/**
 * Valida un valor desconocido (p. ej. leído de localStorage o de un archivo
 * importado). Devuelve null si no es un perfil reconocible; descarta campos
 * desconocidos y acota los números.
 */
export function validateDna(raw: unknown): TravelDna | null {
  if (typeof raw !== "object" || raw === null) return null;
  const v = raw as Record<string, unknown>;
  if (v.version !== DNA_VERSION) return null;
  if (typeof v.origin !== "string" || !/^[A-Za-z]{3}$/.test(v.origin)) return null;
  if (typeof v.budgetUsd !== "number" || !Number.isFinite(v.budgetUsd)) return null;
  if (typeof v.days !== "number" || !Number.isFinite(v.days)) return null;
  if (typeof v.travelers !== "number" || !Number.isFinite(v.travelers)) return null;
  if (typeof v.flexibleDates !== "boolean") return null;
  if (!Array.isArray(v.interests)) return null;
  const interests = Array.from(
    new Set(v.interests.filter((i): i is Interest => typeof i === "string" && (INTERESTS as readonly string[]).includes(i))),
  );
  const pace = typeof v.pace === "string" && (PACES as readonly string[]).includes(v.pace) ? (v.pace as Pace) : null;
  const updatedAt =
    typeof v.updatedAt === "string" && !Number.isNaN(Date.parse(v.updatedAt)) ? v.updatedAt : new Date(0).toISOString();
  return {
    version: DNA_VERSION,
    updatedAt,
    origin: v.origin.toUpperCase(),
    budgetUsd: clampInt(v.budgetUsd, 100, 100_000),
    days: clampInt(v.days, 1, 60),
    travelers: clampInt(v.travelers, 1, 12),
    flexibleDates: v.flexibleDates,
    interests,
    pace,
  };
}

/** Convierte el perfil en una búsqueda. El mes no es una preferencia: lo aporta quien llama. */
export function dnaToRequest(dna: TravelDna, month: number): TripRequest {
  return {
    origin: dna.origin,
    budgetUsd: dna.budgetUsd,
    days: dna.days,
    month: clampInt(month, 1, 12),
    flexibleDates: dna.flexibleDates,
    travelers: dna.travelers,
    interests: [...dna.interests],
  };
}

/** Intereses que aparecen en al menos `minTrips` viajes guardados y aún no están en el perfil. */
export interface InterestSuggestion {
  interest: Interest;
  /** En cuántos viajes guardados aparece. */
  trips: number;
}

export function suggestInterests(
  saved: ReadonlyArray<{ request: { interests: readonly Interest[] } }>,
  dna: Pick<TravelDna, "interests"> | null,
  minTrips = 2,
): InterestSuggestion[] {
  const known = new Set(dna?.interests ?? []);
  const counts = new Map<Interest, number>();
  for (const trip of saved) {
    for (const interest of new Set(trip.request.interests)) counts.set(interest, (counts.get(interest) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([interest, trips]) => trips >= minTrips && !known.has(interest))
    .map(([interest, trips]) => ({ interest, trips }))
    .sort((a, b) => b.trips - a.trips || INTERESTS.indexOf(a.interest) - INTERESTS.indexOf(b.interest));
}

/** Contenido del archivo de exportación (el viajero puede llevarse sus datos). */
export function exportDna(dna: TravelDna): string {
  return JSON.stringify(dna, null, 2);
}
