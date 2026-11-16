import { NextResponse } from "next/server";
import { z } from "zod";
import { fetchGuide, WIKIVOYAGE_TITLES } from "@/lib/context/guide";
import { apiError, engineNow, limitOr429 } from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

const querySchema = z.object({ city: z.string().refine((c) => c in WIKIVOYAGE_TITLES, "Ciudad no disponible.") });

/** GET /api/guia?city=santiago-cl — consejos prácticos citados de Wikivoyage, con enlace y licencia. */
export async function GET(req: Request) {
  const limited = limitOr429(req, "guia", 60);
  if (limited) return limited;
  const parsed = querySchema.safeParse({ city: new URL(req.url).searchParams.get("city") });
  if (!parsed.success) return apiError(400, "PETICION_INVALIDA", parsed.error.issues[0]?.message ?? "Revisa los datos.");
  try {
    const g = await fetchGuide(parsed.data.city, engineNow());
    return g ? NextResponse.json(g) : apiError(404, "NO_ENCONTRADO", "Ciudad no disponible.");
  } catch (e) {
    console.error("guia_failed", e);
    return apiError(502, "FUENTE_NO_DISPONIBLE", "Wikivoyage no respondió en este momento.");
  }
}
