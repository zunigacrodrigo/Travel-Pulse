/**
 * Cliente Anthropic perezoso + `callJson` (salida JSON validada con zod, un reintento).
 * Sin ANTHROPIC_API_KEY todo devuelve null y los llamadores usan sus respaldos deterministas.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";
import { aiAvailable, estimateCostUsd, recordCall, type AiFeature } from "./telemetry";

export const MODEL_HAIKU = "claude-haiku-5-5";
export const MODEL_SONNET = "claude-sonnet-5-5";

/** Tiempo total por defecto de callJson (incluye el reintento). */
export const DEFAULT_TIMEOUT_MS = 6000;
/** Tiempo para los veredictos con Haiku (la recomendación completa debe quedar bajo 3 s p95). */
export const HAIKU_VERDICT_TIMEOUT_MS = 2500;
/** No se inicia un intento si quedan menos de estos ms. */
const MIN_ATTEMPT_MS = 300;

const JSON_ONLY_SUFFIX =
  "\n\nFORMATO DE SALIDA: responde ÚNICAMENTE con un objeto JSON válido, sin texto antes ni después, sin markdown ni bloques de código.";

/* ---- Abstracción mínima del cliente (permite inyectar un falso en tests) ---- */

export interface LlmRequest {
  model: string;
  system: string;
  user: string;
  maxTokens: number;
  timeoutMs: number;
  signal: AbortSignal;
}
export interface LlmResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
}
export interface LlmClient {
  complete(req: LlmRequest): Promise<LlmResponse>;
}

let cached: { key: string; client: LlmClient } | null = null;
let injected: LlmClient | null | undefined;

function createSdkClient(apiKey: string): LlmClient {
  const sdk = new Anthropic({ apiKey, maxRetries: 0 });
  return {
    async complete(req) {
      const msg = await sdk.messages.create(
        {
          model: req.model,
          max_tokens: req.maxTokens,
          system: req.system,
          messages: [{ role: "user", content: req.user }],
        },
        { timeout: req.timeoutMs, signal: req.signal, maxRetries: 0 },
      );
      const text = msg.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      return { text, inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens };
    },
  };
}

/** Cliente perezoso; null si no hay ANTHROPIC_API_KEY. */
export function getLlmClient(): LlmClient | null {
  if (injected !== undefined) return injected;
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) return null;
  if (!cached || cached.key !== key) cached = { key, client: createSdkClient(key) };
  return cached.client;
}

/** Solo para tests: inyecta un cliente (o null). `undefined` restaura el comportamiento normal. */
export function _setClientForTests(client: LlmClient | null | undefined): void {
  injected = client;
  cached = null;
}

/** ¿Hay clave y presupuesto para esta función? */
export function llmEnabled(feature: AiFeature = "essential"): boolean {
  return getLlmClient() !== null && aiAvailable(feature);
}

/* ---- callJson ---- */

export interface CallJsonOptions<T> {
  model: string;
  system: string;
  user: string;
  schema: z.ZodType<T>;
  maxTokens: number;
  /** Tiempo total (con reintento). Por defecto 6000 ms. */
  timeoutMs?: number;
  /** Para el presupuesto. Por defecto "essential". */
  feature?: AiFeature;
  /** Etiqueta para la telemetría (p. ej. "verdict.write"). */
  label?: string;
}

export interface CallJsonUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  costUsd: number;
  attempts: number;
}

export interface CallJsonResult<T> {
  data: T;
  usage: CallJsonUsage;
}

/** Extrae el primer objeto JSON de un texto (tolera ```json ... ```). */
export function extractJson(text: string): unknown {
  const stripped = text.replace(/```(?:json)?/gi, "").trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("sin_json");
  return JSON.parse(stripped.slice(start, end + 1)) as unknown;
}

function errMsg(e: unknown): string {
  return e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 200) : "error_desconocido";
}

/**
 * Pide JSON al modelo, lo parsea y valida con zod. Un reintento si la respuesta es inválida o la
 * llamada falla (mientras quede tiempo). Devuelve null si no hay clave, no hay presupuesto,
 * se agota el tiempo o la salida no valida.
 */
export async function callJson<T>(opts: CallJsonOptions<T>): Promise<CallJsonResult<T> | null> {
  const feature = opts.feature ?? "essential";
  const label = opts.label ?? "call";
  if (!aiAvailable(feature)) return null;
  const client = getLlmClient();
  if (!client) return null;

  const started = Date.now();
  const deadline = started + (opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  let inputTokens = 0;
  let outputTokens = 0;
  let attempts = 0;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining < MIN_ATTEMPT_MS) break;
    attempts++;
    const t0 = Date.now();
    const ctrl = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        ctrl.abort();
        reject(new Error("timeout"));
      }, remaining);
    });
    let res: LlmResponse;
    try {
      res = await Promise.race([
        client.complete({
          model: opts.model,
          system: opts.system + JSON_ONLY_SUFFIX,
          user: opts.user,
          maxTokens: opts.maxTokens,
          timeoutMs: remaining,
          signal: ctrl.signal,
        }),
        timeout,
      ]);
    } catch (e) {
      recordCall({ model: opts.model, label, feature, inputTokens: 0, outputTokens: 0, latencyMs: Date.now() - t0, ok: false, error: errMsg(e) });
      if (e instanceof Error && e.message === "timeout") break; // sin tiempo para reintentar
      continue;
    } finally {
      if (timer) clearTimeout(timer);
    }

    inputTokens += res.inputTokens;
    outputTokens += res.outputTokens;
    const latency = Date.now() - t0;
    try {
      const parsed = opts.schema.safeParse(extractJson(res.text));
      if (parsed.success) {
        recordCall({ model: opts.model, label, feature, inputTokens: res.inputTokens, outputTokens: res.outputTokens, latencyMs: latency, ok: true });
        return {
          data: parsed.data,
          usage: {
            model: opts.model,
            inputTokens,
            outputTokens,
            latencyMs: Date.now() - started,
            costUsd: estimateCostUsd(opts.model, inputTokens, outputTokens),
            attempts,
          },
        };
      }
      recordCall({ model: opts.model, label, feature, inputTokens: res.inputTokens, outputTokens: res.outputTokens, latencyMs: latency, ok: false, error: "schema_invalido" });
    } catch (e) {
      recordCall({ model: opts.model, label, feature, inputTokens: res.inputTokens, outputTokens: res.outputTokens, latencyMs: latency, ok: false, error: `json_invalido: ${errMsg(e)}` });
    }
  }
  return null;
}
