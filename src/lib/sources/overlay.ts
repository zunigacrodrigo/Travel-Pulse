import type { Dataset } from "@/lib/types";
import { LIVE_SOURCES } from "./catalog";
import { advisoryReason, FCDO_SOURCE_ID } from "./fcdo";
import type { LiveSnapshot } from "./live";
import { type HazardNear, hazardsNear } from "./gdacs";
import { type Quake, type QuakesNear, quakesNear } from "./usgs";

/**
 * Superpone el nivel de riesgo oficial vivo sobre el dataset. No muta la
 * entrada. `observedAt` es el día en que CONSULTAMOS la fuente (la frescura
 * es "qué tan reciente es mi verificación"; un aviso sin cambios sigue vigente).
 * Países sin aviso obtenido conservan el dato de la semilla.
 */
export function applyLiveRisk(ds: Dataset, snap: LiveSnapshot | null): Dataset {
  if (!snap || Object.keys(snap.advisories).length === 0) return ds;
  const destinations = ds.destinations.map((d) => {
    const hit = snap.advisories[d.country];
    if (!hit) return d;
    const riskLevel = { value: hit.advisory.level, sourceId: FCDO_SOURCE_ID, observedAt: hit.checkedAt.slice(0, 10) };
    return { ...d, riskLevel, riskReasons: [advisoryReason(hit.advisory)] };
  });
  return { ...ds, destinations, sources: withLiveSources(ds.sources) };
}

export function withLiveSources<T extends { id: string }>(list: readonly T[]): T[] {
  const have = new Set(list.map((s) => s.id));
  return [...list, ...(LIVE_SOURCES.filter((s) => !have.has(s.id)) as unknown as T[])];
}

export interface DestinationLive {
  id: string;
  name: string;
  country: string;
  lat: number;
  lon: number;
  riskLevel: 1 | 2 | 3 | 4 | null;
  /** "live" si el nivel viene del aviso consultado; "seed" si es el dato de la semilla. */
  riskOrigin: "live" | "seed";
  riskObservedAt: string;
  advisoryUrl: string | null;
  advisoryUpdatedAt: string | null;
  quakes: QuakesNear;
  /** Eventos GDACS vigentes cerca del destino (ciclones, inundaciones, volcanes, incendios). */
  hazards: HazardNear[];
}

export function destinationsLive(ds: Dataset, snap: LiveSnapshot, now: Date): DestinationLive[] {
  return ds.destinations.map((d) => {
    const hit = snap.advisories[d.country];
    const live = hit !== undefined;
    return {
      id: d.id,
      name: d.name,
      country: d.country,
      lat: d.lat,
      lon: d.lon,
      riskLevel: live ? hit.advisory.level : d.riskLevel.value,
      riskOrigin: live ? "live" : "seed",
      riskObservedAt: live ? hit.checkedAt.slice(0, 10) : d.riskLevel.observedAt,
      advisoryUrl: live ? hit.advisory.url : null,
      advisoryUpdatedAt: live ? hit.advisory.updatedAt : null,
      quakes: quakesNear(snap.quakes, d.lat, d.lon, now),
      hazards: hazardsNear(snap.hazards, d.lat, d.lon, now),
    };
  });
}

/** Sismos recientes y relevantes para el mapa. */
export function notableQuakes(quakes: readonly Quake[], now: Date, minMag = 5.5, days = 14): Quake[] {
  const since = now.getTime() - days * 86_400_000;
  return quakes.filter((q) => q.mag >= minMag && Date.parse(q.time) >= since);
}
