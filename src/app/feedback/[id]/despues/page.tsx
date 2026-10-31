import type { Metadata } from "next";
import { FeedbackAfter } from "@/components/screens/FeedbackAfter";

export const metadata: Metadata = { title: "Después del viaje | Travel Pulse" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <FeedbackAfter id={id.toUpperCase()} />;
}
