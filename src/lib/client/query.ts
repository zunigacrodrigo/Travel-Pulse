import { INTERESTS, type Interest, type TripRequest } from "@/lib/types";

export const DEFAULT_REQUEST: TripRequest = {
  origin: "SCL",
  budgetUsd: 1500,
  days: 8,
  month: 11,
  flexibleDates: true,
  travelers: 1,
  interests: ["aventura"],
};

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(b64url: string): string {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function clampInt(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** Valida y normaliza un valor desconocido como TripRequest. Devuelve null si no corresponde. */
export function validateRequest(value: unknown): TripRequest | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.origin !== "string" || !/^[A-Za-z]{3}$/.test(v.origin)) return null;
  if (typeof v.budgetUsd !== "number" || !Number.isFinite(v.budgetUsd)) return null;
  if (typeof v.days !== "number" || !Number.isFinite(v.days)) return null;
  if (typeof v.month !== "number" || !Number.isFinite(v.month)) return null;
  if (typeof v.travelers !== "number" || !Number.isFinite(v.travelers)) return null;
  if (typeof v.flexibleDates !== "boolean") return null;
  if (!Array.isArray(v.interests)) return null;
  const interests = Array.from(
    new Set(v.interests.filter((i): i is Interest => typeof i === "string" && (INTERESTS as readonly string[]).includes(i))),
  );
  return {
    origin: v.origin.toUpperCase(),
    budgetUsd: clampInt(v.budgetUsd, 1, 1_000_000),
    days: clampInt(v.days, 1, 60),
    month: clampInt(v.month, 1, 12),
    flexibleDates: v.flexibleDates,
    travelers: clampInt(v.travelers, 1, 12),
    interests,
  };
}

/** TripRequest -> base64url(JSON). Seguro para usar en la URL. */
export function encodeRequest(request: TripRequest): string {
  return toBase64Url(JSON.stringify(request));
}

/** base64url(JSON) -> TripRequest validado, o null si falta o es inválido. */
export function decodeRequest(q: string | null | undefined): TripRequest | null {
  if (!q) return null;
  try {
    return validateRequest(JSON.parse(fromBase64Url(q)));
  } catch {
    return null;
  }
}

/** Decodifica q y, si no sirve, devuelve la petición por defecto. */
export function parseRequest(q: string | null | undefined): TripRequest {
  return decodeRequest(q) ?? DEFAULT_REQUEST;
}

const LAST_KEY = "tp-last-request";

export function storeLastRequest(request: TripRequest): void {
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify(request));
  } catch {
    /* sin almacenamiento: no pasa nada */
  }
}

export function loadLastRequest(): TripRequest | null {
  try {
    const raw = localStorage.getItem(LAST_KEY);
    return raw ? validateRequest(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/** Primer valor de un parámetro de búsqueda de Next (string | string[] | undefined). */
export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
