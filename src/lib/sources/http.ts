/**
 * Cliente HTTP mínimo para fuentes externas: tiempo máximo, tamaño máximo y
 * errores tipificados. Nunca lanza sin clasificar el fallo: quien llama decide
 * cómo degradar (usar el último dato bueno o declarar que no hay dato).
 */
export type SourceErrorKind = "timeout" | "network" | "http" | "parse" | "too_large";

export class SourceError extends Error {
  constructor(
    public readonly kind: SourceErrorKind,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "SourceError";
  }
}

export const USER_AGENT = "TravelPulse/0.2 (+https://github.com/rodrigozunigacal-lgtm/travel-pulse)";
const MAX_BYTES = 3_000_000;

export interface FetchOptions {
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  headers?: Record<string, string>;
}

export async function fetchJson(url: string, opts: FetchOptions = {}): Promise<unknown> {
  const { timeoutMs = 6000, fetchImpl = fetch, headers = {} } = opts;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    let res: Response;
    try {
      res = await fetchImpl(url, {
        signal: ac.signal,
        headers: { accept: "application/json", "user-agent": USER_AGENT, ...headers },
        cache: "no-store",
      });
    } catch (e) {
      if (ac.signal.aborted) throw new SourceError("timeout", `Sin respuesta en ${timeoutMs} ms`);
      throw new SourceError("network", e instanceof Error ? e.message : "Error de red");
    }
    if (!res.ok) throw new SourceError("http", `HTTP ${res.status}`, res.status);
    const text = await res.text();
    if (text.length > MAX_BYTES) throw new SourceError("too_large", "Respuesta demasiado grande");
    // Algunas fuentes (p. ej. GDACS) responden 204 con cuerpo vacío cuando no hay resultados.
    if (res.status === 204 || text.trim() === "") return null;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new SourceError("parse", "La respuesta no es JSON válido");
    }
  } finally {
    clearTimeout(timer);
  }
}

/** Texto corto y seguro para mostrar al usuario o registrar. */
export function describeError(e: unknown): string {
  if (e instanceof SourceError) return e.message;
  return e instanceof Error ? e.message : "Error desconocido";
}
