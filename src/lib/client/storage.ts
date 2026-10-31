"use client";

import { useSyncExternalStore } from "react";

/** Pequeño store sobre localStorage, compatible con useSyncExternalStore. */
export interface JsonStore<T> {
  get(): T;
  set(value: T): void;
  subscribe(listener: () => void): () => void;
}

export function createJsonStore<T>(key: string, empty: T, validate: (raw: unknown) => T): JsonStore<T> {
  let cache: T | undefined;
  const listeners = new Set<() => void>();

  const read = (): T => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? validate(JSON.parse(raw)) : empty;
    } catch {
      return empty;
    }
  };

  return {
    get() {
      if (cache === undefined) cache = read();
      return cache;
    },
    set(value) {
      cache = value;
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {
        /* sin almacenamiento: el valor vive solo en memoria */
      }
      listeners.forEach((l) => l());
    },
    subscribe(listener) {
      listeners.add(listener);
      const onStorage = (e: StorageEvent) => {
        if (e.key === key || e.key === null) {
          cache = undefined;
          listener();
        }
      };
      window.addEventListener("storage", onStorage);
      return () => {
        listeners.delete(listener);
        window.removeEventListener("storage", onStorage);
      };
    },
  };
}

/** Lee un store; en el servidor y durante la hidratación devuelve `serverValue`. */
export function useJsonStore<T, S>(store: JsonStore<T>, serverValue: S): T | S {
  return useSyncExternalStore<T | S>(store.subscribe, store.get, () => serverValue);
}
