#!/usr/bin/env node
// Trae datos REALES para los destinos del catálogo y los guarda con su procedencia en
// src/lib/data/seed/real.generated.json. No inventa nada: si una fuente falla para un
// destino, ese dato queda ausente (null) y el motor lo declara «sin dato».
//
//   · Clima: Open-Meteo Historical Weather API (reanálisis ERA5), climatología mensual 2015-2024.
//   · Interés: visitas diarias a la página del destino en Wikipedia (Wikimedia REST API, CC0),
//     últimos 30 días frente a los 30 anteriores.
//
// Uso:  node scripts/fetch-real-data.mjs      (necesita acceso a internet; NODE_USE_ENV_PROXY=1 tras un proxy)
import { build } from "esbuild";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const tmp = mkdtempSync(path.join(tmpdir(), "tp-real-"));
const outfile = path.join(tmp, "table.mjs");
await build({ entryPoints: [path.join(root, "src/lib/data/seed/table.ts")], bundle: true, platform: "node", format: "esm", outfile, logLevel: "error" });
const { ROWS } = await import(pathToFileURL(outfile).href);
rmSync(tmp, { recursive: true, force: true });

const YEARS = [2015, 2024];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const today = new Date();
const iso = (d) => d.toISOString().slice(0, 10);

/** Título del artículo en es.wikipedia.org para cada destino (verificado al consultar). */
const WIKI = {
  GPS: "Islas_Galápagos", IPC: "Isla_de_Pascua", GIG: "Río_de_Janeiro", MEX: "Ciudad_de_México", PTY: "Ciudad_de_Panamá",
  HAV: "La_Habana", PMV: "Isla_de_Margarita", IGR: "Puerto_Iguazú", PDP: "Punta_del_Este", SSA: "Salvador_de_Bahía",
  AEP: "Buenos_Aires", LSC: "La_Serena_(Chile)", PUQ: "Punta_Arenas", UYU: "Uyuni", ASU: "Asunción", SJO: "San_José_(Costa_Rica)",
  MDE: "Medellín", BOG: "Bogotá", CTG: "Cartagena_de_Indias", CUZ: "Cuzco", AQP: "Arequipa", LIM: "Lima", SLA: "Salta",
  MDZ: "Mendoza_(Argentina)", BRC: "San_Carlos_de_Bariloche", OAX: "Oaxaca_de_Juárez", CUN: "Cancún", FLN: "Florianópolis", MVD: "Montevideo", UIO: "Quito",
};

async function getJson(url, tries = 6) {
  for (let i = 0; i < tries; i++) {
    const res = await fetch(url, { headers: { "user-agent": "TravelPulse/0.4 (datos reales; contacto: repo)" } });
    if (res.ok) return res.json();
    if (res.status === 429 || res.status >= 500) { await sleep(8000 * (i + 1)); continue; }
    throw new Error(`HTTP ${res.status}`);
  }
  throw new Error("reintentos agotados");
}

async function climate(r) {
  const u = `https://archive-api.open-meteo.com/v1/archive?latitude=${r.lat}&longitude=${r.lon}&start_date=${YEARS[0]}-01-01&end_date=${YEARS[1]}-12-31&daily=temperature_2m_mean,precipitation_sum,wind_speed_10m_mean&timezone=GMT`;
  const j = await getJson(u);
  const t = j.daily.time, T = j.daily.temperature_2m_mean, P = j.daily.precipitation_sum, W = j.daily.wind_speed_10m_mean;
  const tempS = Array(12).fill(0), tempN = Array(12).fill(0), windS = Array(12).fill(0), windN = Array(12).fill(0);
  const rainByYM = new Map();
  for (let i = 0; i < t.length; i++) {
    const m = Number(t[i].slice(5, 7)) - 1, y = t[i].slice(0, 4);
    if (T[i] != null) { tempS[m] += T[i]; tempN[m]++; }
    if (W[i] != null) { windS[m] += W[i]; windN[m]++; }
    if (P[i] != null) { const k = `${y}-${m}`; rainByYM.set(k, (rainByYM.get(k) ?? 0) + P[i]); }
  }
  const rainS = Array(12).fill(0), rainN = Array(12).fill(0);
  for (const [k, v] of rainByYM) { const m = Number(k.split("-")[1]); rainS[m] += v; rainN[m]++; }
  const avg = (s, n, d) => s.map((x, i) => (n[i] ? Number((x / n[i]).toFixed(d)) : null));
  return { tempC: avg(tempS, tempN, 1), rainMm: avg(rainS, rainN, 0), windKmh: avg(windS, windN, 0) };
}

async function interest(id) {
  const title = WIKI[id];
  if (!title) return null;
  const end = new Date(today.getTime() - 2 * 86400000); // la API publica con ~1-2 días de retraso
  const start = new Date(end.getTime() - 59 * 86400000);
  const fmt = (d) => iso(d).replaceAll("-", "");
  const j = await getJson(`https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/es.wikipedia/all-access/user/${encodeURIComponent(title)}/daily/${fmt(start)}/${fmt(end)}`);
  const v = j.items.map((x) => x.views);
  if (v.length < 55) return null;
  const prev = v.slice(0, 30).reduce((a, b) => a + b, 0), last = v.slice(-30).reduce((a, b) => a + b, 0);
  if (prev < 100) return null; // muestra demasiado pequeña para hablar de tendencia
  return { title, views30d: last, viewsPrev30d: prev, changePct: Math.round(((last - prev) / prev) * 100), window: [iso(start), iso(end)] };
}

const FILE = path.join(root, "src/lib/data/seed/real.generated.json");
// Reanudable: conserva lo ya traído y solo pide lo que falta (útil ante límites de las APIs).
const prev = existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : { climate: {}, interest: {} };
const out = { generatedAt: today.toISOString(), climate: { ...prev.climate }, interest: { ...prev.interest }, failures: [] };
for (const r of ROWS) {
  if (!out.climate[r.id]) {
    try { out.climate[r.id] = { source: "open-meteo", period: `${YEARS[0]}-${YEARS[1]}`, fetchedAt: iso(today), ...(await climate(r)) }; }
    catch (e) { out.failures.push(`clima ${r.id}: ${e.message}`); }
    await sleep(2500);
  }
  if (!out.interest[r.id]) {
    try { const x = await interest(r.id); if (x) out.interest[r.id] = { source: "wikipedia-pageviews", fetchedAt: iso(today), ...x }; else out.failures.push(`interés ${r.id}: sin serie suficiente`); }
    catch (e) { out.failures.push(`interés ${r.id}: ${e.message}`); }
    await sleep(1500);
  }
  console.log(r.id, out.climate[r.id] ? "clima ✓" : "clima ✗", out.interest[r.id] ? `interés ${out.interest[r.id].changePct}%` : "interés ✗");
  await sleep(300);
}
writeFileSync(FILE, JSON.stringify(out, null, 1) + "\n");
console.log(`\nClima: ${Object.keys(out.climate).length}/${ROWS.length} · Interés: ${Object.keys(out.interest).length}/${ROWS.length}`);
if (out.failures.length) console.log("Sin dato:\n - " + out.failures.join("\n - "));
