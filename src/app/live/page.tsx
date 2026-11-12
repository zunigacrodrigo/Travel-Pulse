import { LiveView } from "@/components/screens/LiveView";
export const metadata = { title: "Travel Pulse Live · Señales de viajeros", description: "Observaciones recientes de viajeros, con vigencia y confianza explicables." };
export default async function LivePage({ searchParams }: { searchParams: Promise<{ city?: string | string[] }> }) {
  const params = await searchParams;
  const city = typeof params.city === "string" ? params.city : undefined;
  return <><main className="flex flex-1 flex-col"><LiveView initialCity={city} /></main></>;
}
