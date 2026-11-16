/**
 * Cómo llegar en transporte público (Transitous: motor MOTIS sobre horarios GTFS abiertos; servicio comunitario).
 * Son horarios PROGRAMADOS, no tiempo real. Donde no hay cobertura (hoy Valparaíso y Antofagasta) devuelve null y la pantalla lo dice.
 */
import { fetchJson, type FetchOptions } from "@/lib/sources/http";

export interface TransitLeg { mode: "a_pie" | "metro" | "bus" | "tren" | "tranvia" | "otro"; line: string | null; agency: string | null; minutes: number; from: string | null; to: string | null; headsign: string | null }
export interface TransitOption { minutes: number; transfers: number; legs: TransitLeg[]; departs: string }

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const MODE: Record<string, TransitLeg["mode"]> = { WALK: "a_pie", SUBWAY: "metro", METRO: "metro", BUS: "bus", COACH: "bus", RAIL: "tren", REGIONAL_RAIL: "tren", REGIONAL_FAST_RAIL: "tren", SUBURBAN: "tren", TRAM: "tranvia" };

/** La opción más rápida que realmente usa transporte público; null si no hay ninguna. */
export function parseTransit(raw: unknown): TransitOption | null {
  if (!isRecord(raw) || !Array.isArray(raw.itineraries)) return null;
  let best: TransitOption | null = null;
  for (const it of raw.itineraries) {
    if (!isRecord(it) || !Array.isArray(it.legs) || typeof it.duration !== "number" || it.duration <= 0) continue;
    const legs: TransitLeg[] = [];
    for (const l of it.legs) {
      if (!isRecord(l) || typeof l.mode !== "string" || typeof l.duration !== "number") continue;
      const mode = MODE[l.mode] ?? "otro";
      const minutes = Math.round(l.duration / 60);
      if (mode === "a_pie" && minutes === 0) continue;
      legs.push({ mode, minutes, line: str(l.routeShortName) ?? str(l.displayName), agency: str(l.agencyName), headsign: str(l.headsign), from: isRecord(l.from) ? str(l.from.name) : null, to: isRecord(l.to) ? str(l.to.name) : null });
    }
    if (!legs.some((x) => x.mode !== "a_pie")) continue; // solo caminata no es «transporte público»
    const opt: TransitOption = { minutes: Math.round(it.duration / 60), transfers: typeof it.transfers === "number" ? it.transfers : Math.max(0, legs.filter((x) => x.mode !== "a_pie").length - 1), legs, departs: str(it.startTime) ?? "" };
    if (!best || opt.minutes < best.minutes) best = opt;
  }
  return best;
}

export function describeTransit(o: TransitOption): string {
  const MODE_TXT: Record<TransitLeg["mode"], string> = { a_pie: "camina", metro: "Metro", bus: "Bus", tren: "Tren", tranvia: "Tranvía", otro: "Transporte" };
  return o.legs.map((l) => (l.mode === "a_pie" ? `camina ${l.minutes} min` : `${MODE_TXT[l.mode]}${l.line ? ` ${l.line}` : ""}${l.from && l.to ? ` de ${l.from} a ${l.to}` : ""} (${l.minutes} min)`)).join(" → ");
}

export interface LatLon { lat: number; lon: number }

/** Nunca lanza: si la fuente falla o no hay cobertura, null. */
export async function fetchTransit(from: LatLon, to: LatLon, departIso: string, opts: FetchOptions & { base?: string } = {}): Promise<TransitOption | null> {
  const { base = "https://api.transitous.org", ...rest } = opts;
  const q = new URLSearchParams({ fromPlace: `${from.lat},${from.lon}`, toPlace: `${to.lat},${to.lon}`, time: departIso, numItineraries: "3" });
  try { return parseTransit(await fetchJson(`${base}/api/v5/plan?${q}`, { timeoutMs: 9000, ...rest })); } catch { return null; }
}
