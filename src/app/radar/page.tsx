import type { Metadata } from "next";
import { RadarView } from "@/components/screens/RadarView";
import { BottomTabBar } from "@/components/ui/BottomTabBar";

export const metadata: Metadata = { title: "Radar en vivo | Travel Pulse" };

export default function RadarPage() {
  return (
    <>
      <RadarView />
      <BottomTabBar active="live" />
    </>
  );
}
