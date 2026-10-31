import type { Metadata } from "next";
import { AccountView } from "@/components/screens/AccountView";
import { BottomTabBar } from "@/components/ui/BottomTabBar";

export const metadata: Metadata = { title: "Mi cuenta | Travel Pulse" };

export default function AccountPage() {
  return (
    <>
      <AccountView />
      <BottomTabBar active="perfil" />
    </>
  );
}
