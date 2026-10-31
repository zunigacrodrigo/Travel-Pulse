export interface CloudConfig {
  url: string;
  anonKey: string;
}

/**
 * Configuración pública de Supabase. La clave `anon` es pública por diseño: la seguridad la
 * dan las políticas RLS de la base. La clave `service_role` jamás debe usarse en el navegador.
 * Sin estas variables la app funciona igual, solo en este dispositivo.
 */
export function readCloudConfig(env: Record<string, string | undefined>): CloudConfig | null {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
  } catch {
    return null;
  }
  // Una clave service_role pegada por error en una variable pública no debe llegar al navegador.
  if (looksLikeServiceRole(anonKey)) return null;
  return { url: url.replace(/\/+$/, ""), anonKey };
}

/** Detecta un JWT de Supabase cuyo rol sea `service_role`. */
export function looksLikeServiceRole(key: string): boolean {
  if (key.startsWith("sb_secret_")) return true;
  const part = key.split(".")[1];
  if (!part) return false;
  try {
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, "="))) as { role?: string };
    return json.role === "service_role";
  } catch {
    return false;
  }
}
