import type { Metadata } from "next";
import { SavedView } from "@/components/screens/SavedView";

export const metadata: Metadata = { title: "Guardados | Travel Pulse" };

export default function SavedPage() {
  return (
    <>
      <SavedView />
    </>
  );
}
