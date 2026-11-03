import { NextResponse } from "next/server";
import { computeVerification, verifyInputSchema } from "@/lib/verify/service";
import { apiError, engineNow, limitOr429, readJson } from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST /api/verify-plan — contrasta un itinerario pegado con horarios, traslados y clima reales. */
export async function POST(req: Request) {
  const limited = limitOr429(req, "verify", 10);
  if (limited) return limited;
  const parsed = verifyInputSchema.safeParse(await readJson(req));
  if (!parsed.success) return apiError(400, "PETICION_INVALIDA", parsed.error.issues[0]?.message ?? "Revisa los datos.");
  try {
    return NextResponse.json(await computeVerification(parsed.data, { now: engineNow() }));
  } catch (e) {
    console.error("verify_failed", e);
    return apiError(500, "ERROR_INTERNO", "No pudimos verificar el itinerario. Inténtalo de nuevo.");
  }
}
