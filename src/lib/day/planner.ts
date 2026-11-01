/**
 * Planificador de «Mi día en la ciudad». Determinista y explicable: cada decisión trae su motivo.
 *
 * Reglas:
 *  - Una visita se programa solo si cabe ENTERA dentro de un horario de apertura conocido.
 *  - Si el horario es desconocido, se programa pero queda «sin confirmar» (nunca se supone abierto).
 *  - Los traslados son tiempos reales (a pie si ≤ 20 min, si no en auto sin tráfico). Sin dato de
 *    traslado se reservan 30 min y se avisa.
 *  - Duraciones por tipo son SUPUESTOS declarados (museo 90 min, restaurante 75…), no datos.
 *  - Con lluvia probable, lo que es al aire libre se marca; «reemplazar por techo» cambia los parques por
 *    museos o galerías. Nada se cambia sin que la persona lo pida.
 */
import { KIND_META, type Kind, type Place } from "./places";
import { earliestFit, statusAt, windowsOn, weekdayOf, clock } from "./openingHours";
import { leg, type Mode } from "./routing";
import { rainRiskBetween, type HourWeather } from "./weather";

/** Hora más temprana razonable por tipo (minutos). El almuerzo no va a las 11 ni el pub a las 15. */
export const EARLIEST: Partial<Record<Kind, number>> = { restaurante: 12 * 60 + 30, pub: 18 * 60 + 30 };
export const FALLBACK_TRAVEL_MIN = 30;
const MAX_COMFORT_TRAVEL = 40;
/** Espera máxima razonable hasta que un lugar abra. Un «almuerzo» que abre a las 18:00 no sirve, salvo que no haya otra opción. */
export const MAX_WAIT_MIN = 60;

export interface Wish {
  kind: Kind;
  /** Lugar elegido por la persona; si se puede visitar, se respeta. */
  pin?: string;
  /** No antes de esta hora (minutos). */
  minStart?: number;
}

export interface TravelData {
  /** Índice 0 = punto de partida; luego cada lugar en el orden de `ids`. */
  ids: string[];
  foot: number[][] | null;
  car: number[][] | null;
}

export interface DayRequest {
  date: string;
  startMin: number;
  endMin: number;
  wishes: Wish[];
  candidates: Record<Kind, Place[]>;
  travel: TravelData;
  weather: HourWeather[] | null;
}

export type Confidence = "abierto" | "sin_confirmar";

export interface Stop {
  place: Place;
  wish: Wish;
  /** Posición del deseo en la lista que envió la persona (para cambiarlo o quitarlo). */
  wishIndex: number;
  startMin: number;
  endMin: number;
  /** Traslado desde el punto anterior (null = sin dato, se reservó el tiempo de respaldo). */
  travel: { minutes: number; mode: Mode } | null;
  status: Confidence;
  closesAt: number | null;
  /** Probabilidad alta de lluvia durante la visita y el lugar es al aire libre. */
  rainOnVisit: boolean;
  /** Probabilidad alta de lluvia durante el traslado. */
  rainOnTravel: boolean;
  reasons: string[];
  alternatives: Alternative[];
}

export interface Alternative {
  place: Place;
  startMin: number;
  travelMin: number | null;
  status: Confidence;
}

export interface Unplaced { wish: Wish; wishIndex: number; reason: string }

export interface DayPlan {
  stops: Stop[];
  unplaced: Unplaced[];
  assumptions: string[];
  notes: string[];
}

const idx = (t: TravelData, id: string) => t.ids.indexOf(id);

function legBetween(t: TravelData, fromId: string, toId: string) {
  const i = idx(t, fromId), j = idx(t, toId);
  if (i < 0 || j < 0) return null;
  return leg(t.foot, t.car, i, j);
}

interface Slot { place: Place; start: number; end: number; travel: { minutes: number; mode: Mode } | null; status: Confidence; closesAt: number | null; wait: number }

