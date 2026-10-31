import { NextResponse } from "next/server";
import { z } from "zod";
import { INTERESTS, type TripRequest } from "@/lib/types";

/** Esquema de servidor para TripRequest (sección 9: el formulario se valida en servidor). */
export const tripRequestSchema = z.object({
  origin: z.string().regex(/^[A-Za-z]{3}$/).transform((s) => s.toUpperCase()),
  budgetUsd: z.number().int().min(100).max(100_000),
  days: z.number().int().min(1).max(60),
  month: z.number().int().min(1).max(12),
  flexibleDates: z.boolean(),
  travelers: z.number().int().min(1).max(12),
  interests: z.array(z.enum(INTERESTS)).max(INTERESTS.length).transform((a) => Array.from(new Set(a))),
});

export const DEFAULT_REQUEST: TripRequest = {
  origin: "SCL",
  budgetUsd: 1500,
  days: 8,
  month: 11,
  flexibleDates: false,
  travelers: 1,
  interests: ["aventura"],
};

export function apiError(status: number, code: string, message: string, headers?: HeadersInit) {
  return NextResponse.json({ error: { code, message } }, { status, headers });
}

/** Decodifica ?q= (base64url de un TripRequest). Devuelve null si es inválido. */
export function decodeQuery(q: string | null): TripRequest | null {
  if (!q) return null;
  try {
    const json = JSON.parse(Buffer.from(q, "base64url").toString("utf8"));
    const parsed = tripRequestSchema.safeParse(json);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return undefined;
  }
}

/**
 * IP del cliente para el límite de tasa. Se usa la ÚLTIMA entrada de X-Forwarded-For
 * (la agrega el proxy de la plataforma, no el cliente), así que rotar la cabecera no
 * crea cubetas nuevas. x-real-ip tiene prioridad cuando la plataforma la define.
 */
export function clientIp(req: Request): string | null {
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const parts = fwd.split(",").map((p) => p.trim()).filter(Boolean);
    return parts[parts.length - 1] ?? null;
  }
  return null;
}

/**
 * Fecha de cálculo. TP_NOW permite fijarla en pruebas; en ejecución normal usamos el reloj real,
 * también cuando el dataset es una semilla local, para que los datos antiguos no parezcan frescos.
 */
export function engineNow(): Date {
  const fixed = process.env.TP_NOW;
  if (fixed) return new Date(fixed);
  return new Date();
}

/* ---------------- Límite de tasa (sección 9: 20 consultas por hora por IP) ---------------- */

const WINDOW_MS = 60 * 60 * 1000;
const buckets = new Map<string, number[]>();

export function rateLimit(key: string, limit: number): { ok: boolean; retryAfterS: number } {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (hits.length >= limit) {
    const retryAfterS = Math.ceil((WINDOW_MS - (now - hits[0]!)) / 1000);
    buckets.set(key, hits);
    return { ok: false, retryAfterS };
  }
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 10_000) buckets.clear();
  return { ok: true, retryAfterS: 0 };
}

export function limitOr429(req: Request, scope: string, limit = Number(process.env.RATE_LIMIT_PER_HOUR ?? 20)) {
  if (process.env.RATE_LIMIT_DISABLED === "1") return null;
  const ip = clientIp(req) ?? "anon";
  const r = rateLimit(`${scope}:${ip}`, limit);
  if (r.ok) return null;
  const minutes = Math.max(1, Math.ceil(r.retryAfterS / 60));
  return apiError(429, "LIMITE", `Hiciste muchas consultas seguidas. Prueba de nuevo en ${minutes} min.`, {
    "retry-after": String(r.retryAfterS),
  });
}

/** Orígenes con datos de conectividad en el dataset (V1: Santiago). */
export function originSupported(dataset: { destinations: Array<{ connectivity: Record<string, unknown> }> }, origin: string) {
  return dataset.destinations.some((d) => origin in d.connectivity);
}
