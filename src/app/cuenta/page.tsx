import type { Metadata } from "next";
import { AccountView } from "@/components/screens/AccountView";

export const metadata: Metadata = { title: "Mi cuenta | Travel Pulse" };

export default function AccountPage() {
  return (
    <>
      <AccountView />
    </>
  );
}
