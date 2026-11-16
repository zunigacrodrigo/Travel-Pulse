import { describe, expect, it } from "vitest";
import { buildSetupSql } from "../../../scripts/build-setup-sql.mjs";
import { checkEnv, formatChecks, isServiceRoleKey, probeSupabase } from "../../../scripts/preflight-nube.mjs";
import { readFileSync } from "node:fs";
import { looksLikeServiceRole } from "./config";

const jwt = (role: string) => `h.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.s`;
const GOOD = { NEXT_PUBLIC_SUPABASE_URL: "https://abcd.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt("anon"), IP_HASH_SALT: "una-sal-larga-y-aleatoria-123" };
const lvl = (c: { name: string; level: string }[], name: string) => c.find((x) => x.name === name)?.level;

describe("el SQL único de instalación", () => {
  it("está al día con las migraciones (si falla: npm run nube:sql)", () => {
    expect(readFileSync("supabase/setup-completo.sql", "utf8")).toBe(buildSetupSql());
  });
  it("contiene las 6 migraciones en orden y avisa que no es repetible", () => {
    const sql = buildSetupSql();
    const at = ["0001_init", "0002_gap_view", "0003_mark_seed", "0004_user_cloud", "0005_pulsemesh.sql", "0006_pulsemesh_places"].map((m) => sql.indexOf(`===== ${m}`));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(sql).toMatch(/NO es repetible/);
  });
});

describe("preflight: variables de entorno", () => {
  it("configuración correcta → sin errores", () => {
    const c = checkEnv(GOOD);
    expect(c.filter((x) => x.level === "error")).toEqual([]);
    expect(lvl(c, "NEXT_PUBLIC_SUPABASE_ANON_KEY")).toBe("ok");
  });
  it("detecta una clave SECRETA pegada en la variable pública (JWT service_role y sb_secret_)", () => {
    for (const k of [jwt("service_role"), "sb_secret_abc"]) {
      const c = checkEnv({ ...GOOD, NEXT_PUBLIC_SUPABASE_ANON_KEY: k });
      expect(lvl(c, "NEXT_PUBLIC_SUPABASE_ANON_KEY")).toBe("error");
    }
  });
  it("coincide con la regla que usa la app para rechazar claves secretas", () => {
    for (const k of [jwt("service_role"), jwt("anon"), "sb_secret_x", "sb_publishable_x", "basura"]) expect(isServiceRoleKey(k)).toBe(looksLikeServiceRole(k));
  });
  it("una clave secreta en CUALQUIER variable NEXT_PUBLIC_ es error", () => {
    expect(lvl(checkEnv({ ...GOOD, NEXT_PUBLIC_OTRA: jwt("service_role") }), "NEXT_PUBLIC_OTRA")).toBe("error");
    expect(lvl(checkEnv({ ...GOOD, NEXT_PUBLIC_IA: "sk-ant-secreto" }), "NEXT_PUBLIC_IA")).toBe("error");
  });
  it("URL: falta, http, inválida y dominio raro", () => {
    expect(lvl(checkEnv({ ...GOOD, NEXT_PUBLIC_SUPABASE_URL: undefined }), "NEXT_PUBLIC_SUPABASE_URL")).toBe("error");
    expect(lvl(checkEnv({ ...GOOD, NEXT_PUBLIC_SUPABASE_URL: "http://abcd.supabase.co" }), "NEXT_PUBLIC_SUPABASE_URL")).toBe("error");
    expect(lvl(checkEnv({ ...GOOD, NEXT_PUBLIC_SUPABASE_URL: "no es url" }), "NEXT_PUBLIC_SUPABASE_URL")).toBe("error");
    expect(lvl(checkEnv({ ...GOOD, NEXT_PUBLIC_SUPABASE_URL: "https://db.miempresa.com" }), "NEXT_PUBLIC_SUPABASE_URL")).toBe("aviso");
  });
  it("clave anon: falta es error; formato desconocido es aviso; publishable es ok", () => {
    expect(lvl(checkEnv({ ...GOOD, NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined }), "NEXT_PUBLIC_SUPABASE_ANON_KEY")).toBe("error");
    expect(lvl(checkEnv({ ...GOOD, NEXT_PUBLIC_SUPABASE_ANON_KEY: "algo-raro" }), "NEXT_PUBLIC_SUPABASE_ANON_KEY")).toBe("aviso");
    expect(lvl(checkEnv({ ...GOOD, NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_abc" }), "NEXT_PUBLIC_SUPABASE_ANON_KEY")).toBe("ok");
  });
  it("variables de pruebas en producción son error; con --dev no", () => {
    for (const k of ["RATE_LIMIT_DISABLED", "NEXT_PUBLIC_USE_MOCK", "TP_NOW"]) {
      expect(lvl(checkEnv({ ...GOOD, [k]: "1" }), k)).toBe("error");
      expect(lvl(checkEnv({ ...GOOD, [k]: "1" }, { production: false }), k)).toBeUndefined();
    }
  });
  it("sal: ausente, de ejemplo o corta avisan", () => {
    for (const v of [undefined, "replace-with-a-random-private-value", "corta"]) expect(lvl(checkEnv({ ...GOOD, IP_HASH_SALT: v }), "IP_HASH_SALT")).toBe("aviso");
  });
  it("IA: sin clave es ok (funciona sin IA); con clave sin tope avisa; clave rara avisa", () => {
    expect(lvl(checkEnv(GOOD), "ANTHROPIC_API_KEY")).toBe("ok");
    const c = checkEnv({ ...GOOD, ANTHROPIC_API_KEY: "sk-ant-x" });
    expect(lvl(c, "AI_MONTHLY_BUDGET_USD")).toBe("aviso");
    expect(lvl(checkEnv({ ...GOOD, ANTHROPIC_API_KEY: "sk-ant-x", AI_MONTHLY_BUDGET_USD: "10" }), "AI_MONTHLY_BUDGET_USD")).toBe("ok");
    expect(lvl(checkEnv({ ...GOOD, ANTHROPIC_API_KEY: "otra-cosa" }), "ANTHROPIC_API_KEY")).toBe("aviso");
  });
  it("las claves del servidor de Supabase: avisa del seed y de ponerlas a medias", () => {
    expect(lvl(checkEnv({ ...GOOD, SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "k" }), "SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY")).toBe("aviso");
    expect(lvl(checkEnv({ ...GOOD, SUPABASE_URL: "https://x.supabase.co" }), "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY")).toBe("aviso");
    expect(lvl(checkEnv(GOOD), "Repositorio de destinos")).toBe("ok");
  });
});

describe("preflight: consulta al proyecto (respuestas simuladas)", () => {
  const URL = "https://abcd.supabase.co";
  type Route = (path: string) => { status: number; body?: unknown } | "red";
  const f = (route: Route) => ((async (u: string) => {
    const r = route(new globalThis.URL(u).pathname + new globalThis.URL(u).search);
    if (r === "red") throw new Error("ENOTFOUND");
    return new Response(JSON.stringify(r.body ?? []), { status: r.status });
  }) as unknown) as typeof fetch;
  const healthy: Route = (p) => (p.startsWith("/auth/v1/settings") ? { status: 200, body: { disable_signup: false, mailer_autoconfirm: false } }
    : p.includes("user_id") && p.includes("pulse_signals_public") ? { status: 400, body: { code: "42703" } }
    : p.includes("pulse_signals?select=user_id") ? { status: 401, body: { code: "42501" } } : { status: 200, body: [] });

  it("proyecto sano → todo ok", async () => {
    const c = await probeSupabase(URL, "k", f(healthy));
    expect(c.filter((x) => x.level !== "ok")).toEqual([]);
    expect(c.map((x) => x.name)).toEqual(expect.arrayContaining(["Migración 0001", "Migración 0002", "Migración 0004", "Migración 0005", "Migración 0006"]));
  });
  it("sin red → un solo error de conexión", async () => {
    const c = await probeSupabase(URL, "k", f(() => "red"));
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ level: "error", name: "Conexión con Supabase" });
  });
  it("clave rechazada (401) → lo dice y no sigue", async () => {
    const c = await probeSupabase(URL, "mala", f(() => ({ status: 401 })));
    expect(c).toHaveLength(1);
    expect(c[0]!.name).toBe("Clave pública");
  });
  it("proyecto pausado u otro error HTTP → error", async () => {
    expect((await probeSupabase(URL, "k", f(() => ({ status: 503 }))))[0]!.level).toBe("error");
  });
  it("una migración sin aplicar se nombra (404 / PGRST205 / columna inexistente)", async () => {
    const c = await probeSupabase(URL, "k", f((p) => (p.startsWith("/rest/v1/user_trips") ? { status: 404, body: { code: "PGRST205" } } : p.includes("select=place_id") ? { status: 400, body: { code: "42703" } } : healthy(p))));
    expect(lvl(c, "Migración 0004")).toBe("error");
    expect(lvl(c, "Migración 0006")).toBe("error");
    expect(lvl(c, "Migración 0005")).toBe("ok");
    expect(c.find((x) => x.name === "Migración 0004")!.detail).toMatch(/setup-completo\.sql/);
  });
  it("si un visitante anónimo puede leer user_id de los reportes → error de privacidad", async () => {
    const c = await probeSupabase(URL, "k", f((p) => (p.includes("pulse_signals?select=user_id") ? { status: 200, body: [{ user_id: "abc" }] } : healthy(p))));
    expect(lvl(c, "Privacidad de reportes")).toBe("error");
  });
  it("si la vista pública expone user_id → error", async () => {
    const c = await probeSupabase(URL, "k", f((p) => (p.includes("pulse_signals_public?select=user_id") ? { status: 200, body: [] } : healthy(p))));
    expect(lvl(c, "Vista pública de reportes")).toBe("error");
  });
  it("registro desactivado se avisa", async () => {
    const c = await probeSupabase(URL, "k", f((p) => (p.startsWith("/auth/v1/settings") ? { status: 200, body: { disable_signup: true } } : healthy(p))));
    expect(lvl(c, "Registro de usuarios")).toBe("aviso");
  });
  it("manda la clave en los encabezados apikey y authorization", async () => {
    const seen: Record<string, string>[] = [];
    await probeSupabase(URL, "mi-clave", ((async (_u: string, init: RequestInit) => { seen.push(init.headers as Record<string, string>); return new Response("{}", { status: 200 }); }) as unknown) as typeof fetch);
    expect(seen[0]).toMatchObject({ apikey: "mi-clave", authorization: "Bearer mi-clave" });
  });
});

describe("formatChecks", () => {
  it("resume errores, avisos y el caso sin problemas", () => {
    expect(formatChecks([{ level: "error", name: "a", detail: "x" }, { level: "aviso", name: "b", detail: "" }])).toMatch(/1 error\(es\)[\s\S]*1 aviso/);
    expect(formatChecks([{ level: "aviso", name: "b", detail: "" }])).toMatch(/sin errores, 1 aviso/);
    expect(formatChecks([{ level: "ok", name: "c", detail: "" }])).toMatch(/todo en orden/);
  });
});
