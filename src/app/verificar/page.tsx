import type { Metadata } from "next";
import { VerifyView } from "@/components/verify/VerifyView";
import { BottomTabBar } from "@/components/ui/BottomTabBar";
import { engineNow } from "@/lib/server/http";

export const metadata: Metadata = { title: "Verificar mi itinerario | Travel Pulse" };
export const dynamic = "force-dynamic";

export default function VerifyPage() {
  const tomorrow = new Date(engineNow().getTime() + 86_400_000).toISOString().slice(0, 10);
  return (<><VerifyView defaultDate={tomorrow} /><BottomTabBar active="dia" /></>);
}
