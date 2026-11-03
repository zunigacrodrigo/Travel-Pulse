/**
 * Contrasta un itinerario (p. ej. el de ChatGPT) con la realidad y decide qué hacer con cada parada.
 * Solo usa datos con fuente: horario de OpenStreetMap, traslados de OSRM, pronóstico de Open-Meteo.
 * Si un dato falta se dice «sin confirmar»; jamás se supone abierto ni seco.
 */
import { clock, statusAt, windowsOn, weekdayOf, type ParsedHours } from "@/lib/day/openingHours";
import { rainRiskBetween, type HourWeather } from "@/lib/day/weather";

export type Action = "mantener" | "confirmar" | "mover" | "cambiar";

export interface StopInput {
  name: string;
  /** Hora pedida en el itinerario (minutos) o null. */
  plannedStart: number | null;
  durationMin: number;
  found: null | {
    matchedName: string; lat: number; lon: number; category: string; type: string;
    hoursRaw: string | null; hours: ParsedHours | null; confidence: "alta" | "dudosa";
  };
}

export interface Leg { minutes: number; mode: "foot" | "car" }

export interface StopVerdict {
  name: string;
  matchedName: string | null;
  start: number; end: number;
  action: Action;
  /** Frase corta que le dice al viajero qué hacer. */
  headline: string;
  /** Hechos con fuente, uno por línea. */
  facts: string[];
  /** Lo que no se pudo verificar. */
  unknown: string[];
  legFromPrev: Leg | null;
}

export interface Verdict {
  stops: StopVerdict[];
  summary: string;
  /** Lo primero que debe hacer el viajero. */
  firstStep: string;
  sunsetMin: number | null;
  rainWindows: string | null;
}

const OUTDOOR_TYPES = new Set(["viewpoint", "park", "garden", "attraction", "picnic_site", "pitch", "playground"]);
export const isOutdoor = (category: string, type: string) =>
  OUTDOOR_TYPES.has(type) || category === "leisure" || (category === "tourism" && type === "viewpoint");

const RANK: Record<Action, number> = { mantener: 0, confirmar: 1, mover: 2, cambiar: 3 };
const worse = (a: Action, b: Action): Action => (RANK[b] > RANK[a] ? b : a);

export interface VerifyInput {
  isoDate: string;
  dayStart: number;
  stops: StopInput[];
  /** Tramos entre paradas consecutivas (legs[i] va de i a i+1); null si no hubo ruta. */
  legs: (Leg | null)[];
  hours: HourWeather[] | null;
  sunsetMin: number | null;
}

export function verifyItinerary(v: VerifyInput): Verdict {
  const wd = weekdayOf(v.isoDate);
  const stops: StopVerdict[] = [];
  let cursor = v.dayStart;

  v.stops.forEach((s, i) => {
    const leg = i > 0 ? (v.legs[i - 1] ?? null) : null;
    const arrive = leg ? cursor + leg.minutes : cursor;
    const start = s.plannedStart !== null ? Math.max(s.plannedStart, 0) : arrive;
    const end = start + s.durationMin;
    const facts: string[] = [];
    const unknown: string[] = [];
    let action: Action = "mantener";
    let headline = "Va como está.";

    if (leg) {
      facts.push(`Traslado real desde la parada anterior: ${leg.minutes} min ${leg.mode === "foot" ? "a pie" : "en auto (sin tráfico)"}.`);
      if (s.plannedStart !== null && arrive > s.plannedStart) {
        action = worse(action, "mover");
        headline = `No llegas a las ${clock(s.plannedStart)}: llegarías a las ${clock(arrive)}.`;
      }
    }

    if (!s.found) {
      action = worse(action, "confirmar");
      unknown.push("No encontré este lugar en el mapa: confirma el nombre o la dirección.");
      headline = "No pude ubicarlo en el mapa: confírmalo antes.";
    } else {
      const f = s.found;
      if (f.confidence === "dudosa") {
        action = worse(action, "confirmar");
        unknown.push(`El mapa lo encontró como «${f.matchedName}»; puede no ser el mismo lugar.`);
      }
      if (f.hours) {
        const w = windowsOn(f.hours, wd).map((x) => `${clock(x.start)}–${clock(x.end)}`).join(", ");
        facts.push(`Horario en OpenStreetMap (${f.hoursRaw}): ${w || "cerrado ese día"}.`);
        const atStart = statusAt(f.hours, wd, start);
        const atEnd = statusAt(f.hours, wd, Math.max(start, end - 1));
        if (atStart.state === "closed" || atEnd.state === "closed") {
          action = worse(action, "mover");
          headline = w ? `Estaría cerrado a esa hora. Abre: ${w}.` : "Estaría cerrado ese día.";
        }
      } else {
        unknown.push("Horario sin confirmar: OpenStreetMap no lo trae. Mira el sitio oficial antes de ir.");
        action = worse(action, "confirmar");
        if (action === "confirmar" && headline === "Va como está.") headline = "Confirma el horario antes de ir.";
      }
      if (v.hours && isOutdoor(f.category, f.type)) {
        if (rainRiskBetween(v.hours, start, end)) {
          const p = Math.max(0, ...v.hours.filter((h) => h.hour * 60 < end && (h.hour + 1) * 60 > start).map((h) => h.rainProb ?? 0));
          facts.push(`Es al aire libre y hay ${p}% de probabilidad de lluvia en ese tramo.`);
          action = worse(action, "mover");
          headline = "Al aire libre y con lluvia probable: muévelo a otra hora o ten plan bajo techo.";
        } else facts.push("Al aire libre; sin lluvia probable en ese tramo.");
        if (v.sunsetMin !== null && f.type === "viewpoint") {
          facts.push(`Atardece a las ${clock(v.sunsetMin)}.`);
          if (end < v.sunsetMin - 90 || start > v.sunsetMin) {
            action = worse(action, "mover");
            headline = `Un mirador rinde al atardecer (${clock(v.sunsetMin)}): ponlo entre ${clock(v.sunsetMin - 45)} y ${clock(v.sunsetMin + 15)}.`;
          }
        }
      } else if (!v.hours && isOutdoor(f.category, f.type)) unknown.push("Sin pronóstico disponible: no sé si lloverá.");
    }
    stops.push({ name: s.name, matchedName: s.found?.matchedName ?? null, start, end, action, headline, facts, unknown, legFromPrev: leg });
    cursor = end;
  });

  const bad = stops.filter((s) => s.action === "mover" || s.action === "cambiar");
  const check = stops.filter((s) => s.action === "confirmar");
  const first = bad[0] ?? check[0];
  const summary = bad.length
    ? `${bad.length} de ${stops.length} paradas necesitan cambio y ${check.length} confirmación.`
    : check.length ? `El orden funciona; confirma ${check.length} dato(s) antes de salir.` : "El itinerario se sostiene con los datos disponibles.";
  return {
    stops, summary,
    firstStep: first ? `${first.name}: ${first.headline}` : "Sal con este orden.",
    sunsetMin: v.sunsetMin,
    rainWindows: v.hours ? null : "Sin pronóstico disponible ahora mismo.",
  };
}
