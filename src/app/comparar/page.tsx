import type { Metadata } from "next";
import { CompareView } from "@/components/screens/CompareView";
import { firstParam } from "@/lib/client/query";
import type { ComparePriority } from "@/lib/types";

export const metadata: Metadata = { title: "Comparar destinos | Travel Pulse" };

const PRIORITIES: ComparePriority[] = ["precio", "experiencia", "menos_gente"];

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string | string[]; b?: string | string[]; q?: string | string[]; priority?: string | string[] }>;
}) {
  const sp = await searchParams;
  const a = firstParam(sp.a)?.toUpperCase();
  const b = firstParam(sp.b)?.toUpperCase();
  const p = firstParam(sp.priority);
  const priority = PRIORITIES.find((x) => x === p);
  return (
    <div className="flex flex-1 flex-col">
      <CompareView a={a} b={b} q={firstParam(sp.q)} priority={priority} />
    </div>
  );
}
