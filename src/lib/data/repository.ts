/**
 * Capa de datos de Travel Pulse (solo servidor).
 *
 * - `memoryRepository`: usa el dataset curado (`seedDataset`) y guarda escrituras
 *   en memoria del proceso. Suficiente para demo y pruebas.
 * - `supabaseRepository`: Postgres/PostGIS en Supabase con service role.
 * - `getRepository()`: Supabase si existen SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.
 *
 * Privacidad (sección 10): solo se guarda lo necesario. La IP nunca se guarda en
 * claro: se almacena sha256(sal + ip) con la sal de IP_HASH_SALT.
 */
import { createHash, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  GAP_CRITERIA,
  type Dataset,
  type Destination,
  type DestinationMonthly,
  type DuringSignal,
  type GapRatings,
  type Interest,
  type PriceSnapshot,
  type ScoreResult,
  type Source,
  type Trend,
  type TripRequest,
} from "@/lib/types";
import { seedDataset, withMonthContext } from "./seed";

if (typeof window !== "undefined") {
  throw new Error("src/lib/data/repository solo puede usarse en el servidor.");
}

/* ------------------------------------------------------------------ */
/* Contrato                                                            */
/* ------------------------------------------------------------------ */

/** Quién hace la acción. Ambos opcionales; nunca datos personales adicionales. */
export interface Actor {
  userId?: string | null;
  anonId?: string | null;
}

export interface OutboundClickInput extends Actor {
  destinationId: string;
  /** Tipo de enlace, p. ej. "vuelos", "hoteles". */
  kind: string;
  url: string;
  requestId?: string | null;
  /** IP del cliente; se guarda solo como hash con sal. */
  ip?: string | null;
}

export interface ExpectationInput extends Actor {
  destinationId: string;
  ratings: GapRatings;
}

export interface ExperienceInput extends Actor {
  destinationId: string;
  ratings: GapRatings;
  /** Expectativa declarada al cerrar el viaje, si no hubo una previa. */
  expected?: GapRatings;
  phrase?: string;
}

export interface DuringSignalInput extends Actor {
  destinationId: string;
  signal: DuringSignal;
}

export interface DataRepository {
  /** Dataset para un origen: precios de ese origen y `prevMonthSaturation` del mes. */
  getDataset(origin: string, month: number): Promise<Dataset>;
  getDestination(id: string): Promise<Destination | null>;
  getSources(): Promise<Source[]>;
  saveTripRequest(req: TripRequest, actor?: Actor): Promise<string>;
  saveRecommendations(requestId: string, results: ScoreResult[]): Promise<void>;
  logOutboundClick(input: OutboundClickInput): Promise<void>;
  saveExpectation(input: ExpectationInput): Promise<void>;
  /** Guarda la experiencia y devuelve el gap individual si se pudo calcular. */
  saveExperience(input: ExperienceInput): Promise<number | null>;
  saveDuringSignal(input: DuringSignalInput): Promise<void>;
  /** Gaps individuales (media r - e) del destino. Publicar solo si length >= 10. */
  getGapsForDestination(id: string): Promise<number[]>;
  logEvent(name: string, props?: Record<string, unknown>, actor?: Actor): Promise<void>;
}

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */

export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const salt = process.env.IP_HASH_SALT ?? "travel-pulse-dev-salt";
  return createHash("sha256").update(`${salt}:${ip.trim()}`).digest("hex");
}

function assertRatings(r: GapRatings): void {
  for (const k of GAP_CRITERIA) {
    const v = r[k];
    if (!Number.isInteger(v) || v < 1 || v > 10) {
      throw new RangeError(`Valoración fuera de rango para "${k}": debe ser un entero de 1 a 10.`);
    }
  }
}

/** G = media(r_k - e_k), redondeado a 2 decimales. */
export function computeGapValue(real: GapRatings, expected: GapRatings): number {
  const sum = GAP_CRITERIA.reduce((acc, k) => acc + (real[k] - expected[k]), 0);
  return Math.round((sum / GAP_CRITERIA.length) * 100) / 100;
}

