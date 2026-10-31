import { activitySchema, tripSchema, type Activity, type Trip } from "./types";

export type Provenance = "provided" | "inferred" | "unknown";
export type ImportedItem = {
  id: string;
  name: string;
  startTime: string | null; // "HH:MM" dado por el usuario
  durationMinutes: number | null;
  cost: { amount: number; currency: string | null } | null;
  provenance: { time: Provenance; duration: Provenance; cost: Provenance };
  sourceLine: string;
};
export type ImportedDay = { index: number; label: string; dateHint: { month: number; day: number } | null; items: ImportedItem[] };
export type ParsedItinerary = { days: ImportedDay[]; notes: string[]; warnings: string[] };

export const DEFAULT_DURATION_MINUTES = 90;
const MONTHS: Record<string, number> = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12 };
const NOTE_RE = /^(alojamiento|hotel|hospedaje|presupuesto|preferencias?|notas?|recomendaci[oó]n(?:es)?|vuelos?|transporte|restricciones?)\s*[:\-–—]/i;
const DAY_RE = /^(?:#{1,4}\s*)?(?:d[ií]a|day)\s+(\d{1,2})\b\s*[:\-–—]?\s*(.*)$/i;

function readTime(s: string): { minutes: number; rest: string } | null {
  let m = /^(\d{1,2}):(\d{2})\s*(am|pm|a\.\s?m\.|p\.\s?m\.)?/i.exec(s);
  let h: number, min: number, mer: string | undefined;
  if (m) { h = +m[1]!; min = +m[2]!; mer = m[3]; }
  else if ((m = /^(\d{1,2})\s*(am|pm|a\.\s?m\.|p\.\s?m\.)(?![a-z])/i.exec(s))) { h = +m[1]!; min = 0; mer = m[2]; }
  else if ((m = /^(\d{1,2})\s*h(?:rs?)?(?![a-z])/i.exec(s))) { h = +m[1]!; min = 0; mer = undefined; }
  else return null;
  if (mer) { const pm = mer.toLowerCase().startsWith("p"); if (h === 12) h = pm ? 12 : 0; else if (pm) h += 12; }
  if (h > 23 || min > 59) return null;
  return { minutes: h * 60 + min, rest: s.slice(m[0].length) };
}

function parseAmount(raw: string): number | null {
  let t = raw.replace(/[^\d.,]/g, "");
  if (!t) return null;
  const lastDot = t.lastIndexOf("."), lastComma = t.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) t = lastDot > lastComma ? t.replace(/,/g, "") : t.replace(/\./g, "").replace(",", ".");
  else if (lastComma >= 0) t = /,\d{3}(?!\d)/.test(t) ? t.replace(/,/g, "") : t.replace(",", ".");
  else if (lastDot >= 0 && /\.\d{3}(?!\d)/.test(t) && t.split(".").length > 1) t = t.replace(/\./g, "");
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const CURRENCY: Record<string, string | null> = { "us$": "USD", usd: "USD", "r$": "BRL", brl: "BRL", clp: "CLP", eur: "EUR", "€": "EUR", $: null };

export function parseItinerary(text: string): ParsedItinerary {
  const days: ImportedDay[] = [];
  const notes: string[] = [];
  const warnings: string[] = [];
  let current: ImportedDay | null = null;
  const ensureDay = (): ImportedDay => {
    if (!current) { current = { index: 1, label: "Día 1", dateHint: null, items: [] }; days.push(current); }
    return current;
  };
  let implicit = false;

  for (const rawLine of text.split(/\r?\n/)) {
    let line = rawLine.replace(/\*\*|__|`/g, "").trim();
    line = line.replace(/^[-*•▪▸>]+\s*/, "").replace(/^\d{1,2}[.)]\s+(?=\D)/, "").trim();
    if (line.length < 2) continue;

    const dm = DAY_RE.exec(line);
    if (dm) {
      const rest = dm[2]!.trim();
      let hint: ImportedDay["dateHint"] = null;
      const mm = /(\d{1,2})\s*(?:de\s+)?(ene|feb|mar|abr|may|jun|jul|ago|sep|set|oct|nov|dic)[a-z]*/i.exec(rest);
      const sl = /(\d{1,2})[/-](\d{1,2})(?:[/-]\d{2,4})?/.exec(rest);
      if (mm) hint = { day: +mm[1]!, month: MONTHS[mm[2]!.toLowerCase()]! };
      else if (sl && +sl[2]! >= 1 && +sl[2]! <= 12) hint = { day: +sl[1]!, month: +sl[2]! };
      current = { index: +dm[1]!, label: rest || `Día ${dm[1]}`, dateHint: hint, items: [] };
      days.push(current);
      continue;
    }
    if (NOTE_RE.test(line)) { notes.push(line); continue; }
    if (line.endsWith(":") && !readTime(line)) continue; // subtítulo
    if (line.length > 160) { warnings.push(`Omití una línea larga que parece una explicación: “${line.slice(0, 50)}…”`); continue; }

    let startTime: string | null = null;
    let duration: number | null = null;
    let durationProv: Provenance = "unknown";
    let work = line;
    const t1 = readTime(work);
    if (t1) {
      startTime = `${String(Math.floor(t1.minutes / 60)).padStart(2, "0")}:${String(t1.minutes % 60).padStart(2, "0")}`;
      work = t1.rest.trim();
      const range = /^(?:-|–|—|a|hasta)\s*(.+)$/i.exec(work);
      const t2 = range ? readTime(range[1]!.trim()) : null;
      if (t2) {
        const diff = t2.minutes - t1.minutes;
        if (diff > 0) { duration = diff; durationProv = "provided"; }
        work = t2.rest.trim();
      }
      work = work.replace(/^[:\-–—)\s]+/, "");
    }
    const dur = /\(?\b(\d+(?:[.,]\d+)?)\s*(horas?|hrs?|h|minutos?|min)\b\)?/i.exec(work);
    if (dur) {
      const v = Number(dur[1]!.replace(",", "."));
      const mins = /^h/i.test(dur[2]!) ? Math.round(v * 60) : Math.round(v);
      if (mins >= 1 && mins <= 1440) { duration = mins; durationProv = "provided"; work = work.replace(dur[0], " "); }
    }
    let cost: ImportedItem["cost"] = null;
    const c = /(US\$|USD|R\$|CLP|EUR|€|\$)\s*([\d][\d.,]*)|([\d][\d.,]*)\s*(USD|CLP|EUR|BRL)\b/i.exec(work);
    if (c) {
      const amount = parseAmount(c[2] ?? c[3] ?? "");
      const sym = (c[1] ?? c[4] ?? "").toLowerCase();
      if (amount !== null) { cost = { amount, currency: CURRENCY[sym] ?? null }; work = work.replace(c[0], " "); }
    }
    const name = work.replace(/[()[\]]+/g, " ").replace(/\s{2,}/g, " ").replace(/^[\s:,\-–—.]+|[\s:,\-–—.]+$/g, "");
    if (name.length < 2) continue;

    if (!current && !implicit) { implicit = true; warnings.push("No encontré encabezados de día: puse todas las actividades en el Día 1."); }
    const day = ensureDay();
    day.items.push({
      id: `imp-${day.index}-${day.items.length + 1}`,
      name, startTime, durationMinutes: duration, cost,
      provenance: { time: startTime ? "provided" : "unknown", duration: duration ? durationProv : "unknown", cost: cost ? "provided" : "unknown" },
      sourceLine: rawLine.trim().slice(0, 200),
    });
  }
  const kept = days.filter((d) => d.items.length > 0);
  if (kept.length === 0) warnings.push("No encontré actividades. Prueba con líneas como “09:00 Museo de Arte” bajo un encabezado “Día 1”.");
  if (cost$Ambiguous(kept)) warnings.push("Hay precios con “$” sin moneda clara: se usará la moneda que elijas, confírmala.");
  return { days: kept, notes, warnings };
}

function cost$Ambiguous(days: ImportedDay[]): boolean {
  return days.some((d) => d.items.some((i) => i.cost && i.cost.currency === null));
}

// ---------- Construcción del viaje ----------

function offsetAt(instant: number, tz: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(new Date(instant)).map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year!, +parts.month! - 1, +parts.day!, +parts.hour!, +parts.minute!, +parts.second!);
  return (asUtc - Math.floor(instant / 1000) * 1000) / 60000;
}

/** Convierte fecha local (YYYY-MM-DD) y minutos del día a ISO con desfase de la zona horaria. */
export function zonedIso(date: string, minutes: number, tz: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const wall = Date.UTC(y!, m! - 1, d!, 0, minutes);
  let ts = wall - offsetAt(wall, tz) * 60000;
  ts = wall - offsetAt(ts, tz) * 60000;
  const off = offsetAt(ts, tz);
  const sign = off < 0 ? "-" : "+";
  const a = Math.abs(off);
  return `${new Date(ts + off * 60000).toISOString().slice(0, 19)}${sign}${String(Math.floor(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`;
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + n)).toISOString().slice(0, 10);
}

const toMinutes = (hhmm: string) => +hhmm.slice(0, 2) * 60 + +hhmm.slice(3, 5);

export type ImportInput = {
  destination: string;
  coordinates: { latitude: number; longitude: number };
  timeZone: string;
  startDate: string; // YYYY-MM-DD
  travelers: number;
  currency: string;
  budget?: number | null;
  parsed: ParsedItinerary;
  now: string;
};

export function buildImportedTrip(input: ImportInput): { trip: Trip; activities: Activity[] } {
  const { parsed, timeZone, startDate, currency } = input;
  if (parsed.days.length === 0) throw new Error("No hay actividades para importar.");
  const dates = parsed.days.map((d) => {
    if (d.dateHint) {
      const year = +startDate.slice(0, 4);
      const base = `${year}-${String(d.dateHint.month).padStart(2, "0")}-${String(d.dateHint.day).padStart(2, "0")}`;
      return base < startDate ? `${year + 1}${base.slice(4)}` : base;
    }
    return addDays(startDate, d.index - 1);
  });
  const activities: Activity[] = [];
  let earliest = 480;
  parsed.days.forEach((day, di) => {
    day.items.forEach((item) => {
      const hasTime = Boolean(item.startTime);
      if (hasTime) earliest = Math.min(earliest, toMinutes(item.startTime!));
      const user = { status: "estimated" as const, sourceId: "user-import", observedAt: input.now, expiresAt: null };
      const unknown = { status: "unknown" as const, sourceId: null, observedAt: null, expiresAt: null };
      activities.push(activitySchema.parse({
        id: `${item.id}-d${di + 1}`,
        name: item.name,
        category: "importado, ubicación aproximada",
        location: { latitude: input.coordinates.latitude, longitude: input.coordinates.longitude },
        durationMinutes: item.durationMinutes ?? DEFAULT_DURATION_MINUTES,
        importance: hasTime ? "fixed" : "normal",
        ...(hasTime ? { fixedStart: zonedIso(dates[di]!, toMinutes(item.startTime!), timeZone) } : {}),
        ...(!hasTime && di > 0 ? { startNotBefore: zonedIso(dates[di]!, 480, timeZone) } : {}),
        cost: { amount: item.cost ? item.cost.amount : null, currency: item.cost?.currency ?? currency, basis: "unknown" },
        travelMinutesFromPrevious: null,
        travelEvidence: unknown,
        hoursEvidence: unknown,
        costEvidence: item.cost ? user : unknown,
        demoData: false,
      }));
    });
  });
  const slug = input.destination.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  const trip = tripSchema.parse({
    id: `import-${slug}-${startDate}`,
    destination: input.destination,
    startAt: zonedIso(dates[0]!, earliest, timeZone),
    endAt: zonedIso(dates[dates.length - 1]!, 23 * 60, timeZone),
    timeZone,
    budget: { amount: input.budget && input.budget > 0 ? input.budget : 1_000_000, currency },
    travelers: input.travelers,
  });
  return { trip, activities };
}
