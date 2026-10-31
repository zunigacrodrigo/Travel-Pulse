"use client";

import { GAP_CRITERIA, type GapRatings } from "@/lib/types";
import { createJsonStore, useJsonStore, type JsonStore } from "./storage";

export interface FeedbackProgress {
  before?: { at: string; ratings: GapRatings };
  during?: { at: string };
  after?: { at: string };
}

function validateRatings(raw: unknown): GapRatings | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const out = {} as GapRatings;
  for (const k of GAP_CRITERIA) {
    const v = r[k];
    if (typeof v !== "number" || !Number.isFinite(v)) return null;
    out[k] = Math.min(10, Math.max(1, Math.round(v)));
  }
  return out;
}

function validateProgress(raw: unknown): FeedbackProgress {
  if (typeof raw !== "object" || raw === null) return {};
  const r = raw as Record<string, unknown>;
  const out: FeedbackProgress = {};
  const before = r.before as { at?: unknown; ratings?: unknown } | undefined;
  const ratings = before ? validateRatings(before.ratings) : null;
  if (before && ratings) out.before = { at: typeof before.at === "string" ? before.at : "", ratings };
  const during = r.during as { at?: unknown } | undefined;
  if (during && typeof during === "object") out.during = { at: typeof during.at === "string" ? during.at : "" };
  const after = r.after as { at?: unknown } | undefined;
  if (after && typeof after === "object") out.after = { at: typeof after.at === "string" ? after.at : "" };
  return out;
}

const EMPTY: FeedbackProgress = {};
const stores = new Map<string, JsonStore<FeedbackProgress>>();

function storeFor(destinationId: string): JsonStore<FeedbackProgress> {
  const key = `tp-fb:${destinationId.toUpperCase()}`;
  let s = stores.get(key);
  if (!s) {
    s = createJsonStore<FeedbackProgress>(key, EMPTY, validateProgress);
    stores.set(key, s);
  }
  return s;
}

export function markFeedback(
  destinationId: string,
  moment: "before" | "during" | "after",
  ratings?: GapRatings,
): void {
  const s = storeFor(destinationId);
  const current = s.get();
  const at = new Date().toISOString();
  if (moment === "before" && ratings) s.set({ ...current, before: { at, ratings } });
  else if (moment === "during") s.set({ ...current, during: { at } });
  else if (moment === "after") s.set({ ...current, after: { at } });
}

/** Progreso local del ciclo de feedback; null antes de hidratar. */
export function useFeedbackProgress(destinationId: string): FeedbackProgress | null {
  return useJsonStore(storeFor(destinationId), null);
}
