import { NextResponse } from "next/server";
import { computeReviewData, reviewInputSchema } from "@/lib/day/refresh";
import { apiError, engineNow, limitOr429, readJson } from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** POST /api/trip-review — vuelve a consultar horarios (OpenStreetMap) y pronóstico (Open-Meteo) de un viaje armado en Mi día. */
export async function POST(req: Request) {
  const limited = limitOr429(req, "trip-review", 20);
  if (limited) return limited;
  const parsed = reviewInputSchema.safeParse(await readJson(req));
  if (!parsed.success) return apiError(400, "PETICION_INVALIDA", parsed.error.issues[0]?.message ?? "Revisa los datos.");
  try {
    return NextResponse.json(await computeReviewData(parsed.data, { now: engineNow() }));
  } catch (e) {
    console.error("trip_review_failed", e);
    return apiError(500, "ERROR_INTERNO", "No pudimos revisar el viaje. Inténtalo de nuevo en un momento.");
  }
}
