import type { Metadata } from "next";
import { DnaView } from "@/components/screens/DnaView";

export const metadata: Metadata = { title: "Mi Travel DNA | Travel Pulse" };

export default function ProfilePage() {
  return (
    <>
      <DnaView />
    </>
  );
}
