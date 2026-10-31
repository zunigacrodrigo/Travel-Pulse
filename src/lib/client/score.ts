import { SCORE_LOW, SCORE_MID } from "@/lib/types";

export type ScoreTone = "none" | "low" | "mid" | "high";

/** 0-49 coral, 50-69 ámbar, 70 o más normal. */
export function scoreTone(score: number | null | undefined): ScoreTone {
  if (score == null) return "none";
  if (score < SCORE_LOW) return "low";
  if (score < SCORE_MID) return "mid";
  return "high";
}

export const TONE_COLOR: Record<ScoreTone, string> = {
  none: "#4a6585",
  low: "#FF8A78",
  mid: "#FFC857",
  high: "#FFD400",
};

export function scoreColor(score: number | null | undefined): string {
  return TONE_COLOR[scoreTone(score)];
}
