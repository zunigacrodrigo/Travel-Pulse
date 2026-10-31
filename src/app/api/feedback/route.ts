import { NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/data";
import { aggregateGap, expectationGap } from "@/lib/engine";
import type { FeedbackResponse } from "@/lib/types";
import { apiError, limitOr429, readJson } from "@/lib/server/http";

export const dynamic = "force-dynamic";
const rating = z.number().int().min(1).max(10);
const ratings = z.object({ autenticidad: rating, saturacion: rating, costo: rating, seguridad: rating, comida: rating });
const id = z.string().regex(/^[A-Za-z]{3}$/).transform((s) => s.toUpperCase());
const bodySchema = z.discriminatedUnion("moment", [
  z.object({ moment: z.literal("before"), destinationId: id, ratings }),
  z.object({
    moment: z.literal("during"),
    destinationId: id,
    signal: z.object({
      ambiente: z.enum(["tranquilo", "animado", "tenso"]),
      afluencia: z.enum(["vacio", "normal", "lleno"]),
      precio: z.enum(["barato", "normal", "caro"]),
    }),
  }),
  z.object({
    moment: z.literal("after"),
    destinationId: id,
    ratings,
    expected: ratings.optional(),
    phrase: z.string().trim().max(280).optional(),
  }),
]);

/** POST /api/feedback — Founding Explorers antes, durante y después (funciones 13 y 14). */
export async function POST(req: Request) {
  const limited = limitOr429(req, "fb", 60);
  if (limited) return limited;
  const parsed = bodySchema.safeParse(await readJson(req));
  if (!parsed.success) return apiError(400, "PETICION_INVALIDA", "Revisa tus respuestas: cada valor va de 1 a 10.");
  const body = parsed.data;
  const repo = getRepository();
  if (!(await repo.getDestination(body.destinationId))) return apiError(404, "NO_ENCONTRADO", "Destino desconocido.");

  let gap: FeedbackResponse["gap"] = null;
  if (body.moment === "before") {
    await repo.saveExpectation({ destinationId: body.destinationId, ratings: body.ratings });
  } else if (body.moment === "during") {
    await repo.saveDuringSignal({ destinationId: body.destinationId, signal: body.signal });
  } else {
    await repo.saveExperience({
      destinationId: body.destinationId,
      ratings: body.ratings,
      expected: body.expected,
      phrase: body.phrase,
    });
    if (body.expected) gap = expectationGap(body.expected, body.ratings);
  }
  await repo.logEvent(`feedback_${body.moment}`, { destinationId: body.destinationId });

  const destinationGap = aggregateGap(await repo.getGapsForDestination(body.destinationId));
  const res: FeedbackResponse = { ok: true, gap, destinationGap };
  return NextResponse.json(res);
}
