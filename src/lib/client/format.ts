import type { TripRequest } from "@/lib/types";

export const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;

export const MONTHS_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"] as const;

export const ORIGIN_NAMES: Record<string, string> = { SCL: "Santiago" };

/** Respaldo de nombres por código IATA cuando solo llega el código (p. ej. EmptyHelp.cheapest). */
export const CITY_NAMES: Record<string, string> = {
  CUZ: "Cusco",
  SLA: "Salta",
  OAX: "Oaxaca",
  MDE: "Medellín",
  FLN: "Florianópolis",
  MDZ: "Mendoza",
  BRC: "Bariloche",
  AQP: "Arequipa",
  LIM: "Lima",
  BOG: "Bogotá",
  EZE: "Buenos Aires",
  CTG: "Cartagena",
  UIO: "Quito",
  MVD: "Montevideo",
  ASU: "Asunción",
  LPB: "La Paz",
};

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function monthName(month: number): string {
  return MONTHS[Math.min(12, Math.max(1, Math.round(month))) - 1];
}

/** 1180 -> "1.180" (separador de miles con punto). */
export function groupThousands(n: number): string {
  const sign = n < 0 ? "-" : "";
  const s = String(Math.abs(Math.round(n)));
  return sign + s.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** 1180 -> "US$1.180". */
export function formatUsd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "Sin datos";
  return `US$${groupThousands(n)}`;
}

/** Decimal con coma: 4.5 -> "4,5". */
export function formatDecimal(n: number, digits = 1): string {
  const fixed = Math.abs(n).toFixed(digits).replace(".", ",");
  return (n < 0 ? "-" : "") + fixed;
}

/** Brecha con signo tipográfico: -0.2 -> "−0,2"; 0.3 -> "+0,3"; 0 -> "0,0". */
export function formatGap(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  const body = Math.abs(rounded).toFixed(1).replace(".", ",");
  if (rounded === 0) return body;
  return (rounded < 0 ? "−" : "+") + body;
}

function parseIso(iso: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

/** "2026-10-06" -> "6 oct 2026". */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "sin fecha";
  const p = parseIso(iso);
  if (!p) return "sin fecha";
  return `${p.d} ${MONTHS_SHORT[p.m - 1]} ${p.y}`;
}

/** "2026-10-06" -> "6 oct". */
export function formatDayMonth(iso: string): string {
  const p = parseIso(iso);
  if (!p) return "";
  return `${p.d} ${MONTHS_SHORT[p.m - 1]}`;
}

/** Fecha de actualización: "hoy, 6 oct" si es hoy; si no, "6 oct". */
export function formatUpdated(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return formatDayMonth(iso);
  const label = `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
  const now = new Date();
  const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  return sameDay ? `hoy, ${label}` : label;
}

export function plural(n: number, one: string, many: string): string {
  return n === 1 ? `${n} ${one}` : `${n} ${many}`;
}

export function originName(code: string): string {
  return ORIGIN_NAMES[code] ?? code;
}

/** "Desde Santiago, noviembre, 8 días, US$1.500" */
export function describeRequest(r: TripRequest): string {
  return `Desde ${originName(r.origin)}, ${monthName(r.month)}, ${plural(r.days, "día", "días")}, ${formatUsd(r.budgetUsd)}`;
}

/** Lista legible: ["a","b","c"] -> "a, b y c". */
export function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}
