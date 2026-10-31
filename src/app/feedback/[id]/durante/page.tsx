import type { Metadata } from "next";
import { FeedbackDuring } from "@/components/screens/FeedbackDuring";

export const metadata: Metadata = { title: "Durante el viaje | Travel Pulse" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <FeedbackDuring id={id.toUpperCase()} />;
}
