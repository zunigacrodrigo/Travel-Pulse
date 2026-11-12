import type { Metadata } from "next";
import { DayView } from "@/components/day/DayView";
import { parseDayQuery } from "@/lib/day/query";
import { engineNow } from "@/lib/server/http";

export const metadata: Metadata = { title: "Mi día en la ciudad | Travel Pulse" };
// La fecha por defecto (mañana) depende del día: no se puede prerenderizar en el build.
export const dynamic = "force-dynamic";

export default async function DayPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const tomorrow = new Date(engineNow().getTime() + 86_400_000).toISOString().slice(0, 10);
  const prefill = parseDayQuery(await searchParams, tomorrow);
  return (
    <>
      <DayView prefill={prefill} />
    </>
  );
}
