import { NextResponse } from "next/server";
import { z } from "zod";
import { CITIES } from "@/lib/day/cities";
import { computeDayContext } from "@/lib/context/service";
import { apiError, engineNow, limitOr429 } from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

const querySchema = z.object({
  city: z.string().refine((c) => c in CITIES, "Ciudad no disponible."),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (AAAA-MM-DD).").refine((d) => !Number.isNaN(Date.parse(`${d}T12:00:00Z`)), "Fecha inválida."),
});

/** GET /api/contexto?city=santiago-cl&date=2026-11-18 — feriados, aire y UV del día, cada uno con su fuente; lo que no se pudo consultar se informa. */
export async function GET(req: Request) {
  const limited = limitOr429(req, "contexto", 60);
  if (limited) return limited;
  const sp = new URL(req.url).searchParams;
  const parsed = querySchema.safeParse({ city: sp.get("city"), date: sp.get("date") });
  if (!parsed.success) return apiError(400, "PETICION_INVALIDA", parsed.error.issues[0]?.message ?? "Revisa los datos.");
  try {
    const ctx = await computeDayContext(parsed.data.city, parsed.data.date, { now: engineNow() });
    return ctx ? NextResponse.json(ctx) : apiError(404, "NO_ENCONTRADO", "Ciudad no disponible.");
  } catch (e) {
    console.error("contexto_failed", e);
    return apiError(500, "ERROR_INTERNO", "No pudimos consultar el contexto del día.");
  }
}
