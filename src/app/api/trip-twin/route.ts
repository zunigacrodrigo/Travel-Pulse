import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { buildTripPlan, replanTrip } from "@/lib/trip-twin/engine";
import { planRequestSchema } from "@/lib/trip-twin/types";

/**
 * POST /api/trip-twin
 * Prototipo stateless: calcula un plan o una alternativa, pero no persiste viajes.
 * Las integraciones reales de mapas/rutas y autenticación se incorporarán después.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { code: "INVALID_JSON", message: "El cuerpo debe ser JSON válido." } }, { status: 400 });
  }

  const parsed = planRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "La solicitud no cumple el contrato.", issues: parsed.error.issues } }, { status: 400 });
  }

  try {
    const input = parsed.data;
    const now = input.now ?? new Date().toISOString();
    if (input.change) {
      if (!input.basePlan) {
        return NextResponse.json({ error: { code: "BASE_PLAN_REQUIRED", message: "Para replanificar debes enviar basePlan." } }, { status: 400 });
      }
      const result = replanTrip(input.trip, input.activities, input.basePlan, input.change, now);
      return NextResponse.json({ data: result });
    }
    return NextResponse.json({ data: { plan: buildTripPlan(input.trip, input.activities, { now }) } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo procesar el itinerario.";
    const status = error instanceof ZodError ? 400 : 422;
    return NextResponse.json({ error: { code: "TRIP_TWIN_ERROR", message } }, { status });
  }
}
