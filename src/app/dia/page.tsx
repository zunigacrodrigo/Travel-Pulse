import type { Metadata } from "next";
import { DayView } from "@/components/day/DayView";
import { BottomTabBar } from "@/components/ui/BottomTabBar";
import { engineNow } from "@/lib/server/http";

export const metadata: Metadata = { title: "Mi día en la ciudad | Travel Pulse" };
// La fecha por defecto (mañana) depende del día: no se puede prerenderizar en el build.
export const dynamic = "force-dynamic";

export default function DayPage() {
  const tomorrow = new Date(engineNow().getTime() + 86_400_000).toISOString().slice(0, 10);
  return (
    <>
      <DayView defaultDate={tomorrow} />
      <BottomTabBar active="dia" />
    </>
  );
}
