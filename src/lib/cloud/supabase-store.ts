import type { SupabaseClient } from "@supabase/supabase-js";
import type { TravelDna } from "@/lib/client/dna-core";
import { validateTrips, type SavedTrip } from "@/lib/client/saved";
import type { CloudStore, TripDoc } from "./sync";

function fail(where: string, error: { message: string } | null): void {
  if (error) throw new Error(`${where}: ${error.message}`);
}

/** Implementación de `CloudStore` sobre Supabase. Toda la seguridad la imponen las políticas RLS. */
export function supabaseStore(db: SupabaseClient): CloudStore & {
  deleteSaved(userId: string, destinationId: string): Promise<void>;
  deleteAllMine(): Promise<void>;
} {
  return {
    async getDna(userId) {
      const { data, error } = await db.from("profiles").select("dna").eq("id", userId).maybeSingle();
      fail("leer perfil", error);
      return data?.dna ?? null;
    },
    async setDna(userId, dna: TravelDna) {
      const { data, error } = await db.from("profiles").update({ dna, dna_updated_at: dna.updatedAt }).eq("id", userId).select("id");
      fail("guardar perfil", error);
      return data?.length ?? 0;
    },
    async listSaved(userId) {
      const { data, error } = await db.from("saved_destinations").select("snapshot").eq("user_id", userId);
      fail("leer guardados", error);
      return validateTrips((data ?? []).map((r) => r.snapshot).filter(Boolean));
    },
    async upsertSaved(userId, items: SavedTrip[]) {
      const rows = items.map((snapshot) => ({ user_id: userId, destination_id: snapshot.destinationId, snapshot }));
      const { error } = await db.from("saved_destinations").upsert(rows, { onConflict: "user_id,destination_id" });
      fail("guardar guardados", error);
    },
    async getTrip(userId, localId) {
      const { data, error } = await db.from("user_trips").select("trip, activities, plan, history").eq("user_id", userId).eq("local_id", localId).maybeSingle();
      fail("leer viaje", error);
      return data ?? null;
    },
    async upsertTrip(userId, localId, doc: TripDoc) {
      const { error } = await db.from("user_trips").upsert({ user_id: userId, local_id: localId, ...doc }, { onConflict: "user_id,local_id" });
      fail("guardar viaje", error);
    },
    async deleteSaved(userId, destinationId) {
      const { error } = await db.from("saved_destinations").delete().eq("user_id", userId).eq("destination_id", destinationId);
      fail("quitar guardado", error);
    },
    async deleteAllMine() {
      const { error } = await db.rpc("delete_my_cloud_data");
      fail("borrar datos", error);
    },
  };
}
