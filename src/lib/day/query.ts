/** Enlace profundo a «Mi día»: la portada lo arma y /dia lo lee. Todo se valida; lo inválido se ignora. */
import { CITIES } from "./cities";
import { KINDS, type Kind } from "./places";

export interface DayPrefill { city: string; date: string; start: string; end: string; kinds: Kind[]; go: boolean }

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function parseDayQuery(sp: Record<string, string | string[] | undefined>, fallbackDate: string): DayPrefill {
  const city = first(sp.city);
  const date = first(sp.date);
  const from = first(sp.from);
  const to = first(sp.to);
  const kinds = (first(sp.w) ?? "").split(",").filter((k): k is Kind => (KINDS as readonly string[]).includes(k));
  const unique = [...new Set(kinds)];
  return {
    city: city && city in CITIES ? city : "sao-paulo-br",
    date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(`${date}T12:00:00Z`)) ? date : fallbackDate,
    start: from && HHMM.test(from) ? from : "11:00",
    end: to && HHMM.test(to) ? to : "23:00",
    kinds: unique.length ? unique : ["museo", "restaurante", "galeria", "pub"],
    go: first(sp.go) === "1" && unique.length > 0,
  };
}

export function dayHref(p: { city: string; date: string; start: string; end: string; kinds: readonly Kind[] }): string {
  const q = new URLSearchParams({ city: p.city, date: p.date, from: p.start, to: p.end, w: p.kinds.join(","), go: "1" });
  return `/dia?${q.toString()}`;
}
