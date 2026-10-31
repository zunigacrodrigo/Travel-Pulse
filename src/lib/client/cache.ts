import type { RecommendationsResponse } from "@/lib/types";

const KEY = "tp-last-results";

/** Guarda el último Top 5 para ofrecerlo si falla la próxima consulta. */
export function cacheResults(response: RecommendationsResponse): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(response));
  } catch {
    /* ignorar */
  }
}

export function loadCachedResults(): RecommendationsResponse | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RecommendationsResponse;
    return Array.isArray(parsed?.top) && parsed.top.length > 0 && typeof parsed.computedAt === "string" ? parsed : null;
  } catch {
    return null;
  }
}

const RID_KEY = "tp-request-id";

/** Guarda el requestId de la última búsqueda (sessionStorage) para atribuir los clics. */
export function storeRequestId(id: string): void {
  try {
    sessionStorage.setItem(RID_KEY, id);
  } catch {
    /* ignorar */
  }
}

export function loadRequestId(): string | undefined {
  try {
    return sessionStorage.getItem(RID_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}
