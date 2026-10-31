import { NextResponse } from "next/server";
import { getRepository } from "@/lib/data";
import { rankDestinations } from "@/lib/engine";
import type { GlobeResponse } from "@/lib/types";
import { DEFAULT_REQUEST, apiError, engineNow } from "@/lib/server/http";

/** GET /api/globe?origin=SCL&month=11 — pines del globo con la oportunidad del mes. */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const origin = (sp.get("origin") ?? "SCL").toUpperCase();
  const month = Number(sp.get("month") ?? DEFAULT_REQUEST.month);
  if (!/^[A-Z]{3}$/.test(origin) || !Number.isInteger(month) || month < 1 || month > 12) {
    return apiError(400, "PETICION_INVALIDA", "Mes u origen no válido.");
  }
  const dataset = await getRepository().getDataset(origin, month);
  // Vista general sin intereses: presupuesto amplio para no ocultar destinos en el globo.
  const ranking = rankDestinations(
    { ...DEFAULT_REQUEST, origin, month, interests: [], budgetUsd: 2500 },
    dataset,
    engineNow(),
  );
  const byId = new Map(dataset.destinations.map((d) => [d.id, d]));
  const points = [...ranking.top, ...ranking.others].map((r) => {
    const d = byId.get(r.destinationId)!;
    return { id: d.id, name: d.name, lat: d.lat, lon: d.lon, score: r.score, band: r.confidenceBand };
  });
  const body: GlobeResponse = { month, points };
  return NextResponse.json(body, { headers: { "cache-control": "public, max-age=600" } });
}