function tryPlace(place: Place, wish: Wish, fromId: string, cursor: number, req: DayRequest, maxWait: number): Slot | { reason: string } {
  const duration = KIND_META[place.kind].durationMin;
  const tr = legBetween(req.travel, fromId, place.id);
  const minutes = tr ? tr.minutes : FALLBACK_TRAVEL_MIN;
  const earliest = Math.max(cursor + minutes, EARLIEST[place.kind] ?? 0, wish.minStart ?? 0);
  const wd = weekdayOf(req.date);
  if (place.hours) {
    const start = earliestFit(place.hours, wd, earliest, duration);
    if (start === null) {
      const anyDay = windowsOn(place.hours, wd).length > 0;
      return { reason: anyDay ? "no cabe en su horario después de esa hora" : "está cerrado ese día" };
    }
    if (start + duration > req.endMin) return { reason: "no alcanza antes de terminar el día" };
    if (start - earliest > maxWait) return { reason: `abre recién a las ${clock(start)}` };
    const st = statusAt(place.hours, wd, start);
    return { place, start, end: start + duration, travel: tr, status: "abierto", closesAt: st.state === "open" ? st.closesAt : null, wait: start - earliest };
  }
  if (earliest + duration > req.endMin) return { reason: "no alcanza antes de terminar el día" };
  return { place, start: earliest, end: earliest + duration, travel: tr, status: "sin_confirmar", closesAt: null, wait: 0 };
}

function explain(slot: Slot, fromName: string, wish: Wish, pinned: boolean): string[] {
  const out: string[] = [];
  if (pinned) out.push("Lo elegiste tú.");
  if (slot.status === "abierto") out.push(`Horario de OpenStreetMap: abierto hasta las ${clock(slot.closesAt ?? 0)} a esa hora.`);
  if (slot.wait > 30) out.push(`Abre a las ${clock(slot.start)}: habrá que esperar unos ${slot.wait} min. No había una opción abierta antes.`);
  else out.push("Horario sin confirmar: no hay un horario interpretable en OpenStreetMap. Confírmalo antes de ir o mira los reportes de viajeros.");
  if (slot.travel) out.push(`${slot.travel.minutes} min ${slot.travel.mode === "foot" ? "a pie" : "en auto (sin tráfico)"} desde ${fromName}.`);
  else out.push(`Sin dato de traslado desde ${fromName}: se reservaron ${FALLBACK_TRAVEL_MIN} min.`);
  if (EARLIEST[wish.kind] && slot.start === EARLIEST[wish.kind]) out.push(`Se programó a partir de las ${clock(EARLIEST[wish.kind]!)}, hora habitual para este tipo de lugar.`);
  return out;
}

/** Cuál de los deseos pendientes sigue. Si ya es hora de almorzar, el almuerzo va a continuación; si no, lo más temprano posible. */
export const LUNCH_FROM = 12 * 60;
export const LUNCH_UNTIL = 15 * 60 + 30;
function pickNext(pending: readonly Wish[], cursor: number): number {
  const lunch = pending.findIndex((w) => w.kind === "restaurante" && !w.minStart);
  if (lunch >= 0 && cursor >= LUNCH_FROM && cursor < LUNCH_UNTIL) return lunch;
  let best = 0;
  let bestKey = Infinity;
  pending.forEach((w, i) => {
    const key = Math.max(EARLIEST[w.kind] ?? 0, w.minStart ?? 0);
    if (key < bestKey) { best = i; bestKey = key; }
  });
  return best;
}

