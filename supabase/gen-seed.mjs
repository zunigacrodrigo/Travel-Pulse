#!/usr/bin/env node
// Genera supabase/seed.sql a partir del dataset curado en TypeScript
// (src/lib/data/seed). Usa esbuild (ya presente como dependencia de vitest)
// para compilar el seed en memoria; no requiere tsx ni paquetes nuevos.
//
// Uso:  node supabase/gen-seed.mjs
import { build } from "esbuild";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const tmp = mkdtempSync(path.join(tmpdir(), "tp-seed-"));
const outfile = path.join(tmp, "seed.mjs");

await build({
  entryPoints: [path.join(root, "src/lib/data/seed/index.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile,
  alias: { "@": path.join(root, "src") },
  logLevel: "error",
});

const { seedDataset: ds } = await import(pathToFileURL(outfile).href);
rmSync(tmp, { recursive: true, force: true });

const q = (v) => {
  if (v === null || v === undefined) return "null";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  return `'${String(v).replace(/'/g, "''")}'`;
};
const jsonb = (o) => `${q(JSON.stringify(o))}::jsonb`;
const textArr = (a) => `array[${a.map(q).join(", ")}]::text[]`;
const rows = (list) => list.map((r) => `  (${r.join(", ")})`).join(",\n");

const out = [];
out.push("-- Generado por supabase/gen-seed.mjs desde src/lib/data/seed. No editar a mano.");
out.push(`-- ${ds.destinations.length} destinos, ${ds.monthly.length} filas mensuales, ${ds.prices.length} precios.`);
out.push("begin;");
out.push("");
out.push(
  "truncate public.destination_trends, public.price_snapshots, public.destination_monthly,\n" +
    "  public.destination_connectivity restart identity cascade;",
);
out.push("");

out.push("insert into public.sources (id, name, license, max_age_days, reliability, url) values");
out.push(rows(ds.sources.map((s) => [q(s.id), q(s.name), q(s.license), q(s.maxAgeDays), q(s.reliability), q(s.url ?? null)])));
out.push(
  "on conflict (id) do update set name = excluded.name, license = excluded.license,\n" +
    "  max_age_days = excluded.max_age_days, reliability = excluded.reliability, url = excluded.url;",
);
out.push("");

out.push(
  "insert into public.destinations (id, name, country, lat, lon, altitude_m, tags, risk_level, risk_source_id,\n" +
    "  risk_observed_at, risk_reasons, similar_ids, blurb, poster) values",
);
out.push(
  rows(
    ds.destinations.map((d) => [
      q(d.id), q(d.name), q(d.country), q(d.lat), q(d.lon), q(d.altitudeM), jsonb(d.tags),
      q(d.riskLevel.value), q(d.riskLevel.sourceId), q(d.riskLevel.observedAt),
      textArr(d.riskReasons), textArr(d.similar), q(d.blurb), jsonb(d.poster),
    ]),
  ),
);
out.push(
  "on conflict (id) do update set name = excluded.name, country = excluded.country, lat = excluded.lat,\n" +
    "  lon = excluded.lon, altitude_m = excluded.altitude_m, tags = excluded.tags, risk_level = excluded.risk_level,\n" +
    "  risk_source_id = excluded.risk_source_id, risk_observed_at = excluded.risk_observed_at,\n" +
    "  risk_reasons = excluded.risk_reasons, similar_ids = excluded.similar_ids, blurb = excluded.blurb, poster = excluded.poster;",
);
out.push("");

const conn = ds.destinations.flatMap((d) =>
  Object.entries(d.connectivity).map(([origin, c]) => [
    q(d.id), q(origin), q(c.value.directFlights), q(c.value.flightHours), q(c.value.weeklyFrequency),
    q(c.sourceId), q(c.observedAt),
  ]),
);
out.push(
  "insert into public.destination_connectivity (destination_id, origin, direct_flights, flight_hours,\n" +
    "  weekly_frequency, source_id, observed_at) values",
);
out.push(rows(conn) + ";");
out.push("");

out.push(
  "insert into public.destination_monthly (destination_id, month, season, season_source_id, season_observed_at,\n" +
    "  saturation, saturation_source_id, saturation_observed_at, daily_cost_usd, daily_cost_source_id,\n" +
    "  daily_cost_observed_at, temp_c, rain_mm, wind_kmh, climate_source_id, climate_observed_at) values",
);
out.push(
  rows(
    ds.monthly.map((m) => [
      q(m.destinationId), q(m.month),
      q(m.season.value), q(m.season.sourceId), q(m.season.observedAt),
      q(m.saturation.value), q(m.saturation.sourceId), q(m.saturation.observedAt),
      q(m.dailyCostUsd.value), q(m.dailyCostUsd.sourceId), q(m.dailyCostUsd.observedAt),
      q(m.climate.value?.tempC ?? null), q(m.climate.value?.rainMm ?? null), q(m.climate.value?.windKmh ?? null),
      q(m.climate.sourceId), q(m.climate.observedAt),
    ]),
  ) + ";",
);
out.push("");

out.push(
  "insert into public.price_snapshots (destination_id, origin, month, flight_usd, flight_source_id,\n" +
    "  flight_observed_at, usual_flight_usd, usual_source_id, usual_observed_at) values",
);
out.push(
  rows(
    ds.prices.map((p) => [
      q(p.destinationId), q(p.origin), q(p.month),
      q(p.flightUsd.value), q(p.flightUsd.sourceId), q(p.flightUsd.observedAt),
      q(p.usualFlightUsd.value), q(p.usualFlightUsd.sourceId), q(p.usualFlightUsd.observedAt),
    ]),
  ) + ";",
);
out.push("");

out.push(
  "insert into public.destination_trends (destination_id, price_change_30d_pct, price_source_id, price_observed_at,\n" +
    "  interest_change_30d_pct, interest_source_id, interest_observed_at) values",
);
out.push(
  rows(
    ds.trends.map((t) => [
      q(t.destinationId),
      q(t.priceChange30dPct.value), q(t.priceChange30dPct.sourceId), q(t.priceChange30dPct.observedAt),
      q(t.interestChange30dPct.value), q(t.interestChange30dPct.sourceId), q(t.interestChange30dPct.observedAt),
    ]),
  ) + ";",
);
out.push("");
out.push("commit;");
out.push("");

const target = path.join(here, "seed.sql");
writeFileSync(target, out.join("\n"));
console.log(`seed.sql generado: ${path.relative(root, target)} (${ds.destinations.length} destinos)`);
