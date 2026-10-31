import type { Metadata } from "next";
import { DestinationView } from "@/components/screens/DestinationView";
import { firstParam } from "@/lib/client/query";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `${id.toUpperCase()} | Travel Pulse` };
}

export default async function DestinationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  return <DestinationView key={id} id={id.toUpperCase()} q={firstParam(sp.q)} />;
}
