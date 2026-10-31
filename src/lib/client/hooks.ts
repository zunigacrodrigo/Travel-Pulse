"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

export type AsyncState<T> =
  | { status: "loading"; data: T | undefined; error: undefined }
  | { status: "success"; data: T; error: undefined }
  | { status: "error"; data: undefined; error: unknown };

/**
 * Ejecuta `fn` cuando cambia `key` (o al reintentar). Conserva el dato anterior
 * mientras recarga (`data` con status "loading"), útil para refetch sin parpadeo.
 */
export function useAsync<T>(fn: (signal: AbortSignal) => Promise<T>, key: string): AsyncState<T> & { retry: () => void } {
  const [state, setState] = useState<AsyncState<T>>({ status: "loading", data: undefined, error: undefined });
  const [attempt, setAttempt] = useState(0);
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });

  useEffect(() => {
    const ac = new AbortController();
    setState((s) => ({ status: "loading", data: s.status === "error" ? undefined : s.data, error: undefined }));
    fnRef
      .current(ac.signal)
      .then((data) => {
        if (!ac.signal.aborted) setState({ status: "success", data, error: undefined });
      })
      .catch((error: unknown) => {
        if (!ac.signal.aborted) setState({ status: "error", data: undefined, error });
      });
    return () => ac.abort();
  }, [key, attempt]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  return { ...state, retry } as AsyncState<T> & { retry: () => void };
}

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReduced(cb: () => void) {
  const mq = window.matchMedia(REDUCED_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia(REDUCED_QUERY).matches,
    () => false,
  );
}
