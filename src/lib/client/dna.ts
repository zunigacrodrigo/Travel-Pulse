"use client";

import { validateDna, type TravelDna } from "./dna-core";
import { createJsonStore, useJsonStore } from "./storage";

const KEY = "tp-dna";

/** El perfil vive solo en este dispositivo (localStorage). */
const store = createJsonStore<TravelDna | null>(KEY, null, (raw) => validateDna(raw));

export function getDna(): TravelDna | null {
  return store.get();
}

/** Guarda el perfil y registra la fecha de edición. */
export function saveDna(dna: TravelDna): TravelDna {
  const next: TravelDna = { ...dna, updatedAt: new Date().toISOString() };
  store.set(next);
  return next;
}

/** Borra el perfil por completo, incluida la clave del almacenamiento local. */
export function clearDna(): void {
  store.set(null);
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* sin almacenamiento: no queda nada que borrar */
  }
}

/** Perfil del viajero; `undefined` mientras el cliente no se ha hidratado, `null` si no hay perfil. */
export function useDna(): TravelDna | null | undefined {
  return useJsonStore<TravelDna | null, undefined>(store, undefined);
}
