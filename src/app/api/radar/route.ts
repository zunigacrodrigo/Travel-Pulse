import { NextResponse } from "next/server";
import { getRepository } from "@/lib/data";
import { apiError, engineNow, limitOr429 } from "@/lib/server/http";
import { destinationsLive, getLiveSources, liveEnabled, notableQuakes, withLiveSources } from "@/lib/sources";

export const dynamic = "force-dynamic";

/**
 * GET /api/radar — estado de riesgo oficial vivo + sismos recientes por destino.
 * Espera la actualización (con tiempos máximos) para que el Radar muestre el dato más reciente;
 * si las fuentes no responden, devuelve lo último bueno o declara "unavailable".
 */
export async function GET(req: Request) {
  const limited = limitOr429(req, "radar", 60);
  if (limited) return limited;
  const now = engineNow();
  try {
    const enabled = liveEnabled();
    const live = getLiveSources();
    const snap = enabled ? await live.refresh() : live.peek();
    const ds = await getRepository().getDataset("SCL", now.getUTCMonth() + 1);
    return NextResponse.json({
      generatedAt: now.toISOString(),
      liveEnabled: enabled,
      status: snap.status,
      destinations: destinationsLive(ds, snap, now),
      notableQuakes: notableQuakes(snap.quakes, now).slice(0, 40),
      sources: withLiveSources(ds.sources).filter((s) => s.id === "fcdo" || s.id === "usgs" || s.id === "gdacs"),
    });
  } catch {
    return apiError(500, "ERROR_INTERNO", "No se pudo preparar el Radar.");
  }
}
