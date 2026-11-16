import { NextResponse } from "next/server";
import { z } from "zod";
import { CITIES } from "@/lib/day/cities";
import { computeEntorno } from "@/lib/context/entorno";
import { apiError, engineNow, limitOr429 } from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const querySchema = z.object({ city: z.string().refine((c) => c in CITIES, "Ciudad no disponible.") });

/** GET /api/entorno?city=santiago-cl — patrimonio protegido (Wikidata) y aves más registradas (GBIF) cerca del centro. */
export async function GET(req: Request) {
  const limited = limitOr429(req, "entorno", 60);
  if (limited) return limited;
  const parsed = querySchema.safeParse({ city: new URL(req.url).searchParams.get("city") });
  if (!parsed.success) return apiError(400, "PETICION_INVALIDA", parsed.error.issues[0]?.message ?? "Revisa los datos.");
  try {
    const e = await computeEntorno(parsed.data.city, { now: engineNow() });
    return e ? NextResponse.json(e) : apiError(404, "NO_ENCONTRADO", "Ciudad no disponible.");
  } catch (e) {
    console.error("entorno_failed", e);
    return apiError(500, "ERROR_INTERNO", "No pudimos consultar el entorno del destino.");
  }
}
