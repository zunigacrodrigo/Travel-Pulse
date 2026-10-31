import { HomeView } from "@/components/screens/HomeView";
import { BottomTabBar } from "@/components/ui/BottomTabBar";
import { firstParam, parseRequest } from "@/lib/client/query";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const sp = await searchParams;
  const initial = parseRequest(firstParam(sp.q));
  return (
    <>
      <main className="flex flex-1 flex-col">
        <HomeView initial={initial} />
      </main>
      <BottomTabBar active="buscar" />
    </>
  );
}
