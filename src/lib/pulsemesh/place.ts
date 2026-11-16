/**
 * Resumen honesto de lo que los viajeros han reportado de UN lugar. Puro (sin red ni DOM).
 *
 * Reglas:
 *  - Solo cuentan reportes vigentes de ese lugar. Un reporte caducado no existe para la persona.
 *  - Sin reportes se dice exactamente eso; jamás «todo bien» ni «tranquilo».
 *  - Un reporte de viajeros nunca se presenta como oficial.
 *  - Solo un reporte corroborado por 3 personas distintas cuenta como «corroborado»; uno en disputa no.
 */
import { kindLabel, type PublicSignal } from "./model";

export type PlaceState = "sin_reportes" | "por_confirmar" | "corroborado" | "en_disputa";

export interface PlaceSummary {
  placeId: string;
  state: PlaceState;
  /** Una línea para mostrar bajo la parada. */
  headline: string;
  total: number;
  /** Vigentes, el más reciente primero. */
  reports: PublicSignal[];
  /** Los que 3 o más personas distintas respaldan y nadie disputa. */
  corroborated: PublicSignal[];
}

export const NO_REPORTS = "Aún no hay reportes de viajeros aquí";

/** «hace 40 min», «hace 3 h», «hace 2 d». Una fecha inválida no inventa una antigüedad. */
export function agoText(iso: string, now: Date): string {
  const ms = now.getTime() - Date.parse(iso);
  if (!Number.isFinite(ms)) return "hora desconocida";
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "hace menos de 1 min";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  return h < 48 ? `hace ${h} h` : `hace ${Math.floor(h / 24)} d`;
}

export function groupByPlace(signals: readonly PublicSignal[]): Record<string, PublicSignal[]> {
  const out: Record<string, PublicSignal[]> = {};
  for (const s of signals) if (s.placeId) (out[s.placeId] ??= []).push(s);
  return out;
}

export function summarizePlace(signals: readonly PublicSignal[], placeId: string, now: Date): PlaceSummary {
  const reports = signals
    .filter((s) => s.placeId === placeId && Date.parse(s.expiresAt) > now.getTime())
    .sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt));
  if (reports.length === 0) return { placeId, state: "sin_reportes", headline: NO_REPORTS, total: 0, reports: [], corroborated: [] };

  const corroborated = reports.filter((r) => r.state === "corroborada");
  const latest = reports[0]!;
  const state: PlaceState = corroborated.length > 0 ? "corroborado" : latest.state === "en_disputa" ? "en_disputa" : "por_confirmar";
  const shown = corroborated[0] ?? latest;
  const people = `${shown.independentCount} viajero${shown.independentCount === 1 ? "" : "s"}`;
  const status = shown.state === "corroborada" ? "" : shown.state === "en_disputa" ? " · en disputa" : " · falta confirmar";
  const more = reports.length > 1 ? ` · y ${reports.length - 1} reporte${reports.length - 1 === 1 ? "" : "s"} más` : "";
  return {
    placeId, state, total: reports.length, reports, corroborated,
    headline: `${kindLabel(shown.category, shown.kind)} · ${people} · ${agoText(shown.observedAt, now)}${status} · no oficial${more}`,
  };
}