function cleanPhrase(p: string | undefined): string | null {
  if (!p) return null;
  const t = p.replace(/[\u0000-\u001F\u007F<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, 280);
  return t.length ? t : null;
}

const EVENT_NAME = /^[a-z0-9_.:-]{1,64}$/;
const ANON_ID = /^[A-Za-z0-9_-]{8,64}$/;
const cleanAnon = (a: string | null | undefined) => (a && ANON_ID.test(a) ? a : null);

function sameActor(a: Actor, b: Actor): boolean {
  if (a.userId && b.userId) return a.userId === b.userId;
  if (a.anonId && b.anonId) return a.anonId === b.anonId;
  return false;
}

/* ------------------------------------------------------------------ */
/* Repositorio en memoria                                              */
/* ------------------------------------------------------------------ */

interface StoredTripRequest extends TripRequest, Actor {
  id: string;
  createdAt: string;
}
interface StoredExpectation extends ExpectationInput {
  createdAt: string;
}
interface StoredExperience extends Omit<ExperienceInput, "phrase"> {
  phrase: string | null;
  gap: number | null;
  createdAt: string;
}

/** Almacenamiento del proceso. Se reinicia con cada despliegue. */
export const memoryStore = {
  tripRequests: [] as StoredTripRequest[],
  recommendations: [] as Array<{ requestId: string; rank: number; result: ScoreResult; createdAt: string }>,
  outboundClicks: [] as Array<Omit<OutboundClickInput, "ip"> & { ipHash: string | null; createdAt: string }>,
  expectations: [] as StoredExpectation[],
  experiences: [] as StoredExperience[],
  duringSignals: [] as Array<DuringSignalInput & { createdAt: string }>,
  events: [] as Array<{ name: string; props: Record<string, unknown>; createdAt: string } & Actor>,
};

export function resetMemoryStore(): void {
  for (const arr of Object.values(memoryStore)) arr.length = 0;
}

const now = () => new Date().toISOString();

export const memoryRepository: DataRepository = {
  async getDataset(origin, month) {
    return withMonthContext(seedDataset, origin.toUpperCase(), month);
  },
  async getDestination(id) {
    return seedDataset.destinations.find((d) => d.id === id.toUpperCase()) ?? null;
  },
  async getSources() {
    return seedDataset.sources;
  },
  async saveTripRequest(req, actor = {}) {
    const id = randomUUID();
    memoryStore.tripRequests.push({
      ...req,
      interests: [...req.interests],
      userId: actor.userId ?? null,
      anonId: cleanAnon(actor.anonId),
      id,
      createdAt: now(),
    });
    return id;
  },
  async saveRecommendations(requestId, results) {
    const createdAt = now();
    results.forEach((result, i) => memoryStore.recommendations.push({ requestId, rank: i + 1, result, createdAt }));
  },
  async logOutboundClick({ ip, ...input }) {
    memoryStore.outboundClicks.push({ ...input, anonId: cleanAnon(input.anonId), ipHash: hashIp(ip), createdAt: now() });
  },
  async saveExpectation(input) {
    assertRatings(input.ratings);
    memoryStore.expectations.push({ ...input, anonId: cleanAnon(input.anonId), createdAt: now() });
  },
  async saveExperience(input) {
    assertRatings(input.ratings);
    if (input.expected) assertRatings(input.expected);
    const prior = [...memoryStore.expectations]
      .reverse()
      .find((e) => e.destinationId === input.destinationId && sameActor(e, input));
    const expected = input.expected ?? prior?.ratings;
    const gap = expected ? computeGapValue(input.ratings, expected) : null;
    memoryStore.experiences.push({
      ...input,
      anonId: cleanAnon(input.anonId),
      expected,
      phrase: cleanPhrase(input.phrase),
      gap,
      createdAt: now(),
    });
    return gap;
  },
  async saveDuringSignal(input) {
    memoryStore.duringSignals.push({ ...input, anonId: cleanAnon(input.anonId), createdAt: now() });
  },
  async getGapsForDestination(id) {
    return memoryStore.experiences
      .filter((e) => e.destinationId === id && e.gap !== null)
      .map((e) => e.gap as number);
  },
  async logEvent(name, props = {}, actor = {}) {
    if (!EVENT_NAME.test(name)) return;
    memoryStore.events.push({ name, props, userId: actor.userId ?? null, anonId: cleanAnon(actor.anonId), createdAt: now() });
  },
};

/* ------------------------------------------------------------------ */
/* Repositorio Supabase                                                */
/* ------------------------------------------------------------------ */

interface SourceRow { id: string; name: string; license: string; max_age_days: number; reliability: number | string; url: string | null }
interface DestinationRow {
  id: string; name: string; country: string; lat: number; lon: number; altitude_m: number;
  tags: Record<Interest, number>; risk_level: 1 | 2 | 3 | 4 | null; risk_source_id: string; risk_observed_at: string;
  risk_reasons: string[]; similar_ids: string[]; blurb: string; poster: Destination["poster"];
}
interface ConnectivityRow {
  destination_id: string; origin: string; direct_flights: boolean; flight_hours: number | string;
  weekly_frequency: number; source_id: string; observed_at: string;
}
interface MonthlyRow {
  destination_id: string; month: number;
  season: number | null; season_source_id: string; season_observed_at: string;
  saturation: number | null; saturation_source_id: string; saturation_observed_at: string;
  daily_cost_usd: number | string | null; daily_cost_source_id: string; daily_cost_observed_at: string;
  temp_c: number | string | null; rain_mm: number | string | null; wind_kmh: number | string | null;
  climate_source_id: string; climate_observed_at: string;
}
interface PriceRow {
  destination_id: string; origin: string; month: number;
  flight_usd: number | string | null; flight_source_id: string; flight_observed_at: string;
  usual_flight_usd: number | string | null; usual_source_id: string; usual_observed_at: string;
}
interface TrendRow {
  destination_id: string;
  price_change_30d_pct: number | string | null; price_source_id: string; price_observed_at: string;
  interest_change_30d_pct: number | string | null; interest_source_id: string; interest_observed_at: string;
}

/** Postgres numeric llega como string en supabase-js. */
const num = (v: number | string | null): number | null => (v === null ? null : Number(v));

export function mapSource(r: SourceRow): Source {
  const s: Source = { id: r.id, name: r.name, license: r.license, maxAgeDays: r.max_age_days, reliability: Number(r.reliability) };
  if (r.url) s.url = r.url;
  return s;
}

export function mapDestination(r: DestinationRow, conn: ConnectivityRow[]): Destination {
  return {
    id: r.id,
    name: r.name,
    country: r.country,
    lat: r.lat,
    lon: r.lon,
    altitudeM: r.altitude_m,
    tags: r.tags,
    riskLevel: { value: r.risk_level, sourceId: r.risk_source_id, observedAt: r.risk_observed_at },
    riskReasons: r.risk_reasons ?? [],
    connectivity: Object.fromEntries(
      conn.map((c) => [
        c.origin,
        {
          value: { directFlights: c.direct_flights, flightHours: Number(c.flight_hours), weeklyFrequency: c.weekly_frequency },
          sourceId: c.source_id,
          observedAt: c.observed_at,
        },
      ]),
    ),
    similar: r.similar_ids ?? [],
    blurb: r.blurb,
    poster: r.poster,
  };
}

export function mapMonthly(r: MonthlyRow): DestinationMonthly {
  const hasClimate = r.temp_c !== null && r.rain_mm !== null && r.wind_kmh !== null;
  return {
    destinationId: r.destination_id,
    month: r.month,
    season: { value: r.season, sourceId: r.season_source_id, observedAt: r.season_observed_at },
    saturation: { value: r.saturation, sourceId: r.saturation_source_id, observedAt: r.saturation_observed_at },
    dailyCostUsd: { value: num(r.daily_cost_usd), sourceId: r.daily_cost_source_id, observedAt: r.daily_cost_observed_at },
    climate: {
      value: hasClimate ? { tempC: Number(r.temp_c), rainMm: Number(r.rain_mm), windKmh: Number(r.wind_kmh) } : null,
      sourceId: r.climate_source_id,
      observedAt: r.climate_observed_at,
    },
  };
}

export function mapPrice(r: PriceRow): PriceSnapshot {
  return {
    destinationId: r.destination_id,
    origin: r.origin,
    month: r.month,
    flightUsd: { value: num(r.flight_usd), sourceId: r.flight_source_id, observedAt: r.flight_observed_at },
    usualFlightUsd: { value: num(r.usual_flight_usd), sourceId: r.usual_source_id, observedAt: r.usual_observed_at },
  };
}

export function mapTrend(r: TrendRow): Trend {
  return {
    destinationId: r.destination_id,
    priceChange30dPct: { value: num(r.price_change_30d_pct), sourceId: r.price_source_id, observedAt: r.price_observed_at },
    interestChange30dPct: { value: num(r.interest_change_30d_pct), sourceId: r.interest_source_id, observedAt: r.interest_observed_at },
  };
}

function ratingColumns(r: GapRatings, prefix = ""): Record<string, number> {
  return Object.fromEntries(GAP_CRITERIA.map((k) => [`${prefix}${k}`, r[k]]));
}

function actorColumns(a: Actor) {
  return { user_id: a.userId ?? null, anon_id: cleanAnon(a.anonId) };
}

let client: SupabaseClient | null = null;
function db(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.");
    client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return client;
}

function check<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`Supabase (${what}): ${res.error.message}`);
  return res.data as T;
}

