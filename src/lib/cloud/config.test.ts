import { describe, expect, it } from "vitest";
import { looksLikeServiceRole, readCloudConfig } from "./config";

const jwt = (role: string) => `x.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.y`;

describe("readCloudConfig", () => {
  it("sin variables, la nube queda desactivada", () => {
    expect(readCloudConfig({})).toBeNull();
    expect(readCloudConfig({ NEXT_PUBLIC_SUPABASE_URL: "https://a.supabase.co" })).toBeNull();
  });
  it("acepta URL https y clave anon, y quita la barra final", () => {
    expect(readCloudConfig({ NEXT_PUBLIC_SUPABASE_URL: "https://a.supabase.co/", NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt("anon") }))
      .toEqual({ url: "https://a.supabase.co", anonKey: jwt("anon") });
  });
  it("rechaza http y URLs inválidas", () => {
    expect(readCloudConfig({ NEXT_PUBLIC_SUPABASE_URL: "http://a.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt("anon") })).toBeNull();
    expect(readCloudConfig({ NEXT_PUBLIC_SUPABASE_URL: "nada", NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt("anon") })).toBeNull();
  });
  it("rechaza una clave service_role en la variable pública", () => {
    expect(readCloudConfig({ NEXT_PUBLIC_SUPABASE_URL: "https://a.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt("service_role") })).toBeNull();
    expect(readCloudConfig({ NEXT_PUBLIC_SUPABASE_URL: "https://a.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_secret_abc" })).toBeNull();
  });
});

describe("looksLikeServiceRole", () => {
  it("distingue roles y tolera basura", () => {
    expect(looksLikeServiceRole(jwt("service_role"))).toBe(true);
    expect(looksLikeServiceRole(jwt("anon"))).toBe(false);
    expect(looksLikeServiceRole("sb_publishable_abc")).toBe(false);
    expect(looksLikeServiceRole("no-es-jwt")).toBe(false);
  });
});
