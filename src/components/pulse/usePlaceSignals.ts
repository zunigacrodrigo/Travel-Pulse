"use client";

import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useState } from "react";
import { getCloud } from "@/lib/cloud/client";
import type { PublicSignal } from "@/lib/pulsemesh/model";
import { supabasePulseStore } from "@/lib/pulsemesh/store";

/** `no_disponible`: la nube no está configurada (no se puede ni preguntar). `error`: se preguntó y no respondió. Nunca se confunden con «sin reportes». */
export type SignalsStatus = "cargando" | "ok" | "error" | "no_disponible";

export interface PlaceSignalsState {
  status: SignalsStatus;
  signals: PublicSignal[];
  session: Session | null | undefined;
  /** Vuelve a consultar. Devuelve los reportes, `null` si falló, `undefined` si la nube no está disponible. */
  refresh: () => Promise<PublicSignal[] | null | undefined>;
}

/** Reportes vigentes de viajeros de varios lugares de una ciudad del piloto, con una sola consulta. */
export function usePlaceSignals(cityKey: string | null, placeIds: readonly string[]): PlaceSignalsState {
  const cloud = getCloud();
  const available = Boolean(cloud && cityKey);
  const [signals, setSignals] = useState<PublicSignal[]>([]);
  const [status, setStatus] = useState<SignalsStatus>(available ? "cargando" : "no_disponible");
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const key = [...new Set(placeIds)].sort().join(",");

  const refresh = useCallback(async () => {
    if (!cloud || !cityKey) return undefined;
    try {
      const rows = await supabasePulseStore(cloud).listForPlaces(cityKey, key ? key.split(",") : []);
      setSignals(rows); setStatus("ok");
      return rows;
    } catch {
      setStatus("error");
      return null;
    }
  }, [cloud, cityKey, key]);

  // Carga inicial: el estado cambia cuando llega la respuesta, no de forma síncrona dentro del efecto.
  useEffect(() => {
    if (!cloud || !cityKey) return;
    let active = true;
    supabasePulseStore(cloud).listForPlaces(cityKey, key ? key.split(",") : [])
      .then((rows) => { if (active) { setSignals(rows); setStatus("ok"); } })
      .catch(() => { if (active) setStatus("error"); });
    return () => { active = false; };
  }, [cloud, cityKey, key]);

  useEffect(() => {
    if (!cloud) return;
    let active = true;
    void cloud.auth.getSession().then(({ data }) => { if (active) setSession(data.session); });
    const { data } = cloud.auth.onAuthStateChange((_e, next) => setSession(next));
    return () => { active = false; data.subscription.unsubscribe(); };
  }, [cloud]);

  return { status, signals, session, refresh };
}
