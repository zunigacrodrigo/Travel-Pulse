import { sameCity, signalStatus } from "./engine";
import type { TravelSignal } from "./types";

/**
 * Elige la señal comunitaria vigente más reciente de la ciudad de un viaje.
 * Solo considera reportes de viajeros (nunca ejemplos) y nunca modifica el plan:
 * el viajero decide después si prepara un ajuste.
 */
export function pickRelevantSignal(rows: unknown, destination: string, now = Date.now()): TravelSignal | null {
  if (!Array.isArray(rows)) return null;
  const city = destination.split(",")[0]?.trim() ?? "";
  if (!city) return null;
  const candidates = rows.filter((row): row is TravelSignal =>
    Boolean(row) && typeof row === "object" && (row as TravelSignal).source === "comunidad" &&
    typeof (row as TravelSignal).city === "string" && typeof (row as TravelSignal).title === "string" &&
    sameCity((row as TravelSignal).city, city) && signalStatus(row as TravelSignal, now) !== "caducada");
  candidates.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return candidates[0] ?? null;
}