export function buildDay(req: DayRequest): DayPlan {
  const pending = req.wishes.map((w, i) => ({ w, i }));
  const stops: Stop[] = [];
  const unplaced: Unplaced[] = [];
  const used = new Set<string>();
  const originId = req.travel.ids[0] ?? "origen";
  let cursor = req.startMin;
  let fromId = originId;
  let fromName = "tu punto de partida";

  while (pending.length) {
    const { w: wish, i: wishIndex } = pending.splice(pickNext(pending.map((p) => p.w), cursor), 1)[0]!;
    const pool = req.candidates[wish.kind].filter((p) => !used.has(p.id));
    const ordered = wish.pin ? [...pool.filter((p) => p.id === wish.pin), ...pool.filter((p) => p.id !== wish.pin)] : pool;
    let chosen: Slot | null = null;
    let pinned = false;
    let lastReason = `no hay ${KIND_META[wish.kind].plural.toLowerCase()} disponibles en la zona`;
    const feasible: Slot[] = [];
    // Primero sin esperas largas; si no hay ninguna opción, se acepta esperar y se avisa.
    for (const maxWait of [MAX_WAIT_MIN, Infinity]) {
      for (const p of ordered) {
        const r = tryPlace(p, wish, fromId, cursor, req, maxWait);
        if ("reason" in r) { if (p.id === wish.pin) lastReason = `${p.name} ${r.reason}`; else if (!feasible.length) lastReason = `ningún ${KIND_META[wish.kind].label.toLowerCase()} cabe: ${p.name} ${r.reason}`; continue; }
        feasible.push(r);
      }
      if (feasible.length) break;
    }
    if (feasible.length) {
      const pinnedSlot = wish.pin ? feasible.find((s) => s.place.id === wish.pin) : undefined;
      chosen = pinnedSlot ?? feasible.find((s) => (s.travel?.minutes ?? FALLBACK_TRAVEL_MIN) <= MAX_COMFORT_TRAVEL) ?? [...feasible].sort((a, b) => (a.travel?.minutes ?? 99) - (b.travel?.minutes ?? 99))[0]!;
      pinned = Boolean(pinnedSlot);
    }
    if (!chosen) { unplaced.push({ wish, wishIndex, reason: lastReason }); continue; }
    const alternatives = feasible.filter((s) => s.place.id !== chosen!.place.id)
      .sort((a, b) => (a.travel?.minutes ?? 99) - (b.travel?.minutes ?? 99)).slice(0, 3)
      .map((s): Alternative => ({ place: s.place, startMin: s.start, travelMin: s.travel?.minutes ?? null, status: s.status }));
    const w = req.weather;
    const travelStart = chosen.start - (chosen.travel?.minutes ?? FALLBACK_TRAVEL_MIN);
    stops.push({
      place: chosen.place, wish, wishIndex, startMin: chosen.start, endMin: chosen.end, travel: chosen.travel,
      status: chosen.status, closesAt: chosen.closesAt,
      rainOnVisit: !chosen.place.indoor && w !== null && rainRiskBetween(w, chosen.start, chosen.end),
      rainOnTravel: w !== null && rainRiskBetween(w, Math.max(0, travelStart), chosen.start),
      reasons: explain(chosen, fromName, wish, pinned), alternatives,
    });
    used.add(chosen.place.id);
    cursor = chosen.end; fromId = chosen.place.id; fromName = chosen.place.name;
  }

  stops.sort((a, b) => a.startMin - b.startMin);
  const kinds = [...new Set(req.wishes.map((w) => w.kind))];
  return {
    stops, unplaced,
    assumptions: [
      ...kinds.map((k) => `${KIND_META[k].label}: ${KIND_META[k].durationMin} min de visita (supuesto, no un dato).`),
      "Los traslados en auto no incluyen tráfico.",
      ...(req.weather === null ? ["Sin pronóstico por hora para esa fecha: no se evaluó la lluvia."] : []),
    ],
    notes: [],
  };
}

/** «Está lloviendo»: los lugares al aire libre se cambian por museos o galerías bajo techo. Devuelve los nuevos deseos. */
export function swapOutdoorForIndoor(wishes: readonly Wish[]): { wishes: Wish[]; changes: string[] } {
  const changes: string[] = [];
  const out = wishes.map((w): Wish => {
    if (KIND_META[w.kind].indoor) return w;
    changes.push(`${KIND_META[w.kind].label} (al aire libre) → Museo (bajo techo)`);
    return { kind: "museo", minStart: w.minStart };
  });
  return { wishes: out, changes };
}

/** «Quiero un pub»: agrega un pub a partir de una hora (por defecto, cuando termina lo último del día). */
export function addStopWish(wishes: readonly Wish[], kind: Kind, minStart?: number): Wish[] {
  return [...wishes, { kind, ...(minStart !== undefined ? { minStart } : {}) }];
}
