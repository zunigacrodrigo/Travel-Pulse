import { HomeView } from "@/components/screens/HomeView";
import { engineNow } from "@/lib/server/http";
import { firstParam, parseRequest } from "@/lib/client/query";

export const dynamic = "force-dynamic";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const sp = await searchParams;
  const initial = parseRequest(firstParam(sp.q));
  return (
    <>
      <main className="flex flex-1 flex-col">
        <HomeView initial={initial} defaultDate={new Date(engineNow().getTime() + 86_400_000).toISOString().slice(0, 10)} />
      </main>
    </>
  );
}
