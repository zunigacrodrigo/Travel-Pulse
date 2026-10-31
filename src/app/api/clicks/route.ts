import { NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/data";
import type { ClickResponse } from "@/lib/types";
import { apiError, clientIp, limitOr429, readJson } from "@/lib/server/http";

export const dynamic = "force-dynamic";
const bodySchema = z.object({
  destinationId: z.string().regex(/^[A-Za-z]{3}$/),
  kind: z.enum(["flight", "hotel"]),
  requestId: z.string().max(64).optional(),
});

/**
 * POST /api/clicks — clic de salida a afiliado (función 12). Registra el clic y devuelve la URL.
 * La URL se arma en servidor a partir de un destino conocido (no hay redirección abierta).
 */
export async function POST(req: Request) {
  const limited = limitOr429(req, "click", 120);
  if (limited) return limited;
  const parsed = bodySchema.safeParse(await readJson(req));
  if (!parsed.success) return apiError(400, "PETICION_INVALIDA", "Clic no válido.");
  const { kind, requestId } = parsed.data;
  const destinationId = parsed.data.destinationId.toUpperCase();

  const repo = getRepository();
  const destination = await repo.getDestination(destinationId);
  if (!destination) return apiError(404, "NO_ENCONTRADO", "Destino desconocido.");

  const url = affiliateUrl(kind, destination.id, `${destination.name}, ${destination.country}`);
  await repo.logOutboundClick({ destinationId, kind, url, requestId: requestId ?? null, ip: clientIp(req) });
  const body: ClickResponse = { url };
  return NextResponse.json(body);
}

function affiliateUrl(kind: "flight" | "hotel", iata: string, place: string): string {
  if (kind === "flight") {
    const marker = process.env.AFFILIATE_FLIGHTS_MARKER;
    const u = new URL("https://www.aviasales.com/search");
    u.searchParams.set("origin_iata", "SCL");
    u.searchParams.set("destination_iata", iata);
    if (marker) u.searchParams.set("marker", marker);
    return u.toString();
  }
  const aid = process.env.AFFILIATE_BOOKING_AID;
  const u = new URL("https://www.booking.com/searchresults.html");
  u.searchParams.set("ss", place);
  if (aid) u.searchParams.set("aid", aid);
  return u.toString();
}
