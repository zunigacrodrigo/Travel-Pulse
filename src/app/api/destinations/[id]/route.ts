import { NextResponse } from "next/server";
import { getRepository } from "@/lib/data";
import { evaluateDestination, realityCheck } from "@/lib/engine";
import { explainReality, writeVerdict } from "@/lib/ai";
import type { DestinationDetailResponse } from "@/lib/types";
import { DEFAULT_REQUEST, apiError, decodeQuery, engineNow, limitOr429 } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** GET /api/destinations/[id]?q= — detalle con desglose, confianza y Reality Check. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const limited = limitOr429(req, "dest", 120);
  if (limited) return limited;
  const { id: rawId } = await ctx.params;
  const id = rawId.toUpperCase();
  if (!/^[A-Z]{3}$/.test(id)) return apiError(400, "DESTINO_INVALIDO", "Ese destino no existe.");

  const request = decodeQuery(new URL(req.url).searchParams.get("q")) ?? DEFAULT_REQUEST;
  const repo = getRepository();
  const [dataset, sources] = await Promise.all([repo.getDataset(request.origin, request.month), repo.getSources()]);
  const destination = dataset.destinations.find((d) => d.id === id);
  if (!destination) return apiError(404, "NO_ENCONTRADO", "No tenemos datos de ese destino.");

  const now = engineNow();
  const result = evaluateDestination(request, destination, dataset, now);
  const reality = realityCheck(request, id, dataset, now);
  const alternativeDestination = reality
    ? dataset.destinations.find((d) => d.id === reality.alternative.destinationId) ?? null
    : null;

  const [verdict, conclusionVerdict] = await Promise.all([
    writeVerdict({ destination, result, request }),
    reality && alternativeDestination ? explainReality(reality, destination, alternativeDestination) : Promise.resolve(null),
  ]);

  const body: DestinationDetailResponse = {
    card: { destination, result, verdict },
    reality:
      reality && alternativeDestination && conclusionVerdict
        ? { ...reality, alternativeDestination, conclusionVerdict }
        : null,
    sources,
  };
  return NextResponse.json(body);
}
