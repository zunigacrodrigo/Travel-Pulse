import type { Metadata } from "next";
import { ResultsView } from "@/components/screens/ResultsView";
import { BottomTabBar } from "@/components/ui/BottomTabBar";
import { firstParam } from "@/lib/client/query";

export const metadata: Metadata = { title: "Tus 5 mejores opciones | Travel Pulse" };

export default async function ResultsPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const sp = await searchParams;
  const q = firstParam(sp.q);
  return (
    <>
      <main className="flex flex-1 flex-col">
        {/* key: al cambiar la búsqueda (sugerencias), el estado se reinicia. */}
        <ResultsView key={q ?? "default"} q={q} />
      </main>
      <BottomTabBar active="buscar" />
    </>
  );
}
