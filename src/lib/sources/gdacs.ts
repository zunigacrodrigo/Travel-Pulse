/**
 * Eventos de desastres naturales del GDACS (Global Disaster Alert and Coordination System,
 * ONU + Comisión Europea). Forma verificada contra la API real (31-oct-2026):
 *   FeatureCollection { features[] }, cada feature con geometry Point [lon, lat] y properties:
 *   eventtype (EQ|TC|FL|VO|WF|DR), eventid, episodeid, name, alertlevel (Green|Orange|Red),
 *   alertscore, country, fromdate, todate (ISO sin zona, UTC), datemodified, iscurrent ("true"|"false"),
 *   url{report}, severitydata{severity, severitytext}.
 * La API devuelve como máximo 100 eventos por página y acepta `pagenumber`.
 *
 * Los sismos NO se piden aquí: ya los cubre el USGS con más detalle.
 */
import { fetchJson, type FetchOptions } from "./http";
import { haversineKm } from "./usgs";

export const GDACS_SOURCE_ID = "gdacs";
export const GDACS_DEFAULT_BASE = "https://www.gdacs.org";

export type HazardType = "TC" | "FL" | "VO" | "WF";
export type AlertLevel = "Green" | "Orange" | "Red";

export const HAZARD_LABEL: Record<HazardType, string> = {
  TC: "Ciclón tropical",
  FL: "Inundación",
  VO: "Volcán",
  WF: "Incendio forestal",
};

/** Radio (km) dentro del cual un evento se considera «cerca» de un destino. */
export const HAZARD_RADIUS_KM: Record<HazardType, number> = { TC: 600, FL: 300, VO: 150, WF: 150 };

export interface Hazard {
  id: string;
  type: HazardType;
  name: string;
  alertLevel: AlertLevel;
  country: string;
  lat: number;
  lon: number;
  /** ISO 8601 UTC. */
  from: string;
  to: string | null;
  modified: string | null;
  current: boolean;
  severityText: string | null;
  reportUrl: string | null;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const TYPES: ReadonlySet<string> = new Set(["TC", "FL", "VO", "WF"]);
const LEVELS: ReadonlySet<string> = new Set(["Green", "Orange", "Red"]);

/** GDACS entrega fechas sin zona (UTC). */
function toIso(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const ms = Date.parse(/[zZ]|[+-]\d{2}:?\d{2}$/.test(s) ? s : `${s}Z`);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

/** Interpreta un FeatureCollection de GDACS. Descarta lo incompleto; null si no es una colección. */
export function parseHazards(raw: unknown): Hazard[] | null {
  if (!isRecord(raw) || !Array.isArray(raw.features)) return null;
  const out: Hazard[] = [];
  for (const f of raw.features) {
    if (!isRecord(f) || !isRecord(f.properties) || !isRecord(f.geometry) || f.geometry.type !== "Point") continue;
    const p = f.properties;
    const c = f.geometry.coordinates;
    if (!Array.isArray(c)) continue;
    const lon = num(c[0]);
    const lat = num(c[1]);
    const type = str(p.eventtype);
    const level = str(p.alertlevel);
    const from = toIso(p.fromdate);
    if (lon === null || lat === null || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    if (!type || !TYPES.has(type) || !level || !LEVELS.has(level) || !from) continue;
    const sev = isRecord(p.severitydata) ? str(p.severitydata.severitytext) : null;
    const url = isRecord(p.url) ? str(p.url.report) : null;
    out.push({
      id: `${type}-${String(p.eventid)}`,
      type: type as HazardType,
      name: str(p.name) ?? HAZARD_LABEL[type as HazardType],
      alertLevel: level as AlertLevel,
      country: str(p.country) ?? "",
      lat,
      lon,
      from,
      to: toIso(p.todate),
      modified: toIso(p.datemodified),
      current: str(p.iscurrent) === "true",
      severityText: sev,
      reportUrl: url && url.startsWith("https://") ? url : null,
    });
  }
  return out;
}

const SEARCH = "/gdacsapi/api/events/geteventlist/SEARCH";
const day = (d: Date) => d.toISOString().slice(0, 10);

/** Trae lo reciente de cada tipo con la paginación de GDACS. Un tipo que falla no tumba a los demás. */
export async function fetchHazards(
  now: Date,
  opts: FetchOptions & { base?: string; days?: number; maxPages?: number } = {},
): Promise<Hazard[]> {
  const { base = GDACS_DEFAULT_BASE, days = 30, maxPages = 3, ...rest } = opts;
  const range = `fromdate=${day(new Date(now.getTime() - days * 86_400_000))}&todate=${day(now)}`;
  // Incendios: solo Naranja y Rojo (los verdes son cientos de focos menores).
  const jobs: Array<[HazardType, string]> = [
    ["TC", "Green;Orange;Red"],
    ["FL", "Green;Orange;Red"],
    ["VO", "Green;Orange;Red"],
    ["WF", "Orange;Red"],
  ];
  const all: Hazard[] = [];
  const seen = new Set<string>();
  let failures = 0;
  let lastError: unknown = null;
  await Promise.all(
    jobs.map(async ([type, levels]) => {
      for (let page = 1; page <= maxPages; page++) {
        try {
          const raw = await fetchJson(`${base}${SEARCH}?eventlist=${type}&alertlevel=${levels}&${range}&pagenumber=${page}`, { timeoutMs: 10_000, ...rest });
          if (raw === null) break; // 204: no hay eventos de este tipo en el periodo
          const rows = parseHazards(raw);
          if (!rows) throw new Error("Respuesta GDACS no interpretable");
          for (const h of rows) {
            if (seen.has(h.id)) continue;
            seen.add(h.id);
            all.push(h);
          }
          if (!isRecord(raw) || !Array.isArray(raw.features) || raw.features.length < 100) break;
        } catch (e) {
          failures += 1;
          lastError = e;
          break;
        }
      }
    }),
  );
  if (failures === jobs.length) throw lastError instanceof Error ? lastError : new Error("GDACS sin respuesta");
  return all.sort((a, b) => b.from.localeCompare(a.from));
}

export interface HazardNear extends Hazard {
  distanceKm: number;
}

const RANK: Record<AlertLevel, number> = { Green: 0, Orange: 1, Red: 2 };

/** Eventos vigentes dentro del radio de su tipo. Más graves y más cercanos primero. */
export function hazardsNear(hazards: readonly Hazard[], lat: number, lon: number, now: Date): HazardNear[] {
  const out: HazardNear[] = [];
  for (const h of hazards) {
    if (!h.current) continue;
    if (h.to && Date.parse(h.to) < now.getTime() - 2 * 86_400_000) continue;
    const distanceKm = haversineKm(lat, lon, h.lat, h.lon);
    if (distanceKm > HAZARD_RADIUS_KM[h.type]) continue;
    out.push({ ...h, distanceKm: Math.round(distanceKm) });
  }
  return out.sort((a, b) => RANK[b.alertLevel] - RANK[a.alertLevel] || a.distanceKm - b.distanceKm);
}
