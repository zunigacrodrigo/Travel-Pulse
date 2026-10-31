import type { Metadata } from "next";
import { SavedView } from "@/components/screens/SavedView";
import { BottomTabBar } from "@/components/ui/BottomTabBar";

export const metadata: Metadata = { title: "Guardados | Travel Pulse" };

export default function SavedPage() {
  return (
    <>
      <SavedView />
      <BottomTabBar active="guardados" />
    </>
  );
}