export const supabaseRepository: DataRepository = {
  async getDataset(origin, month) {
    const o = origin.toUpperCase();
    const [src, dest, conn, monthly, prices, trends] = await Promise.all([
      db().from("sources").select("*"),
      db().from("destinations").select(
        "id,name,country,lat,lon,altitude_m,tags,risk_level,risk_source_id,risk_observed_at,risk_reasons,similar_ids,blurb,poster",
      ),
      db().from("destination_connectivity").select("*").eq("origin", o),
      db().from("destination_monthly").select("*"),
      db().from("price_snapshots").select("*").eq("origin", o).order("flight_observed_at", { ascending: false }),
      db().from("destination_trends").select("*"),
    ]);
    const connRows = check<ConnectivityRow[]>(conn, "conectividad");
    // Solo la observación más reciente por (destino, mes).
    const latest = new Map<string, PriceRow>();
    for (const p of check<PriceRow[]>(prices, "precios")) {
      const k = `${p.destination_id}-${p.month}`;
      if (!latest.has(k)) latest.set(k, p);
    }
    const ds: Dataset = {
      sources: check<SourceRow[]>(src, "fuentes").map(mapSource),
      destinations: check<DestinationRow[]>(dest, "destinos").map((d) =>
        mapDestination(d, connRows.filter((c) => c.destination_id === d.id)),
      ),
      monthly: check<MonthlyRow[]>(monthly, "mensual").map(mapMonthly),
      prices: [...latest.values()].map(mapPrice),
      trends: check<TrendRow[]>(trends, "tendencias").map(mapTrend),
    };
    return withMonthContext(ds, o, month);
  },
  async getDestination(id) {
    const key = id.toUpperCase();
    const [d, conn] = await Promise.all([
      db().from("destinations")
        .select("id,name,country,lat,lon,altitude_m,tags,risk_level,risk_source_id,risk_observed_at,risk_reasons,similar_ids,blurb,poster")
        .eq("id", key)
        .maybeSingle(),
      db().from("destination_connectivity").select("*").eq("destination_id", key),
    ]);
    const row = check<DestinationRow | null>(d, "destino");
    return row ? mapDestination(row, check<ConnectivityRow[]>(conn, "conectividad")) : null;
  },
  async getSources() {
    return check<SourceRow[]>(await db().from("sources").select("*"), "fuentes").map(mapSource);
  },
  async saveTripRequest(req, actor = {}) {
    const res = await db()
      .from("trip_requests")
      .insert({
        ...actorColumns(actor),
        origin: req.origin.toUpperCase(),
        budget_usd: req.budgetUsd,
        days: req.days,
        month: req.month,
        flexible_dates: req.flexibleDates,
        travelers: req.travelers,
        interests: req.interests,
      })
      .select("id")
      .single();
    return check<{ id: string }>(res, "trip_requests").id;
  },
  async saveRecommendations(requestId, results) {
    if (!results.length) return;
    const rows = results.map((r, i) => ({
      trip_request_id: requestId,
      destination_id: r.destinationId,
      rank: i + 1,
      score: r.score,
      raw_score: r.rawScore,
      confidence: r.confidence,
      confidence_band: r.confidenceBand,
      opportunity: r.opportunity,
      total_usd: r.cost.totalUsd,
      breakdown: r,
      engine_version: r.engineVersion,
    }));
    check(await db().from("recommendations").upsert(rows, { onConflict: "trip_request_id,destination_id" }), "recommendations");
  },
  async logOutboundClick(input) {
    check(
      await db().from("outbound_clicks").insert({
        ...actorColumns(input),
        trip_request_id: input.requestId ?? null,
        destination_id: input.destinationId,
        kind: input.kind,
        url: input.url,
        ip_hash: hashIp(input.ip),
      }),
      "outbound_clicks",
    );
  },
  async saveExpectation(input) {
    assertRatings(input.ratings);
    check(
      await db().from("expectations").insert({
        ...actorColumns(input),
        destination_id: input.destinationId,
        ...ratingColumns(input.ratings),
      }),
      "expectations",
    );
  },
  async saveExperience(input) {
    assertRatings(input.ratings);
    let expected = input.expected;
    if (expected) assertRatings(expected);
    else if (input.userId || cleanAnon(input.anonId)) {
      let q = db()
        .from("expectations")
        .select("autenticidad,saturacion,costo,seguridad,comida")
        .eq("destination_id", input.destinationId)
        .order("created_at", { ascending: false })
        .limit(1);
      q = input.userId ? q.eq("user_id", input.userId) : q.eq("anon_id", cleanAnon(input.anonId) as string);
      const prior = check<GapRatings[]>(await q, "expectations");
      expected = prior[0];
    }
    const gap = expected ? computeGapValue(input.ratings, expected) : null;
    check(
      await db().from("experiences").insert({
        ...actorColumns(input),
        destination_id: input.destinationId,
        ...ratingColumns(input.ratings),
        ...(expected ? ratingColumns(expected, "expected_") : {}),
        phrase: cleanPhrase(input.phrase),
        gap,
      }),
      "experiences",
    );
    return gap;
  },
  async saveDuringSignal(input) {
    check(
      await db().from("during_signals").insert({
        ...actorColumns(input),
        destination_id: input.destinationId,
        ambiente: input.signal.ambiente,
        afluencia: input.signal.afluencia,
        precio: input.signal.precio,
      }),
      "during_signals",
    );
  },
  async getGapsForDestination(id) {
    const rows = check<Array<{ gap: number | string }>>(
      await db().from("experiences").select("gap").eq("destination_id", id.toUpperCase()).not("gap", "is", null),
      "experiences",
    );
    return rows.map((r) => Number(r.gap));
  },
  async logEvent(name, props = {}, actor = {}) {
    if (!EVENT_NAME.test(name)) return;
    check(await db().from("events").insert({ name, props, ...actorColumns(actor) }), "events");
  },
};

/* ------------------------------------------------------------------ */
/* Selección                                                           */
/* ------------------------------------------------------------------ */

export function getRepository(): DataRepository {
  return process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY ? supabaseRepository : memoryRepository;
}
