"use client";

import { useState } from "react";
import { getCompare } from "@/lib/client/api";
import { formatUsd } from "@/lib/client/format";
import { useAsync } from "@/lib/client/hooks";
import type { ComparePriority, CompareResponse, Destination, ScoreResult } from "@/lib/types";
import { DestinationPoster } from "../DestinationPoster";
import { FlapScore } from "../FlapScore";
import { ErrorPanel } from "../StatePanels";
import { Button } from "../ui/Button";
import { Chip } from "../ui/Chip";
import { Check } from "../ui/Icons";
import { PageHeader } from "../ui/PageHeader";

const PRIORITIES: Array<{ key: ComparePriority; label: string }> = [
  { key: "precio", label: "Precio" },
  { key: "experiencia", label: "Experiencia" },
  { key: "menos_gente", label: "Menos gente" },
];

function Side({ dest, result, dark }: { dest: Destination; result: ScoreResult; dark: boolean }) {
  return (
    <div className={`min-w-0 flex-1 overflow-hidden rounded-[18px] ${dark ? "panel bg-panel text-panel-fg" : "bg-surface"}`}>
      <div className="h-[120px]">
        <DestinationPoster poster={dest.poster} variant="card" />
      </div>
      <div className="px-3 pb-3 pt-2.5">
        <p className={`font-display text-[32px] font-extrabold leading-[0.9] tracking-[1px] ${dark ? "text-signal" : ""}`}>{dest.id}</p>
        <p className="mt-1 truncate text-[13px]">{dest.name}</p>
        <div className="mt-2">
          <FlapScore value={result.score} size="card" variant={dark ? "panel" : "plain"} />
        </div>
        <p className={`mt-1.5 text-[12px] ${dark ? "text-panel-mid" : "text-mid"}`}>
          {result.score == null ? "Información limitada" : formatUsd(result.cost.totalUsd)}
        </p>
      </div>
    </div>
  );
}

function Cell({ value, win, low }: { value: number | null; win: boolean; low: boolean }) {
  return (
    <span
      className={`inline-flex h-7 w-[60px] items-center justify-center gap-0.5 rounded-md font-display text-[17px] ${
        win ? "bg-signal font-extrabold text-ink" : low ? "font-semibold text-alert" : "font-semibold text-mid"
      }`}
    >
      {win ? (
        <>
          <Check size={10} />
          <span className="sr-only">Mejor: </span>
        </>
      ) : null}
      {value == null ? <span aria-label="Sin datos">–</span> : Math.round(value)}
    </span>
  );
}

function Loaded({ data, priority, setPriority, q, pending }: { data: CompareResponse; priority: ComparePriority; setPriority: (p: ComparePriority) => void; q?: string; pending: boolean }) {
  const { a, b, compare } = data;
  const qs = q ? `?q=${q}` : "";
  const aWins = compare.winner === "a";
  return (
    <main className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col gap-5 px-5 pb-6">
        <div className="flex gap-2.5">
          <Side dest={a} result={compare.a} dark />
          <Side dest={b} result={compare.b} dark={false} />
        </div>

        <section aria-labelledby="factor-table" className="rounded-2xl bg-surface px-4 py-1.5">
          <table className="w-full border-collapse">
            <caption id="factor-table" className="sr-only">
              Comparación por factor, de 0 a 100
            </caption>
            <thead>
              <tr className="text-[13px]">
                <th scope="col" className="py-2 text-left font-medium text-mid">
                  Factor, de 0 a 100
                </th>
                <th scope="col" className="w-[60px] py-2 text-center font-bold">
                  {a.name}
                </th>
                <th scope="col" className="w-[60px] py-2 text-center font-bold">
                  {b.name}
                </th>
              </tr>
            </thead>
            <tbody>
              {compare.rows.map((row, i) => (
                <tr key={row.key} className={`text-[14px] ${i < compare.rows.length - 1 ? "border-b border-line" : ""}`}>
                  <th scope="row" className="h-[42px] text-left font-normal">
                    {row.label}
                  </th>
                  <td className="text-center">
                    <Cell value={row.a} win={row.winner === "a"} low={row.a != null && row.a < 50} />
                  </td>
                  <td className="text-center">
                    <Cell value={row.b} win={row.winner === "b"} low={row.b != null && row.b < 50} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section aria-labelledby="priority-title">
          <h2 id="priority-title" className="font-display text-[22px] font-extrabold">
            Cuál elegir según tu prioridad
          </h2>
          <div role="radiogroup" aria-labelledby="priority-title" className="mt-2.5 flex flex-wrap gap-1.5">
            {PRIORITIES.map((p) => (
              <Chip key={p.key} size="md" radio selected={priority === p.key} onClick={() => setPriority(p.key)}>
                {p.label}
              </Chip>
            ))}
          </div>
          <p aria-live="polite" className={`mt-3 text-[15px] leading-[1.55] text-fg2 ${pending ? "opacity-60" : ""}`}>
            {compare.verdict}
          </p>
        </section>
      </div>

      <div className="sticky bottom-0 z-20 mt-auto flex gap-2.5 bg-[linear-gradient(180deg,transparent,var(--c-page)_40%)] px-5 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-8">
        <Button href={`/destino/${aWins ? a.id : b.id}${qs}`} className="flex-1 text-[16px]">
          Elegir {aWins ? a.name : b.name}
        </Button>
        <Button href={`/destino/${aWins ? b.id : a.id}${qs}`} variant="outlineBold" className="flex-1 text-[16px]">
          Elegir {aWins ? b.name : a.name}
        </Button>
      </div>
    </main>
  );
}

export function CompareView({ a, b, q, priority: initial }: { a?: string; b?: string; q?: string; priority?: ComparePriority }) {
  const [priority, setPriority] = useState<ComparePriority>(initial ?? "precio");
  const res = useAsync<CompareResponse>(
    (signal) => getCompare({ a: a ?? "", b: b ?? "", priority, q }, signal),
    `${a}|${b}|${priority}|${q ?? ""}`,
  );
  const backHref = `/resultados${q ? `?q=${q}` : ""}`;

  if (!a || !b) {
    return (
      <>
        <PageHeader backHref={backHref} title="Comparar destinos" />
        <main className="flex flex-1 flex-col px-5 pb-8">
          <h2 className="cond font-display text-[34px] font-extrabold leading-none">Elige dos destinos para comparar.</h2>
          <p className="mt-3 text-[15px] text-fg2">Desde tus resultados puedes comparar el primero con cualquier otro.</p>
          <Button href={backHref} variant="outlineBold" size="md" className="mt-6">
            Volver a los resultados
          </Button>
        </main>
      </>
    );
  }

  return (
    <>
      <PageHeader backHref={backHref} title="Comparar destinos" />
      {res.status === "error" ? (
        <main className="flex flex-1 flex-col">
          <ErrorPanel error={res.error} onRetry={res.retry} />
        </main>
      ) : res.data ? (
        <Loaded data={res.data} priority={priority} setPriority={setPriority} q={q} pending={res.status === "loading"} />
      ) : (
        <main className="flex flex-1 flex-col gap-5 px-5" aria-busy="true">
          <p role="status" className="sr-only">
            Cargando la comparación
          </p>
          <div className="flex gap-2.5">
            <div className="tp-pulse h-[280px] flex-1 rounded-[18px] bg-panel" />
            <div className="tp-pulse h-[280px] flex-1 rounded-[18px] bg-surface" />
          </div>
          <div className="tp-pulse h-[300px] rounded-2xl bg-surface" />
        </main>
      )}
    </>
  );
}
