#!/usr/bin/env node
// Chequeo previo al despliegue: valida las variables de entorno y consulta TU proyecto de Supabase para decir si las migraciones
// quedaron aplicadas y si la base protege los datos. Solo lee; no escribe nada. Uso:  npm run preflight
// (en PowerShell: $env:NEXT_PUBLIC_SUPABASE_URL="https://xxxx.supabase.co"; $env:NEXT_PUBLIC_SUPABASE_ANON_KEY="..."; npm.cmd run preflight)

/** @typedef {{ level: "ok" | "aviso" | "error", name: string, detail: string }} Check */

const ok = (name, detail = "") => ({ level: "ok", name, detail });
const warn = (name, detail) => ({ level: "aviso", name, detail });
const bad = (name, detail) => ({ level: "error", name, detail });

/** Igual que src/lib/cloud/config.ts (duplicado a propósito: este script corre con `node` puro, sin compilar TypeScript). */
export function isServiceRoleKey(key) {
  if (key.startsWith("sb_secret_")) return true;
  const part = key.split(".")[1];
  if (!part) return false;
  try {
    const json = JSON.parse(Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    return json.role === "service_role";
  } catch { return false; }
}
function jwtRole(key) {
  try { return JSON.parse(Buffer.from(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")).role ?? null; } catch { return null; }
}

/** @returns {Check[]} */
export function checkEnv(env, { production = true } = {}) {
  /** @type {Check[]} */ const out = [];
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim(), anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url) out.push(bad("NEXT_PUBLIC_SUPABASE_URL", "Falta. Sin ella no hay cuentas ni reportes de viajeros (la app igual funciona, solo en este dispositivo)."));
  else {
    let u = null; try { u = new URL(url); } catch { /* inválida */ }
    if (!u) out.push(bad("NEXT_PUBLIC_SUPABASE_URL", "No es una URL válida."));
    else if (u.protocol !== "https:") out.push(bad("NEXT_PUBLIC_SUPABASE_URL", "Debe ser https."));
    else if (!u.hostname.endsWith(".supabase.co")) out.push(warn("NEXT_PUBLIC_SUPABASE_URL", `El dominio ${u.hostname} no termina en .supabase.co: ¿es un proyecto propio autoalojado?`));
    else out.push(ok("NEXT_PUBLIC_SUPABASE_URL", u.hostname));
  }
  if (!anon) out.push(bad("NEXT_PUBLIC_SUPABASE_ANON_KEY", "Falta la clave anon/publishable (Settings → API Keys)."));
  else if (isServiceRoleKey(anon)) out.push(bad("NEXT_PUBLIC_SUPABASE_ANON_KEY", "¡Es una clave SECRETA (service_role)! No va en una variable pública: cualquiera podría leerla desde el navegador. Cámbiala por la anon/publishable y rota la secreta en Supabase."));
  else if (anon.startsWith("sb_publishable_")) out.push(ok("NEXT_PUBLIC_SUPABASE_ANON_KEY", "clave publishable"));
  else if (jwtRole(anon) === "anon") out.push(ok("NEXT_PUBLIC_SUPABASE_ANON_KEY", "clave anon"));
  else out.push(warn("NEXT_PUBLIC_SUPABASE_ANON_KEY", "No reconozco el formato; debería ser la «anon» (JWT con rol anon) o «publishable» (sb_publishable_…)."));

  // Una clave secreta en cualquier variable NEXT_PUBLIC_* termina en el navegador.
  for (const [k, v] of Object.entries(env)) {
    if (k.startsWith("NEXT_PUBLIC_") && typeof v === "string" && k !== "NEXT_PUBLIC_SUPABASE_ANON_KEY" && (isServiceRoleKey(v) || v.startsWith("sk-ant-"))) out.push(bad(k, "Contiene una clave secreta en una variable pública."));
  }

  const sUrl = env.SUPABASE_URL?.trim(), sKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (sUrl && sKey) out.push(warn("SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY", "Activan el repositorio de destinos en Supabase: solo ponlas si cargaste supabase/seed.sql; si no, la app leería una base vacía en vez de sus datos de demostración. Para cuentas y reportes NO hacen falta."));
  else if (sUrl || sKey) out.push(warn("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY", "Solo una de las dos: no hacen nada por separado. Para cuentas y reportes no se necesitan."));
  else out.push(ok("Repositorio de destinos", "sin SUPABASE_URL/SERVICE_ROLE: usa los datos de demostración incluidos (correcto si no cargaste el seed)"));

  const ai = env.ANTHROPIC_API_KEY?.trim();
  if (!ai) out.push(ok("ANTHROPIC_API_KEY", "no definida: la app funciona sin IA, con reglas"));
  else if (!ai.startsWith("sk-ant-")) out.push(warn("ANTHROPIC_API_KEY", "No empieza con sk-ant-: revisa que sea una clave de Anthropic."));
  else {
    out.push(ok("ANTHROPIC_API_KEY", "definida (solo servidor)"));
    const b = Number(env.AI_MONTHLY_BUDGET_USD);
    if (!(b > 0)) out.push(warn("AI_MONTHLY_BUDGET_USD", "Con IA activa, define un tope mensual (p. ej. 10) para no gastar sin límite."));
    else out.push(ok("AI_MONTHLY_BUDGET_USD", `${b} USD/mes`));
  }

  const salt = env.IP_HASH_SALT?.trim();
  if (!salt || salt.startsWith("replace-with")) out.push(warn("IP_HASH_SALT", "Define una cadena aleatoria de 16+ caracteres: protege el límite de uso por IP."));
  else if (salt.length < 16) out.push(warn("IP_HASH_SALT", "Muy corta; usa 16+ caracteres."));
  else out.push(ok("IP_HASH_SALT"));

  if (production) for (const k of ["RATE_LIMIT_DISABLED", "NEXT_PUBLIC_USE_MOCK", "TP_NOW"]) {
    if (env[k]) out.push(bad(k, "Es una variable de pruebas: no debe estar en producción."));
  }
  return out;
}

const REST = (url, path) => `${url.replace(/\/+$/, "")}${path}`;

/**
 * Consulta el proyecto con la clave pública. Cada migración deja una huella que se comprueba; además verifica que la
 * base no entregue `user_id` de los reportes a un visitante anónimo.
 * @returns {Promise<Check[]>}
 */
export async function probeSupabase(url, anonKey, fetchImpl = fetch) {
  /** @type {Check[]} */ const out = [];
  const headers = { apikey: anonKey, authorization: `Bearer ${anonKey}`, accept: "application/json" };
  const get = async (path) => {
    try {
      const r = await fetchImpl(REST(url, path), { headers, signal: AbortSignal.timeout(10_000) });
      const text = await r.text(); let body = null; try { body = JSON.parse(text); } catch { /* no JSON */ }
      return { status: r.status, body };
    } catch (e) { return { status: 0, body: null, error: e instanceof Error ? e.message : String(e) }; }
  };

  const auth = await get("/auth/v1/settings");
  if (auth.status === 0) return [bad("Conexión con Supabase", `No se pudo conectar (${auth.error}). Revisa la URL.`)];
  if (auth.status === 401 || auth.status === 403) return [bad("Clave pública", "Supabase rechazó la clave. Copia de nuevo la anon/publishable del panel (Settings → API Keys).")];
  if (auth.status !== 200) return [bad("Conexión con Supabase", `HTTP ${auth.status} al consultar el proyecto: ¿está pausado o la URL es otra?`)];
  out.push(ok("Conexión con Supabase", "el proyecto responde y acepta la clave"));
  const s = auth.body ?? {};
  if (s.disable_signup === true) out.push(warn("Registro de usuarios", "El registro está desactivado: nadie podrá crear cuenta."));
  else out.push(ok("Registro de usuarios", s.mailer_autoconfirm ? "activo, sin confirmar el correo" : "activo, con confirmación por correo"));

  // Huellas de cada migración: una tabla o vista inexistente responde 404 (PGRST205).
  const marks = [
    ["0001", "/rest/v1/profiles?select=id&limit=1", "tablas base (profiles…)"],
    ["0002", "/rest/v1/destination_gap_stats?select=*&limit=1", "vista destination_gap_stats"],
    ["0004", "/rest/v1/user_trips?select=id&limit=1", "viajes guardados en la nube (user_trips)"],
    ["0005", "/rest/v1/pulse_signals_public?select=id&limit=1", "reportes de viajeros (PulseMesh)"],
    ["0006", "/rest/v1/pulse_signals_public?select=place_id&limit=1", "reportes por lugar (place_id)"],
  ];
  for (const [mig, path, what] of marks) {
    const r = await get(path);
    if (r.status === 404 || r.body?.code === "PGRST205" || r.body?.code === "42703") out.push(bad(`Migración ${mig}`, `No aplicada: falta ${what}. Ejecuta supabase/setup-completo.sql (o la migración ${mig}) en el SQL Editor.`));
    else if (r.status === 0) out.push(warn(`Migración ${mig}`, `No se pudo comprobar (${r.error}).`));
    else out.push(ok(`Migración ${mig}`, what));
  }

  // Privacidad: un visitante anónimo no debe poder leer quién publicó cada reporte.
  const leak = await get("/rest/v1/pulse_signals?select=user_id&limit=1");
  if (leak.status === 200 && Array.isArray(leak.body) && leak.body.length > 0) out.push(bad("Privacidad de reportes", "¡Un visitante anónimo puede leer user_id de los reportes! Revisa que las políticas RLS de 0005 estén aplicadas."));
  else if (leak.status === 404) out.push(warn("Privacidad de reportes", "No se pudo comprobar: falta la tabla (migración 0005)."));
  else out.push(ok("Privacidad de reportes", "un visitante anónimo no ve quién publicó"));
  const pubView = await get("/rest/v1/pulse_signals_public?select=user_id&limit=1");
  if (pubView.status === 200) out.push(bad("Vista pública de reportes", "La vista pública expone user_id."));
  else if (pubView.status !== 404) out.push(ok("Vista pública de reportes", "no incluye user_id"));
  return out;
}

export function formatChecks(checks) {
  const icon = { ok: "✔", aviso: "⚠", error: "✖" };
  const lines = checks.map((c) => `${icon[c.level]} ${c.name}${c.detail ? ` — ${c.detail}` : ""}`);
  const e = checks.filter((c) => c.level === "error").length, a = checks.filter((c) => c.level === "aviso").length;
  lines.push("", e ? `Resultado: ${e} error(es) por corregir antes de publicar${a ? `, ${a} aviso(s)` : ""}.` : a ? `Resultado: sin errores, ${a} aviso(s) para revisar.` : "Resultado: todo en orden.");
  return lines.join("\n");
}

async function main() {
  const env = process.env;
  const checks = checkEnv(env, { production: !process.argv.includes("--dev") });
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim(), anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const usable = url && anon && !isServiceRoleKey(anon) && checks.find((c) => c.name === "NEXT_PUBLIC_SUPABASE_URL")?.level !== "error";
  if (usable) checks.push(...(await probeSupabase(url, anon)));
  else checks.push(warn("Consulta a Supabase", "Se omitió: faltan o son inválidas la URL o la clave anon."));
  console.log(formatChecks(checks));
  process.exit(checks.some((c) => c.level === "error") ? 1 : 0);
}

import { pathToFileURL } from "node:url";
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
