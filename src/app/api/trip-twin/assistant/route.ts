import { NextResponse } from "next/server";
import { assistantInputSchema, interpretTripTwinMessage, type AssistantInput } from "@/lib/trip-twin/assistant";
import { apiError, limitOr429, readJson } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const limited = limitOr429(request, "trip-twin-assistant", 10);
  if (limited) return limited;

  const parsed = assistantInputSchema.safeParse(await readJson(request));
  if (!parsed.success) return apiError(400, "PETICION_INVALIDA", "Revisa la pregunta y el itinerario actual.");
  if (parsed.data.plan.tripId !== parsed.data.trip.id) {
    return apiError(400, "PLAN_NO_COINCIDE", "El plan no corresponde a este viaje. Recarga Trip Twin y prueba de nuevo.");
  }

  try {
    const result = await interpretTripTwinMessage(parsed.data.message, parsed.data as unknown as Omit<AssistantInput, "message">);
    return NextResponse.json({ data: result });
  } catch (error) {
    console.error("trip_twin_assistant_failed", error);
    return apiError(503, "ASISTENTE_NO_DISPONIBLE", "No pude preparar la propuesta ahora. El itinerario no cambió; puedes usar los controles manuales.");
  }
}
