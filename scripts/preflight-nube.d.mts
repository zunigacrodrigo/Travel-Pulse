export interface Check { level: "ok" | "aviso" | "error"; name: string; detail: string }
export function isServiceRoleKey(key: string): boolean;
export function checkEnv(env: Record<string, string | undefined>, opts?: { production?: boolean }): Check[];
export function probeSupabase(url: string, anonKey: string, fetchImpl?: typeof fetch): Promise<Check[]>;
export function formatChecks(checks: Check[]): string;
