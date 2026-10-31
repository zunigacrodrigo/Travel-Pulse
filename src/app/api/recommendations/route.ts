import { NextResponse } from "next/server";
import { getRepository } from "@/lib/data";
import { rankDestinations } from "@/lib/engine";
import { writeVerdict } from "@/lib/ai";
import type { DestinationCard, RecommendationsResponse } from "@/lib/types";
import { apiError, engineNow, limitOr429, originSupported, readJson, tripRequestSchema } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** POST /api/recommendations — flujo de la sección 9: validar, guardar, calcular, redactar, revisar, guardar. */
export async function POST(req: Request) {
  const limited = limitOr429(req, "rec");
  if (limited) return limited;

  const parsed = tripRequestSchema.safeParse(await readJson(req));
  if (!parsed.success) return apiError(400, "PETICION_INVALIDA", "Revisa los datos del formulario.");
  const request = parsed.data;

  try {
    const repo = getRepository();
    const [dataset, requestId] = await Promise.all([
      repo.getDataset(request.origin, request.month),
      repo.saveTripRequest(request),
    ]);
    if (!originSupported(dataset, request.origin)) {
      return apiError(400, "ORIGEN_NO_CUBIERTO", "Por ahora solo calculamos viajes desde Santiago (SCL).");
    }
    const ranking = rankDestinations(request, dataset, engineNow());
    const byId = new Map(dataset.destinations.map((d) => [d.id, d]));

    const top: DestinationCard[] = await Promise.all(
      (ranking.emptyHelp ? [] : ranking.top).map(async (result) => {
        const destination = byId.get(result.destinationId)!;
        const verdict = await writeVerdict({ destination, result, request });
        return { destination, result, verdict };
      }),
    );

    await Promise.all([
      repo.saveRecommendations(requestId, ranking.top),
      repo.logEvent("recommendations_shown", { requestId, count: top.length, empty: top.length === 0 }),
    ]);

    const body: RecommendationsResponse = {
      requestId,
      request,
      top,
      emptyHelp: ranking.emptyHelp,
      computedAt: ranking.computedAt,
    };
    return NextResponse.json(body);
  } catch (e) {
    console.error("recommendations_failed", e);
    return apiError(503, "CALCULO_NO_DISPONIBLE", "No pudimos calcular esta búsqueda con los datos disponibles. Tu solicitud quedó guardada.");
  }
}
