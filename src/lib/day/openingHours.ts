/**
 * Intérprete del subconjunto de `opening_hours` de OpenStreetMap que aparece en los datos reales
 * (verificado con lugares de São Paulo): días sueltos, listas y rangos («Tu-Su», «We,Sa,Su», «We-Mo»),
 * varios tramos por día, cruces de medianoche («19:00-02:00»), «24:00», «off», «24/7» y reglas que se
 * sobrescriben en orden («Tu-Su 10:00-18:00; Th 10:00-20:00»).
 *
 * Regla de honestidad: si el texto trae algo que no se interpreta con certeza (meses, semanas, «sunrise»,
 * comentarios, reglas sin horas), el resultado es `null` = «horario sin confirmar». Jamás se supone abierto.
 * Los feriados (PH) no se conocen: el resultado lo avisa en `holidayCaveat`.
 */
export interface Interval {
  /** Minutos desde las 00:00 del día de inicio. `end` puede pasar de 1440 si cruza la medianoche. */
  start: number;
  end: number;
}

export interface ParsedHours {
  /** Índice 0 = lunes … 6 = domingo. */
  days: Interval[][];
  holidayCaveat: boolean;
}

const DAY: Record<string, number> = { mo: 0, tu: 1, we: 2, th: 3, fr: 4, sa: 5, su: 6 };
const DAY_RE = "(?:Mo|Tu|We|Th|Fr|Sa|Su)";
const SPLIT_RULES = new RegExp(`;|,\\s+(?=(?:${DAY_RE}|PH)\\b)`);

function daysOf(part: string): { days: number[]; ph: boolean } | null {
  const days = new Set<number>();
  let ph = false;
  for (const raw of part.split(",")) {
    const token = raw.trim();
    if (token === "PH") { ph = true; continue; }
    const m = new RegExp(`^(${DAY_RE})(?:-(${DAY_RE}))?$`).exec(token);
    if (!m) return null;
    const a = DAY[m[1]!.toLowerCase()]!;
    if (!m[2]) { days.add(a); continue; }
    const b = DAY[m[2].toLowerCase()]!;
    // Rango que cruza el domingo: «We-Mo» = mi, ju, vi, sá, do, lu.
    for (let d = a; ; d = (d + 1) % 7) {
      days.add(d);
      if (d === b) break;
    }
  }
  return { days: [...days], ph };
}

function intervalsOf(text: string): Interval[] | "off" | null {
  const t = text.trim();
  if (t === "off" || t === "closed") return "off";
  const out: Interval[] = [];
  for (const raw of t.split(",")) {
    const m = /^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/.exec(raw.trim());
    if (!m) return null;
    const [h1, m1, h2, m2] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
    if (h1 > 24 || h2 > 24 || m1 > 59 || m2 > 59) return null;
    const start = h1 * 60 + m1;
    let end = h2 * 60 + m2;
    if (end <= start) end += 1440; // cruza la medianoche
    out.push({ start, end });
  }
  return out.length ? out : null;
}

/** `null` = no se pudo interpretar con certeza («horario sin confirmar»). */
export function parseOpeningHours(raw: string | null | undefined): ParsedHours | null {
  if (!raw) return null;
  const text = raw.trim();
  if (!text) return null;
  if (text === "24/7") return { days: Array.from({ length: 7 }, () => [{ start: 0, end: 1440 }]), holidayCaveat: false };
  if (/["@]|sunrise|sunset|dawn|dusk|week|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|open|\bby appointment\b/i.test(text)) return null;

  const days: Interval[][] = Array.from({ length: 7 }, () => []);
  let holidayCaveat = false;
  let anyRule = false;
  for (const rule of text.split(SPLIT_RULES)) {
    const r = rule.trim();
    if (!r) continue;
    const m = new RegExp(`^((?:${DAY_RE}|PH)(?:-${DAY_RE})?(?:\\s*,\\s*(?:${DAY_RE}|PH)(?:-${DAY_RE})?)*)\\s+(.+)$`).exec(r);
    // Una regla sin días (solo horas) aplica a toda la semana.
    const dayPart = m ? m[1]! : null;
    const timePart = m ? m[2]! : r;
    const target = dayPart ? daysOf(dayPart) : { days: [0, 1, 2, 3, 4, 5, 6], ph: false };
    if (!target) return null;
    const iv = intervalsOf(timePart);
    if (iv === null) return null;
    if (target.ph) holidayCaveat = true;
    for (const d of target.days) days[d] = iv === "off" ? [] : iv.map((x) => ({ ...x }));
    anyRule = true;
  }
  return anyRule ? { days, holidayCaveat } : null;
}

export type OpenStatus =
  | { state: "open"; closesAt: number }
  | { state: "closed"; opensAt: number | null };

const fmt = (min: number) => `${String(Math.floor((min % 1440) / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
export const clock = fmt;

/** Tramos de ese día en minutos, incluyendo lo que ya venía abierto desde el día anterior. */
export function windowsOn(p: ParsedHours, weekday: number): Interval[] {
  const prev = p.days[(weekday + 6) % 7]!.filter((i) => i.end > 1440).map((i) => ({ start: 0, end: i.end - 1440 }));
  // Sin recortar a medianoche: un pub que cierra a las 03:30 debe decir 03:30 (el `end` puede pasar de 1440).
  const today = p.days[weekday]!.map((i) => ({ start: i.start, end: i.end }));
  return [...prev, ...today].sort((a, b) => a.start - b.start);
}

/** Estado a una hora local concreta. */
export function statusAt(p: ParsedHours, weekday: number, minute: number): OpenStatus {
  const w = windowsOn(p, weekday);
  const hit = w.find((i) => minute >= i.start && minute < i.end);
  if (hit) return { state: "open", closesAt: hit.end };
  const next = w.find((i) => i.start > minute);
  return { state: "closed", opensAt: next ? next.start : null };
}

/** ¿Cabe una visita de `duration` minutos que empieza en `start` dentro de un mismo tramo abierto? */
export function fits(p: ParsedHours, weekday: number, start: number, duration: number): boolean {
  return windowsOn(p, weekday).some((i) => start >= i.start && start + duration <= i.end);
}

/** Primer momento en que cabe una visita de `duration` min a partir de `from`, o null ese día. */
export function earliestFit(p: ParsedHours, weekday: number, from: number, duration: number): number | null {
  for (const i of windowsOn(p, weekday)) {
    const start = Math.max(from, i.start);
    if (start + duration <= i.end) return start;
  }
  return null;
}

/** Día de la semana (0 = lunes) de una fecha ISO «AAAA-MM-DD», sin depender de la zona horaria del servidor. */
export function weekdayOf(isoDate: string): number {
  const d = new Date(`${isoDate}T12:00:00Z`);
  return (d.getUTCDay() + 6) % 7;
}
