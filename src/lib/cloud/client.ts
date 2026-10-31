"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readCloudConfig } from "./config";

let cached: SupabaseClient | null | undefined;

/** Cliente de Supabase con la clave pública; `null` si la nube no está configurada. */
export function getCloud(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  // Referencias estáticas: Next solo sustituye `process.env.NEXT_PUBLIC_*` escritas así.
  const cfg = readCloudConfig({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  cached = cfg
    ? createClient(cfg.url, cfg.anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" } })
    : null;
  return cached;
}
