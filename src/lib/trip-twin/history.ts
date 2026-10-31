import { z } from "zod";
import { activitySchema, tripPlanSchema, tripSchema } from "./types";

/** Máximo de instantáneas guardadas; mantiene el historial dentro de los límites de localStorage. */
export const MAX_HISTORY = 20;

export const snapshotSchema = z.object({
  label: z.string().max(200),
  at: z.string(),
  trip: tripSchema,
  activities: z.array(activitySchema),
  plan: tripPlanSchema,
});
export type Snapshot = z.infer<typeof snapshotSchema>;

export const historySchema = z.object({
  past: z.array(snapshotSchema),
  future: z.array(snapshotSchema),
});
export type History = z.infer<typeof historySchema>;

export function emptyHistory(): History {
  return { past: [], future: [] };
}

/** Registra el estado previo a un cambio. Un cambio nuevo invalida lo que se podía rehacer. */
export function pushSnapshot(history: History, snapshot: Snapshot): History {
  return { past: [...history.past, snapshot].slice(-MAX_HISTORY), future: [] };
}

/** Vuelve al estado anterior; el actual pasa a «rehacer». Devuelve null si no hay nada que deshacer. */
export function undo(history: History, current: Snapshot): { history: History; restored: Snapshot } | null {
  const restored = history.past.at(-1);
  if (!restored) return null;
  return {
    restored,
    history: { past: history.past.slice(0, -1), future: [current, ...history.future].slice(0, MAX_HISTORY) },
  };
}

export function redo(history: History, current: Snapshot): { history: History; restored: Snapshot } | null {
  const restored = history.future[0];
  if (!restored) return null;
  return {
    restored,
    history: { past: [...history.past, current].slice(-MAX_HISTORY), future: history.future.slice(1) },
  };
}

/** Lee historial guardado; ante datos inválidos o corruptos devuelve un historial vacío. */
export function parseHistory(value: unknown): History {
  const parsed = historySchema.safeParse(value);
  return parsed.success ? parsed.data : emptyHistory();
}
