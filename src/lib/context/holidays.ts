/** Feriados oficiales (Nager.Date). Solo informa: no sabemos qué lugar cierra ese día, y lo dice. */
import { fetchJson, type FetchOptions } from "@/lib/sources/http";
import type { ContextItem } from "./types";

export interface Holiday { date: string; localName: string; nationwide: boolean }

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function parseHolidays(raw: unknown): Holiday[] {
  if (!Array.isArray(raw)) return [];
  const out: Holiday[] = [];
  for (const h of raw) {
    if (!isRecord(h) || typeof h.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(h.date) || typeof h.localName !== "string") continue;
    out.push({ date: h.date, localName: h.localName, nationwide: h.global === true });
  }
  return out;
}

const SOURCE = { name: "Nager.Date (feriados públicos)", url: "https://date.nager.at" };

function addOne(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function holidayContext(holidays: readonly Holiday[], isoDate: string): ContextItem[] {
  const out: ContextItem[] = [];
  const today = holidays.filter((h) => h.date === isoDate);
  for (const h of today) {
    out.push({
      id: `feriado-${h.date}-${h.localName}`, kind: "feriado", severity: "aviso", source: SOURCE, certainty: "confirmado",
      title: `Feriado: ${h.localName}`,
      detail: h.nationwide
        ? "Es feriado en todo el país. Varios museos y comercios cambian su horario ese día; confírmalo en el sitio de cada lugar (no tenemos ese dato)."
        : "Es feriado solo en algunas regiones; no sabemos si aplica a esta ciudad. Confírmalo antes de salir.",
    });
  }
  const eve = holidays.filter((h) => h.date === addOne(isoDate) && h.nationwide);
  for (const h of eve) {
    out.push({
      id: `vispera-${h.date}-${h.localName}`, kind: "feriado", severity: "info", source: SOURCE, certainty: "confirmado",
      title: `Mañana es feriado: ${h.localName}`,
      detail: "Es probable que haya más gente y más tráfico hoy. Es una deducción del calendario, no una medición.",
    });
  }
  return out;
}

export async function fetchHolidays(countryCode: string, year: number, opts: FetchOptions & { base?: string } = {}): Promise<Holiday[]> {
  const { base = "https://date.nager.at", ...rest } = opts;
  return parseHolidays(await fetchJson(`${base}/api/v3/PublicHolidays/${year}/${countryCode}`, { timeoutMs: 6000, ...rest }));
}
