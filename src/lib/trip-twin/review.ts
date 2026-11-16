/**
 * «Revisar con datos de hoy»: contrasta un viaje armado en Mi día con horarios y pronóstico recién consultados.
 * Función pura: recibe los datos ya consultados y devuelve hallazgos y, cuando se puede, una propuesta.
 *
 * Reglas:
 *  - Nada se aplica solo. Cada hallazgo trae lo necesario para que la persona decida (antes/después, motivo).
 *  - Una propuesta de horario solo se ofrece si su vista previa NO agrega conflictos duros al plan.
 *  - Lo que no se pudo consultar se declara en `notes`; jamás se rellena ni se supone.
 *  - Un horario que la fuente ya no trae o no se puede interpretar NO borra el que había: no se declara «cerrado».
 */
import { KIND_META, type Kind } from "@/lib/day/places";
import { clock, parseOpeningHours, weekdayOf, windowsOn } from "@/lib/day/openingHours";
import { rainRiskBetween, type HourWeather } from "@/lib/day/weather";
import { buildTripPlan, replanTrip } from "./engine";
import { zonedIso } from "./import";
import type { Activity, Evidence, PlanChange, Trip, TripPlan } from "./types";

export type FreshHoursMap = Record<string, { hoursRaw: string | null }>;

export interface ReviewInput {
  trip: Trip;
  activities: Activity[];
  plan: TripPlan;
  /** Fecha local del día revisado (AAAA-MM-DD). */
  date: string;
  weather: HourWeather[] | null;
  freshHours: FreshHoursMap;
  /** Hora de la consulta (ISO). */
  now: string;
}

export interface RainFinding {
  id: string; kind: "lluvia"; activityId: string; activityName: string; message: string;
  /** Un retraso hasta una hora seca donde cabe; null si no hay una opción segura. */
  proposal: { label: string; change: PlanChange; newStart: string } | null;
}
export interface HoursFinding {
  id: string; kind: "horario"; activityId: string; activityName: string; message: string;
  before: string; after: string;
  /** Datos nuevos de la actividad, con su fuente y la hora de la consulta. */
  patch: { openingHours: NonNullable<Activity["openingHours"]>; hoursEvidence: Evidence };
}
export type Finding = RainFinding | HoursFinding;

export interface ReviewResult { findings: Finding[]; notes: string[] }

const MAX_SHIFT_MIN = 6 * 60;
const STEP_MIN = 15;

/** Minutos desde medianoche, hora local de la zona del viaje. */
function localMinutes(isoStr: string, tz: string): number {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(isoStr)).map((x) => [x.type, x.value]));
  return Number(p.hour) * 60 + Number(p.minute);
}

function kindOf(category: string | undefined): Kind | null {
  const hit = (Object.entries(KIND_META) as [Kind, (typeof KIND_META)[Kind]][]).find(([, m]) => m.label === category);
  return hit ? hit[0] : null;
}

const hardCount = (p: TripPlan) => p.violations.filter((v) => v.severity === "hard").length;
const span = (w: { start: string; end: string }[] | undefined, tz: string) =>
  (w ?? []).map((x) => `${clock(localMinutes(x.start, tz))}–${clock(localMinutes(x.end, tz))}`).join(", ");

