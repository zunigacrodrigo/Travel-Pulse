import { NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/data";
import { surprise } from "@/lib/engine";
import { writeVerdict } from "@/lib/ai";
import type { SurpriseResponse } from "@/lib/types";
import { apiError, engineNow, limitOr429, readJson, tripRequestSchema } from "@/lib/server/http";

export const dynamic = "force-dynamic";
const bodySchema = z.object({
  request: tripRequestSchema,
  exclude: z.array(z.string().regex(/^[A-Za-z]{3}$/)).max(40).default([]),
});

/** POST /api/surprise — Send Me Somewhere (función 9). */
export async function POST(req: Request) {
  const limited = limitOr429(req, "surprise", 60);
  if (limited) return limited;
  const parsed = bodySchema.safeParse(await readJson(req));
  if (!parsed.success) return apiError(400, "PETICION_INVALIDA", "Revisa los datos de tu búsqueda.");
  const { request, exclude } = parsed.data;

  const repo = getRepository();
  const dataset = await repo.getDataset(request.origin, request.month);
  const seed = Math.floor(Math.random() * 1_000_000);
  const pick = surprise(request, dataset, engineNow(), exclude.map((e) => e.toUpperCase()), seed);
  if (!pick) {
    const body: SurpriseResponse = { card: null, warning: null };
    return NextResponse.json(body);
  }
  const destination = dataset.destinations.find((d) => d.id === pick.result.destinationId)!;
  const verdict = await writeVerdict({ destination, result: pick.result, request });
  await repo.logEvent("surprise_shown", { destinationId: destination.id });
  const body: SurpriseResponse = { card: { destination, result: pick.result, verdict }, warning: pick.warning };
  return NextResponse.json(body);
}
