import type { Metadata } from "next";
import { DnaView } from "@/components/screens/DnaView";
import { BottomTabBar } from "@/components/ui/BottomTabBar";

export const metadata: Metadata = { title: "Mi Travel DNA | Travel Pulse" };

export default function ProfilePage() {
  return (
    <>
      <DnaView />
      <BottomTabBar active="perfil" />
    </>
  );
}
