/**
 * Puente Mi día → Mi viaje. Convierte un día armado (paradas reales, horarios de OpenStreetMap, traslados de OSRM)
 * en un viaje de Trip Twin, donde la persona puede mover, cancelar, retrasar y deshacer.
 *
 * Reglas:
 *  - Solo pasa lo que Mi día ya sabe, con su fuente y fecha de consulta. Precios: desconocidos, nunca inventados.
 *  - Las horas del plan se conservan: una parada lleva «no antes de» solo cuando algo real la retrasó
 *    (hora de apertura, hora habitual del tipo de lugar, traslado desconocido o salida desde el punto de partida).
 *  - Ninguna parada queda como horario fijo: la persona puede moverlas todas.
 */
import { PILOT_CITIES } from "@/lib/pulsemesh/model";
import { NO_BUDGET, zonedIso } from "@/lib/trip-twin/import";
import { activitySchema, tripSchema, type Activity, type Evidence, type Trip } from "@/lib/trip-twin/types";
import { KIND_META } from "./places";
import { weekdayOf, windowsOn } from "./openingHours";
import type { DayResponse } from "./service";

const unknown: Evidence = { status: "unknown", sourceId: null, observedAt: null, expiresAt: null };

export function dayToTrip(day: DayResponse): { trip: Trip; activities: Activity[] } {
  const stops = day.plan.stops;
  if (stops.length === 0) throw new Error("El día está sin paradas: no hay nada que guardar en Mi viaje.");
  const tz = day.city.timezone;
  const at = (min: number) => zonedIso(day.date, min, tz);
  const currency = PILOT_CITIES.find((c) => c.key === day.city.key)?.currency ?? "USD";
  const wd = weekdayOf(day.date);

  const trip = tripSchema.parse({
    id: `dia-${day.city.key}-${day.date}`,
    destination: `${day.city.name}, ${day.city.country}`,
    startAt: at(day.startMin),
    endAt: at(day.endMin),
    timeZone: tz,
    budget: { amount: NO_BUDGET, currency },
    travelers: 1,
  });

  let prevEnd = day.startMin;
  const activities = stops.map((s, i): Activity => {
    const travelMin = s.travel?.minutes ?? null;
    const place = s.place;
    // Sin una hora mínima, el motor de Trip Twin llegaría antes que Mi día (no suma traslado inicial ni esperas).
    const arrival = prevEnd + (i === 0 ? 0 : (travelMin ?? 0));
    const needsNotBefore = i === 0 || s.startMin > arrival;
    const windows = place.hours ? windowsOn(place.hours, wd) : [];
    prevEnd = s.endMin;
    return activitySchema.parse({
      id: `dia-${place.id.replace(/[^A-Za-z0-9_-]/g, "-")}`,
      name: place.name,
      category: KIND_META[place.kind].label,
      location: { latitude: place.lat, longitude: place.lon, placeId: place.id },
      durationMinutes: s.endMin - s.startMin,
      importance: "normal",
      ...(needsNotBefore ? { startNotBefore: at(s.startMin) } : {}),
      ...(windows.length ? { openingHours: windows.map((w) => ({ start: at(w.start), end: at(w.end) })) } : {}),
      cost: { amount: null, currency, basis: "unknown" },
      travelMinutesFromPrevious: i === 0 ? null : travelMin,
      travelEvidence: i > 0 && s.travel ? { status: "verified", sourceId: "osrm-fossgis", observedAt: day.generatedAt, expiresAt: null } : unknown,
      hoursEvidence: place.hours ? { status: "verified", sourceId: "openstreetmap", observedAt: day.generatedAt, expiresAt: null } : unknown,
      costEvidence: unknown,
      demoData: false,
    });
  });
  return { trip, activities };
}
