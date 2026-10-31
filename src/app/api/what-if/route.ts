import { NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/data";
import { whatIf } from "@/lib/engine/whatif";
import { apiError, engineNow, limitOr429, readJson, tripRequestSchema } from "@/lib/server/http";

export const dynamic = "force-dynamic";

const changeSchema = z
  .object({
    days: z.number().int().min(1).max(60),
    budgetUsd: z.number().int().min(100).max(100_000),
    month: z.number().int().min(1).max(12),
    travelers: z.number().int().min(1).max(12),
    flexibleDates: z.boolean(),
  })
  .partial()
  .strict();

const bodySchema = z.object({
  request: tripRequestSchema,
  destinationId: z.string().regex(/^[A-Za-z]{3}$/),
  change: changeSchema,
});

/** POST /api/what-if — Travel What-If: compara el plan con un escenario modificado. */
export async function POST(req: Request) {
  const limited = limitOr429(req, "whatif", 120);
  if (limited) return limited;
  const parsed = bodySchema.safeParse(await readJson(req));
  if (!parsed.success) return apiError(400, "PETICION_INVALIDA", "Revisa los datos del escenario.");
  const { request, change } = parsed.data;
  const destinationId = parsed.data.destinationId.toUpperCase();

  const repo = getRepository();
  const scenarioMonth = change.month ?? request.month;
  const [dataset, scenarioDataset] = await Promise.all([
    repo.getDataset(request.origin, request.month),
    scenarioMonth === request.month ? Promise.resolve(null) : repo.getDataset(request.origin, scenarioMonth),
  ]);
  if (!dataset.destinations.some((d) => d.id === destinationId)) {
    return apiError(404, "NO_ENCONTRADO", "No tenemos datos de ese destino.");
  }

  try {
    return NextResponse.json(whatIf(request, destinationId, change, dataset, engineNow(), scenarioDataset ?? dataset));
  } catch (e) {
    const message = e instanceof Error ? e.message : "No se pudo simular el escenario.";
    return apiError(422, "ESCENARIO_INVALIDO", message);
  }
}
