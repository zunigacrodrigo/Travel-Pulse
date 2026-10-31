/**
 * Telemetría y presupuesto de IA.
 *
 * - Anillo en memoria con las últimas llamadas + una línea JSON por llamada (console.info).
 * - Gasto del mes en curso (UTC) y control de presupuesto:
 *     >= 70 %  -> alerta (console.warn, una vez por mes)
 *     >= 100 % -> se cortan las funciones "nonEssential"
 *     >= HARD_STOP_RATIO -> se corta todo, incluso lo esencial (freno de seguridad)
 *
 * Limitación: el estado vive en memoria del proceso (en serverless es por instancia).
 * Para un gasto global, sembrar con `seedMonthlySpend()` desde un almacén persistente.
 */

export type AiFeature = "essential" | "nonEssential";

export interface ModelPricing {
  /** USD por millón de tokens de entrada. */
  inputPerMTok: number;
  /** USD por millón de tokens de salida. */
  outputPerMTok: number;
}

/**
 * PRECIOS PLACEHOLDER: NO son tarifas oficiales. Reemplazar por la lista de precios vigente
 * de Anthropic antes de usar el costo estimado para facturación o alertas reales.
 */
export const PRICING_USD_PER_MTOK: Record<string, ModelPricing> = {
  "claude-haiku-5-5": { inputPerMTok: 1.0, outputPerMTok: 5.0 }, // PLACEHOLDER
  "claude-sonnet-5-5": { inputPerMTok: 3.0, outputPerMTok: 15.0 }, // PLACEHOLDER
};
/** Precio conservador (el más alto) para modelos que no estén en la tabla. */
export const FALLBACK_PRICING: ModelPricing = { inputPerMTok: 3.0, outputPerMTok: 15.0 }; // PLACEHOLDER

export const DEFAULT_MONTHLY_BUDGET_USD = 50;
export const BUDGET_WARN_RATIO = 0.7;
export const BUDGET_CUT_RATIO = 1.0;
/** Sobre este múltiplo del presupuesto se corta también lo esencial. */
export const HARD_STOP_RATIO = 1.5;
const RING_SIZE = 500;

export interface AiCallRecord {
  ts: string;
  model: string;
  label: string;
  feature: AiFeature;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  costUsd: number;
  ok: boolean;
  error: string | null;
}

export interface BudgetStatus {
  month: string;
  spentUsd: number;
  budgetUsd: number;
  ratio: number;
  level: "ok" | "warn" | "cut";
}

const ring: AiCallRecord[] = [];
const spendByMonth = new Map<string, number>();
const warned = new Set<string>();

export function monthKey(d: Date = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICING_USD_PER_MTOK[model] ?? FALLBACK_PRICING;
  const cost = (inputTokens * p.inputPerMTok + outputTokens * p.outputPerMTok) / 1_000_000;
  return Math.round(cost * 1e8) / 1e8;
}

export function getBudgetUsd(): number {
  const raw = process.env.AI_MONTHLY_BUDGET_USD;
  if (raw === undefined || raw.trim() === "") return DEFAULT_MONTHLY_BUDGET_USD;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MONTHLY_BUDGET_USD;
}

export function getMonthlySpendUsd(): number {
  return spendByMonth.get(monthKey()) ?? 0;
}

/** Siembra/ajusta el gasto del mes actual (p. ej. desde un almacén persistente). */
export function seedMonthlySpend(usd: number): void {
  spendByMonth.set(monthKey(), Math.max(0, usd));
  checkThresholds();
}

export function budgetStatus(): BudgetStatus {
  const month = monthKey();
  const spentUsd = spendByMonth.get(month) ?? 0;
  const budgetUsd = getBudgetUsd();
  const ratio = spentUsd / budgetUsd;
  const level = ratio >= BUDGET_CUT_RATIO ? "cut" : ratio >= BUDGET_WARN_RATIO ? "warn" : "ok";
  return { month, spentUsd, budgetUsd, ratio, level };
}

function checkThresholds(): void {
  const s = budgetStatus();
  if (s.ratio >= BUDGET_CUT_RATIO && !warned.has(`${s.month}:cut`)) {
    warned.add(`${s.month}:cut`);
    console.warn(
      JSON.stringify({ evt: "ai_budget", level: "cut", ...pick(s), note: "funciones no esenciales de IA desactivadas" }),
    );
  } else if (s.ratio >= BUDGET_WARN_RATIO && !warned.has(`${s.month}:warn`)) {
    warned.add(`${s.month}:warn`);
    console.warn(JSON.stringify({ evt: "ai_budget", level: "warn", ...pick(s), note: "70% del presupuesto mensual de IA" }));
  }
}

function pick(s: BudgetStatus) {
  return { month: s.month, spentUsd: round(s.spentUsd), budgetUsd: s.budgetUsd, pct: Math.round(s.ratio * 100) };
}

function round(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/**
 * ¿Se puede usar IA ahora?
 * - "nonEssential": false desde el 100 % del presupuesto.
 * - "essential": false solo pasado HARD_STOP_RATIO (freno duro).
 */
export function aiAvailable(feature: AiFeature): boolean {
  const { ratio } = budgetStatus();
  if (feature === "nonEssential") return ratio < BUDGET_CUT_RATIO;
  return ratio < HARD_STOP_RATIO;
}

export interface RecordCallInput {
  model: string;
  label: string;
  feature: AiFeature;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  ok: boolean;
  error?: string | null;
}

/** Registra una llamada al LLM: anillo + línea JSON + gasto del mes. */
export function recordCall(input: RecordCallInput): AiCallRecord {
  const costUsd = estimateCostUsd(input.model, input.inputTokens, input.outputTokens);
  const rec: AiCallRecord = {
    ts: new Date().toISOString(),
    model: input.model,
    label: input.label,
    feature: input.feature,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    latencyMs: Math.round(input.latencyMs),
    costUsd,
    ok: input.ok,
    error: input.error ?? null,
  };
  ring.push(rec);
  if (ring.length > RING_SIZE) ring.shift();
  const key = monthKey();
  spendByMonth.set(key, (spendByMonth.get(key) ?? 0) + costUsd);
  console.info(JSON.stringify({ evt: "ai_call", ...rec }));
  checkThresholds();
  return rec;
}

export interface AiEventRecord {
  ts: string;
  name: string;
  data: Record<string, string | number | boolean | null>;
}
const events: AiEventRecord[] = [];

/** Eventos de la capa de IA (p. ej. el revisor rechazó un texto). */
export function logAiEvent(name: string, data: AiEventRecord["data"] = {}): void {
  const ev: AiEventRecord = { ts: new Date().toISOString(), name, data };
  events.push(ev);
  if (events.length > RING_SIZE) events.shift();
  console.info(JSON.stringify({ evt: "ai_event", ...ev }));
}

export function recentCalls(limit = 50): AiCallRecord[] {
  return ring.slice(-limit);
}

export function recentEvents(limit = 50): AiEventRecord[] {
  return events.slice(-limit);
}

/** Solo para tests. */
export function resetTelemetry(): void {
  ring.length = 0;
  events.length = 0;
  spendByMonth.clear();
  warned.clear();
}