export function reviewTrip(input: ReviewInput): ReviewResult {
  const { trip, activities, plan, date, weather, freshHours, now } = input;
  const tz = trip.timeZone;
  const findings: Finding[] = [];
  const notes: string[] = [];
  const byId = new Map(activities.map((a) => [a.id, a]));

  // ---- Horarios ----
  if (Object.keys(freshHours).length === 0) notes.push("No se pudieron verificar los horarios con datos de hoy: se conservan los que ya tenías.");
  const wd = weekdayOf(date);
  for (const a of activities) {
    const pid = a.location.placeId;
    const f = pid ? freshHours[pid] : undefined;
    if (!f || !f.hoursRaw) continue;                       // la fuente no devolvió el lugar o ya no trae horario: no se toca
    const parsed = parseOpeningHours(f.hoursRaw);
    if (!parsed) continue;                                 // no interpretable: no se toca
    const windows = windowsOn(parsed, wd);
    if (windows.length === 0) continue;                    // ese día no figura abierto en la fuente: no se afirma «cerrado» sin más
    const next = windows.map((w) => ({ start: zonedIso(date, w.start, tz), end: zonedIso(date, w.end, tz) }));
    const same = a.openingHours && a.openingHours.length === next.length
      && a.openingHours.every((w, i) => Date.parse(w.start) === Date.parse(next[i]!.start) && Date.parse(w.end) === Date.parse(next[i]!.end));
    if (same) continue;
    const patch = { openingHours: next, hoursEvidence: { status: "verified" as const, sourceId: "openstreetmap", observedAt: now, expiresAt: null } };
    const patched = activities.map((x) => (x.id === a.id ? { ...x, ...patch } : x));
    const after = buildTripPlan(trip, patched, { now });
    const breaks = after.violations.some((v) => v.code === "OUTSIDE_OPENING_HOURS" && v.activityIds.includes(a.id));
    const before = span(a.openingHours, tz) || "sin horario conocido";
    const afterTxt = span(next, tz);
    findings.push({
      id: `horario-${a.id}`, kind: "horario", activityId: a.id, activityName: a.name, before, after: afterTxt, patch,
      message: breaks
        ? `El horario de ${a.name} cambió (antes ${before}, ahora ${afterTxt}) y ya no cabe a la hora planeada.`
        : `El horario de ${a.name} cambió (antes ${before}, ahora ${afterTxt}); tu plan sigue cabiendo.`,
    });
  }

  // ---- Lluvia ----
  if (!weather) {
    notes.push("No se evaluó la lluvia: no hay pronóstico por hora para esa fecha.");
  } else {
    for (const item of plan.items) {
      if (item.status === "cancelled") continue;
      const a = byId.get(item.activityId);
      const kind = a ? kindOf(a.category) : null;
      if (!a || !kind || KIND_META[kind].indoor) continue;
      if (localDateOf(item.plannedStart, tz) !== date) continue; // el pronóstico es de un solo día
      const s = localMinutes(item.plannedStart, tz), e = localMinutes(item.plannedEnd, tz);
      if (!rainRiskBetween(weather, s, e)) continue;
      const peak = Math.max(0, ...weather.filter((h) => h.hour * 60 < e && (h.hour + 1) * 60 > s).map((h) => h.rainProb ?? 0));
      const proposal = rainProposal(input, a, s, e);
      findings.push({
        id: `lluvia-${a.id}`, kind: "lluvia", activityId: a.id, activityName: a.name, proposal,
        message: proposal
          ? `${a.name} es al aire libre y hay hasta ${peak} % de probabilidad de lluvia a esa hora (${clock(s)}–${clock(e)}). Hay una hora sin lluvia probable: ${proposal.label.toLowerCase()}.`
          : `${a.name} es al aire libre y hay hasta ${peak} % de probabilidad de lluvia a esa hora (${clock(s)}–${clock(e)}). No encontré una hora sin lluvia probable donde quepa sin agregar conflictos; decide si la mantienes o la cambias por algo bajo techo.`,
      });
    }
  }
  findings.sort((x, y) => (x.kind === y.kind ? 0 : x.kind === "horario" ? -1 : 1));
  return { findings, notes };
}

function localDateOf(isoStr: string, tz: string): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(isoStr)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

/** La menor demora (múltiplo de 15 min, hasta 6 h) que deja la visita sin lluvia probable y sin agregar conflictos duros. */
function rainProposal(input: ReviewInput, a: Activity, s: number, e: number): RainFinding["proposal"] {
  if (a.importance === "fixed") return null;
  const { trip, activities, plan, weather, now } = input;
  const baseHard = hardCount(plan);
  for (let shift = STEP_MIN; shift <= MAX_SHIFT_MIN; shift += STEP_MIN) {
    if (rainRiskBetween(weather!, s + shift, e + shift)) continue;
    const change: PlanChange = { type: "delay", activityId: a.id, delayMinutes: shift };
    try {
      const after = replanTrip(trip, activities, plan, change, now).plan;
      if (hardCount(after) > baseHard) continue;
      const moved = after.items.find((i) => i.activityId === a.id);
      if (!moved) continue;
      const ms = localMinutes(moved.plannedStart, trip.timeZone), me = localMinutes(moved.plannedEnd, trip.timeZone);
      if (rainRiskBetween(weather!, ms, me)) continue;      // el motor pudo moverla distinto de lo previsto: se verifica el resultado real
      return { label: `Retrasar a las ${clock(ms)}`, change, newStart: moved.plannedStart };
    } catch { return null; }
  }
  return null;
}
