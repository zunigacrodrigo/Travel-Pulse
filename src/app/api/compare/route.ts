import { NextResponse } from "next/server";
import { getRepository } from "@/lib/data";
import { compareDestinations } from "@/lib/engine";
import type { ComparePriority, CompareResponse } from "@/lib/types";
import { DEFAULT_REQUEST, apiError, decodeQuery, engineNow, limitOr429 } from "@/lib/server/http";

export const dynamic = "force-dynamic";
const PRIORITIES: ComparePriority[] = ["precio", "experiencia", "menos_gente"];

/** GET /api/compare?a=&b=&priority=&q= — dos destinos lado a lado (función 8). */
export async function GET(req: Request) {
  const limited = limitOr429(req, "cmp", 120);
  if (limited) return limited;
  const sp = new URL(req.url).searchParams;
  const a = (sp.get("a") ?? "").toUpperCase();
  const b = (sp.get("b") ?? "").toUpperCase();
  const priority = (sp.get("priority") ?? "precio") as ComparePriority;
  if (!/^[A-Z]{3}$/.test(a) || !/^[A-Z]{3}$/.test(b) || a === b) {
    return apiError(400, "COMPARACION_INVALIDA", "Elige dos destinos distintos.");
  }
  if (!PRIORITIES.includes(priority)) return apiError(400, "PRIORIDAD_INVALIDA", "Prioridad no reconocida.");

  const request = decodeQuery(sp.get("q")) ?? DEFAULT_REQUEST;
  const dataset = await getRepository().getDataset(request.origin, request.month);
  const da = dataset.destinations.find((d) => d.id === a);
  const db = dataset.destinations.find((d) => d.id === b);
  if (!da || !db) return apiError(404, "NO_ENCONTRADO", "No tenemos datos de uno de los destinos.");

  const compare = compareDestinations(request, a, b, priority, dataset, engineNow());
  const body: CompareResponse = { a: da, b: db, compare };
  return NextResponse.json(body);
}
