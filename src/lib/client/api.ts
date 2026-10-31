import type {
  ClickResponse,
  CompareResponse,
  ComparePriority,
  DestinationDetailResponse,
  FeedbackRequest,
  FeedbackResponse,
  GlobeResponse,
  RecommendationsResponse,
  SurpriseResponse,
  TripRequest,
} from "@/lib/types";

/** El mock solo existe si NEXT_PUBLIC_USE_MOCK=1; por defecto se usa fetch real. */
const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK === "1";

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number = 0,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function errorCodeFrom(body: unknown, status: number): { code: string; message: string } {
  const fallback = { code: `HTTP_${status}`, message: `Error ${status}` };
  if (typeof body !== "object" || body === null) return fallback;
  const e = (body as { error?: unknown }).error;
  if (typeof e === "string") return { code: e.toUpperCase().replace(/\W+/g, "_").slice(0, 40) || fallback.code, message: e };
  if (typeof e === "object" && e !== null) {
    const { code, message } = e as { code?: unknown; message?: unknown };
    return {
      code: typeof code === "string" ? code : fallback.code,
      message: typeof message === "string" ? message : fallback.message,
    };
  }
  return fallback;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ApiError("SIN_CONEXION", "No hay conexión con el servidor.", 0);
  }
  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* cuerpo no JSON */
    }
    const { code, message } = errorCodeFrom(body, res.status);
    throw new ApiError(code, message, res.status);
  }
  try {
    return (await res.json()) as T;
  } catch {
    throw new ApiError("RESPUESTA_INVALIDA", "La respuesta del servidor no se pudo leer.", res.status);
  }
}

function postJson<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  return request<T>(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
}

function qs(params: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export async function getRecommendations(req: TripRequest, signal?: AbortSignal): Promise<RecommendationsResponse> {
  if (USE_MOCK) return (await import("./mock")).mockRecommendations(req);
  return postJson<RecommendationsResponse>("/api/recommendations", req, signal);
}

export async function getDestination(id: string, q?: string, signal?: AbortSignal): Promise<DestinationDetailResponse> {
  if (USE_MOCK) return (await import("./mock")).mockDestination(id, q);
  return request<DestinationDetailResponse>(`/api/destinations/${encodeURIComponent(id)}${qs({ q })}`, { signal });
}

export async function getCompare(
  p: { a: string; b: string; priority: ComparePriority; q?: string },
  signal?: AbortSignal,
): Promise<CompareResponse> {
  if (USE_MOCK) return (await import("./mock")).mockCompare(p.a, p.b, p.priority, p.q);
  return request<CompareResponse>(`/api/compare${qs({ a: p.a, b: p.b, priority: p.priority, q: p.q })}`, { signal });
}

export async function postSurprise(
  body: { request: TripRequest; exclude: string[] },
  signal?: AbortSignal,
): Promise<SurpriseResponse> {
  if (USE_MOCK) return (await import("./mock")).mockSurprise(body.request, body.exclude);
  return postJson<SurpriseResponse>("/api/surprise", body, signal);
}

export async function getGlobe(origin: string, month: number, signal?: AbortSignal): Promise<GlobeResponse> {
  if (USE_MOCK) return (await import("./mock")).mockGlobe(month);
  return request<GlobeResponse>(`/api/globe${qs({ origin, month })}`, { signal });
}

export async function postClick(
  body: { destinationId: string; kind: "flight" | "hotel"; requestId?: string },
  signal?: AbortSignal,
): Promise<ClickResponse> {
  if (USE_MOCK) return (await import("./mock")).mockClick(body.destinationId);
  return postJson<ClickResponse>("/api/clicks", body, signal);
}

export async function postFeedback(body: FeedbackRequest, signal?: AbortSignal): Promise<FeedbackResponse> {
  if (USE_MOCK) return (await import("./mock")).mockFeedback(body);
  return postJson<FeedbackResponse>("/api/feedback", body, signal);
}

/** URL de la imagen 9:16 compartible (PNG generado en servidor). */
export function shareImageUrl(id: string, score: number | null, q?: string): string {
  return `/api/share/${encodeURIComponent(id)}${qs({ score: score ?? undefined, q })}`;
}
