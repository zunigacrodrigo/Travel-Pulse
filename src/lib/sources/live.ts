/**
 * Caché y estado de las fuentes en vivo. Reglas:
 *  - Nunca bloquea el ranking: `peek()` devuelve lo último que se obtuvo.
 *  - Si una consulta falla, se conserva el último dato bueno y se declara "stale".
 *  - Si no hay ningún dato, se declara "unavailable" (el motor usa la semilla).
 */
import { type Advisory, FCDO_COUNTRY_SLUGS, fetchAdvisory } from "./fcdo";
import { fetchHazards, type Hazard } from "./gdacs";
import { describeError, type FetchOptions } from "./http";
import { fetchQuakes, type Quake } from "./usgs";

export type FeedState = "ok" | "stale" | "unavailable";

export interface FeedStatus {
  state: FeedState;
  /** Última consulta exitosa (ISO) o null. */
  fetchedAt: string | null;
  error: string | null;
  count: number;
}

export interface CheckedAdvisory {
  advisory: Advisory;
  /** Cuándo consultamos la fuente (no cuándo cambió el aviso). */
  checkedAt: string;
}

export interface LiveSnapshot {
  advisories: Record<string, CheckedAdvisory>;
  quakes: Quake[];
  hazards: Hazard[];
  status: { fcdo: FeedStatus; usgs: FeedStatus; gdacs: FeedStatus };
}

export interface LiveOptions {
  fetchImpl?: typeof fetch;
  now?: () => Date;
  fcdoBase?: string;
  usgsBase?: string;
  gdacsBase?: string;
  fcdoTtlMs?: number;
  usgsTtlMs?: number;
  gdacsTtlMs?: number;
  timeoutMs?: number;
}

const EMPTY: FeedStatus = { state: "unavailable", fetchedAt: null, error: null, count: 0 };

export function createLiveSources(opts: LiveOptions = {}) {
  const now = opts.now ?? (() => new Date());
  const fcdoTtl = opts.fcdoTtlMs ?? 6 * 3_600_000;
  const usgsTtl = opts.usgsTtlMs ?? 10 * 60_000;
  const gdacsTtl = opts.gdacsTtlMs ?? 15 * 60_000;
  const http: FetchOptions = { fetchImpl: opts.fetchImpl, timeoutMs: opts.timeoutMs };

  const snap: LiveSnapshot = { advisories: {}, quakes: [], hazards: [], status: { fcdo: { ...EMPTY }, usgs: { ...EMPTY }, gdacs: { ...EMPTY } } };
  let fcdoAttempt = 0;
  let usgsAttempt = 0;
  let gdacsAttempt = 0;
  let inflight: Promise<void> | null = null;

  async function refreshFcdo(): Promise<void> {
    fcdoAttempt = now().getTime();
    const countries = Object.keys(FCDO_COUNTRY_SLUGS);
    const results = await Promise.allSettled(countries.map((c) => fetchAdvisory(c, { ...http, base: opts.fcdoBase ?? process.env.TP_FCDO_BASE })));
    const checkedAt = now().toISOString();
    let failed = 0;
    let lastError = "";
    results.forEach((r, i) => {
      if (r.status === "fulfilled") snap.advisories[countries[i]] = { advisory: r.value, checkedAt };
      else {
        failed += 1;
        lastError = describeError(r.reason);
      }
    });
    const count = Object.keys(snap.advisories).length;
    const prev = snap.status.fcdo;
    snap.status.fcdo = {
      state: count === 0 ? "unavailable" : failed > 0 ? "stale" : "ok",
      fetchedAt: failed < countries.length ? checkedAt : prev.fetchedAt,
      error: failed > 0 ? `${failed} de ${countries.length} países sin respuesta (${lastError})` : null,
      count,
    };
  }

  async function refreshUsgs(): Promise<void> {
    usgsAttempt = now().getTime();
    try {
      snap.quakes = await fetchQuakes("4.5_month", { ...http, base: opts.usgsBase ?? process.env.TP_USGS_BASE });
      snap.status.usgs = { state: "ok", fetchedAt: now().toISOString(), error: null, count: snap.quakes.length };
    } catch (e) {
      const had = snap.quakes.length > 0 || snap.status.usgs.fetchedAt !== null;
      snap.status.usgs = {
        state: had ? "stale" : "unavailable",
        fetchedAt: snap.status.usgs.fetchedAt,
        error: describeError(e),
        count: snap.quakes.length,
      };
    }
  }

  async function refreshGdacs(): Promise<void> {
    gdacsAttempt = now().getTime();
    try {
      snap.hazards = await fetchHazards(now(), { ...http, base: opts.gdacsBase ?? process.env.TP_GDACS_BASE });
      snap.status.gdacs = { state: "ok", fetchedAt: now().toISOString(), error: null, count: snap.hazards.length };
    } catch (e) {
      const had = snap.hazards.length > 0 || snap.status.gdacs.fetchedAt !== null;
      snap.status.gdacs = {
        state: had ? "stale" : "unavailable",
        fetchedAt: snap.status.gdacs.fetchedAt,
        error: describeError(e),
        count: snap.hazards.length,
      };
    }
  }

  return {
    /** Último estado conocido, sin red. */
    peek(): LiveSnapshot {
      return snap;
    },
    /** Consulta lo vencido (o todo con `force`). Las llamadas simultáneas se comparten. */
    refresh(force = false): Promise<LiveSnapshot> {
      if (inflight) return inflight.then(() => snap);
      const t = now().getTime();
      const jobs: Promise<void>[] = [];
      if (force || t - fcdoAttempt >= fcdoTtl) jobs.push(refreshFcdo());
      if (force || t - usgsAttempt >= usgsTtl) jobs.push(refreshUsgs());
      if (force || t - gdacsAttempt >= gdacsTtl) jobs.push(refreshGdacs());
      if (jobs.length === 0) return Promise.resolve(snap);
      inflight = Promise.all(jobs)
        .then(() => undefined)
        .finally(() => {
          inflight = null;
        });
      return inflight.then(() => snap);
    },
  };
}

export type LiveSources = ReturnType<typeof createLiveSources>;

let singleton: LiveSources | null = null;
export function getLiveSources(): LiveSources {
  singleton ??= createLiveSources();
  return singleton;
}

/** Desactivado en pruebas y con LIVE_SOURCES=0 (p. ej. entornos sin salida a internet). */
export function liveEnabled(): boolean {
  return process.env.LIVE_SOURCES !== "0" && process.env.NODE_ENV !== "test";
}
