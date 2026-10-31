/**
 * Avisos de viaje del FCDO (Foreign, Commonwealth & Development Office, Reino
 * Unido) vía la API de contenido de GOV.UK. Es un aviso OFICIAL, pero de un solo
 * gobierno: la interfaz debe nombrarlo así y no presentarlo como "el" aviso oficial.
 *
 * Forma verificada (lectura real del 31-oct-2026, Perú y Etiopía):
 *   GET {base}/api/content/foreign-travel-advice/{slug}
 *   details.alert_status: string[]   p. ej. ["avoid_all_but_essential_travel_to_parts"]
 *   details.country: { name, slug, synonyms }
 *   details.updated_at (ISO) en algunos países
 * NO observados (inferidos por simetría con los anteriores): los valores
 * "..._to_whole_country". El intérprete los acepta por patrón y, si aparece un
 * valor que no reconoce, devuelve null en vez de suponer un nivel.
 */
import { fetchJson, type FetchOptions } from "./http";

export const FCDO_SOURCE_ID = "fcdo";
export const FCDO_DEFAULT_BASE = "https://www.gov.uk";

/** País (como figura en la semilla) → slug de GOV.UK. */
export const FCDO_COUNTRY_SLUGS: Readonly<Record<string, string>> = {
  Perú: "peru",
  Argentina: "argentina",
  Chile: "chile",
  México: "mexico",
  Colombia: "colombia",
  Brasil: "brazil",
  Uruguay: "uruguay",
  Ecuador: "ecuador",
  Bolivia: "bolivia",
  Paraguay: "paraguay",
  Panamá: "panama",
  "Costa Rica": "costa-rica",
  Cuba: "cuba",
  Venezuela: "venezuela",
};

export type AdvisoryScope = "none" | "parts" | "whole";
/** Misma escala que `Destination.riskLevel`: 1 normal … 4 no viajar. */
export type RiskLevel = 1 | 2 | 3 | 4;

export interface Advisory {
  slug: string;
  countryName: string;
  /** Valores crudos de `alert_status`. */
  statuses: string[];
  level: RiskLevel;
  scope: AdvisoryScope;
  /** true si el aviso es "evitar TODO viaje" (no solo los no esenciales). */
  avoidAll: boolean;
  /** Fecha de la última actualización del aviso, si la API la entrega. */
  updatedAt: string | null;
  url: string;
}

const AVOID_ALL = /^avoid_all_travel_to_(whole_country|parts)$/;
const AVOID_ESSENTIAL = /^avoid_all_but_essential_travel_to_(whole_country|parts)$/;

/**
 * Traduce `alert_status` al nivel 1..4. Arreglo vacío = sin alerta (1).
 * Devuelve null si hay valores y ninguno es reconocible.
 */
export function riskFromStatuses(statuses: readonly string[]): { level: RiskLevel; scope: AdvisoryScope; avoidAll: boolean } | null {
  if (statuses.length === 0) return { level: 1, scope: "none", avoidAll: false };
  let level: RiskLevel | 0 = 0;
  let scope: AdvisoryScope = "none";
  let avoidAll = false;
  for (const s of statuses) {
    const all = AVOID_ALL.exec(s);
    const ess = AVOID_ESSENTIAL.exec(s);
    const m = all ?? ess;
    if (!m) continue;
    const whole = m[1] === "whole_country";
    const lv: RiskLevel = all ? (whole ? 4 : 2) : whole ? 3 : 2;
    if (lv > level) level = lv;
    if (whole) scope = "whole";
    else if (scope === "none") scope = "parts";
    if (all) avoidAll = true;
  }
  return level === 0 ? null : { level, scope, avoidAll };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function validIso(v: unknown): string | null {
  return typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v : null;
}

/** Interpreta la respuesta de la API. null si no tiene la forma esperada. */
export function parseAdvisory(raw: unknown, slug: string, countryName: string): Advisory | null {
  if (!isRecord(raw) || !isRecord(raw.details)) return null;
  const status = raw.details.alert_status;
  if (!Array.isArray(status) || !status.every((s) => typeof s === "string")) return null;
  const risk = riskFromStatuses(status as string[]);
  if (!risk) return null;
  return {
    slug,
    countryName,
    statuses: status as string[],
    ...risk,
    updatedAt: validIso(raw.details.updated_at) ?? validIso(raw.public_updated_at),
    url: `https://www.gov.uk/foreign-travel-advice/${slug}`,
  };
}

export async function fetchAdvisory(
  countryName: string,
  opts: FetchOptions & { base?: string } = {},
): Promise<Advisory> {
  const slug = FCDO_COUNTRY_SLUGS[countryName];
  if (!slug) throw new Error(`Sin slug FCDO para ${countryName}`);
  const { base = FCDO_DEFAULT_BASE, ...rest } = opts;
  const raw = await fetchJson(`${base}/api/content/foreign-travel-advice/${slug}`, { timeoutMs: 8000, ...rest });
  const advisory = parseAdvisory(raw, slug, countryName);
  if (!advisory) throw new Error(`Respuesta FCDO no interpretable para ${slug}`);
  return advisory;
}

/** Razón en español para `Destination.riskReasons`. */
export function advisoryReason(a: Advisory): string {
  if (a.level === 1) return "Sin alerta vigente en el aviso de viaje del FCDO (Reino Unido)";
  const what = a.avoidAll ? "evitar todo viaje" : "evitar viajes no esenciales";
  const where = a.scope === "whole" ? "al país" : "a algunas zonas del país";
  return `Aviso del FCDO (Reino Unido): ${what} ${where}`;
}
