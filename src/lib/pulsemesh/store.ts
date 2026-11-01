import type { SupabaseClient } from "@supabase/supabase-js";
import { friendlyError, parsePublicSignals, type InsertRow, type PublicSignal } from "./model";

/** Error con un mensaje ya pensado para mostrarle a la persona. */
export class PulseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PulseError";
  }
}

export type FlagReason = "falso" | "spam" | "ofensivo" | "privacidad" | "otro";
export type Verdict = "confirma" | "contradice";

export interface PulseStore {
  list(cityKey: string): Promise<PublicSignal[]>;
  create(row: InsertRow): Promise<void>;
  respond(signalId: string, userId: string, verdict: Verdict): Promise<void>;
  flag(signalId: string, userId: string, reason: FlagReason): Promise<void>;
  remove(signalId: string): Promise<void>;
}

function check(error: { code?: string; message?: string } | null): void {
  if (error) throw new PulseError(friendlyError(error));
}

/** Acceso a PulseMesh con la sesión de la persona. La seguridad la imponen las políticas RLS de la base. */
export function supabasePulseStore(db: SupabaseClient): PulseStore {
  return {
    async list(cityKey) {
      const { data, error } = await db.from("pulse_signals_public").select("*").eq("city_key", cityKey).order("observed_at", { ascending: false }).limit(50);
      check(error);
      return parsePublicSignals(data);
    },
    async create(row) {
      const { error } = await db.from("pulse_signals").insert(row);
      check(error);
    },
    async respond(signalId, userId, verdict) {
      const { error } = await db.from("pulse_confirmations").insert({ signal_id: signalId, user_id: userId, verdict });
      check(error);
    },
    async flag(signalId, userId, reason) {
      const { error } = await db.from("pulse_flags").insert({ signal_id: signalId, user_id: userId, reason });
      check(error);
    },
    async remove(signalId) {
      const { error } = await db.from("pulse_signals").delete().eq("id", signalId);
      check(error);
    },
  };
}
