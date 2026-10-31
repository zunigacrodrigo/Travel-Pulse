import type { Metadata } from "next";
import { FeedbackBefore } from "@/components/screens/FeedbackBefore";

export const metadata: Metadata = { title: "Antes del viaje | Travel Pulse" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <FeedbackBefore id={id.toUpperCase()} />;
}
