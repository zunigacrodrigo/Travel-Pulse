import { NextResponse } from "next/server";
import { computeDayPlan, dayInputSchema } from "@/lib/day/service";
import { apiError, engineNow, limitOr429, readJson } from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST /api/day-plan — arma «Mi día en la ciudad» con lugares, traslados y pronóstico reales. */
export async function POST(req: Request) {
  const limited = limitOr429(req, "day", 30);
  if (limited) return limited;
  const parsed = dayInputSchema.safeParse(await readJson(req));
  if (!parsed.success) return apiError(400, "PETICION_INVALIDA", parsed.error.issues[0]?.message ?? "Revisa los datos del día.");
  try {
    return NextResponse.json(await computeDayPlan(parsed.data, { now: engineNow() }));
  } catch (e) {
    console.error("day_plan_failed", e);
    return apiError(500, "ERROR_INTERNO", "No pudimos armar el día. Inténtalo de nuevo en un momento.");
  }
}
