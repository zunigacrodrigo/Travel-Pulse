import { CITIES } from "@/lib/day/cities";
import { describeError, type FetchOptions } from "@/lib/sources/http";
import { fetchHeritage, type HeritageResult } from "./heritage";
import { fetchNature, type NatureResult } from "./nature";
import type { SourceGap } from "./types";

export interface Entorno { cityKey: string; heritage: HeritageResult | null; nature: NatureResult | null; gaps: SourceGap[] }

/** Patrimonio y naturaleza del destino. Cada fuente falla por separado y se informa. */
export async function computeEntorno(cityKey: string, deps: { now?: Date; fetchImpl?: FetchOptions["fetchImpl"] } = {}): Promise<Entorno | null> {
  const city = CITIES[cityKey];
  if (!city) return null;
  const now = deps.now ?? new Date();
  const opts: FetchOptions = deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {};
  const [h, n] = await Promise.allSettled([
    fetchHeritage(cityKey, city.center.lat, city.center.lon, now, opts),
    fetchNature(cityKey, city.center.lat, city.center.lon, now, opts),
  ]);
  const gaps: SourceGap[] = [];
  if (h.status === "rejected") gaps.push({ source: "Patrimonio (Wikidata)", reason: describeError(h.reason) });
  if (n.status === "rejected") gaps.push({ source: "Aves (GBIF)", reason: describeError(n.reason) });
  return { cityKey, heritage: h.status === "fulfilled" ? h.value : null, nature: n.status === "fulfilled" ? n.value : null, gaps };
}
