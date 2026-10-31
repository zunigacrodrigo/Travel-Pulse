import type { Metadata } from "next";
import { SurpriseView } from "@/components/screens/SurpriseView";
import { firstParam } from "@/lib/client/query";

export const metadata: Metadata = { title: "Send Me Somewhere | Travel Pulse" };

export default async function SurprisePage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const sp = await searchParams;
  return <SurpriseView q={firstParam(sp.q)} />;
}
