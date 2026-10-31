"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ApiError, postWhatIf } from "@/lib/client/api";
import { capitalize, formatUsd, MONTHS } from "@/lib/client/format";
import type { WhatIfChange, WhatIfNumberDelta, WhatIfResult } from "@/lib/engine/whatif";
import type { TripRequest } from "@/lib/types";
import { Button } from "./ui/Button";
import { Stepper } from "./ui/Stepper";
import { Toggle } from "./ui/Toggle";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "done"; result: WhatIfResult };

function signed(n: number, fmt: (v: number) => string): string {
  if (n === 0) return "sin cambio";
  return `${n > 0 ? "+" : "−"}${fmt(Math.abs(n))}`;
}

function DeltaRow({ label, d, fmt, lowerIsBetter }: { label: string; d: WhatIfNumberDelta; fmt: (v: number) => string; lowerIsBetter?: boolean }) {
  const diff = d.diff;
  const good = diff === null || diff === 0 ? null : lowerIsBetter ? diff < 0 : diff > 0;
  return (
    <tr className="border-t border-line">
      <th scope="row" className="py-2 pr-2 text-left text-[13px] font-semibold">{label}</th>
      <td className="py-2 pr-2 text-right text-[13px]">{d.baseline === null ? "Sin datos" : fmt(d.baseline)}</td>
      <td className="py-2 pr-2 text-right text-[13px]">{d.scenario === null ? "Sin datos" : fmt(d.scenario)}</td>
      <td className={`py-2 text-right text-[13px] font-bold ${good === null ? "text-mid" : good ? "text-fg" : "text-alert"}`}>
        {diff === null ? "—" : signed(diff, fmt)}
      </td>
    </tr>
  );
}

/**
 * Travel What-If: el viajero cambia días, presupuesto, mes, viajeros o
 * flexibilidad y compara con su plan. Los cálculos los hace el servidor con el
 * mismo motor que puntúa el destino; este componente solo muestra el resultado.
 */
export function WhatIfPanel({ destinationId, destinationName, request }: { destinationId: string; destinationName: string; request: TripRequest }) {
  const ids = useId();
  const [draft, setDraft] = useState<TripRequest>(request);
  const [state, setState] = useState<State>({ status: "idle" });
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);

  const change: WhatIfChange = {};
  if (draft.days !== request.days) change.days = draft.days;
  if (draft.budgetUsd !== request.budgetUsd) change.budgetUsd = draft.budgetUsd;
  if (draft.month !== request.month) change.month = draft.month;
  if (draft.travelers !== request.travelers) change.travelers = draft.travelers;
  if (draft.flexibleDates !== request.flexibleDates) change.flexibleDates = draft.flexibleDates;
  const hasChange = Object.keys(change).length > 0;
  const loading = state.status === "loading";

  const patch = (p: Partial<TripRequest>) => {
    setDraft((d) => ({ ...d, ...p }));
    setState({ status: "idle" });
  };

  const simulate = async () => {
    abort.current?.abort();
    const ac = new AbortController();
    abort.current = ac;
    setState({ status: "loading" });
    try {
      const result = await postWhatIf({ request, destinationId, change }, ac.signal);
      if (!ac.signal.aborted) setState({ status: "done", result });
    } catch (e) {
      if (ac.signal.aborted || (e instanceof DOMException && e.name === "AbortError")) return;
      setState({ status: "error", message: e instanceof ApiError ? e.message : "No se pudo simular el escenario." });
    }
  };

  const reset = () => {
    abort.current?.abort();
    setDraft(request);
    setState({ status: "idle" });
  };

  const done = state.status === "done" ? state.result : null;
  const changedFactors = done?.factors.filter((f) => f.diff !== null && f.diff !== 0) ?? [];

  return (
    <section aria-labelledby={`${ids}-title`} className="rounded-2xl bg-surface p-4">
      <h2 id={`${ids}-title`} className="font-display text-[22px] font-extrabold">
        ¿Y si cambio algo?
      </h2>
      <p className="mt-1 text-[13px] leading-[1.5] text-fg2">
        Cambia el plan y compara el costo y el score de {destinationName} con tu versión actual.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-3">
        <Stepper label="Días" unit="días" value={draft.days} min={1} max={30} onChange={(v) => patch({ days: v })} />
        <Stepper label="Viajeros" unit="viajeros" value={draft.travelers} min={1} max={12} onChange={(v) => patch({ travelers: v })} />
        <label className="text-[12px] text-mid" htmlFor={`${ids}-month`}>
          Mes
          <select
            id={`${ids}-month`}
            value={draft.month}
            onChange={(e) => patch({ month: Number(e.target.value) })}
            className="mt-1 block min-h-11 rounded-xl border border-line bg-page px-3 font-display text-[16px] font-bold text-fg"
          >
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {capitalize(m)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[12px] text-mid" htmlFor={`${ids}-budget`}>
          Presupuesto (USD)
          <input
            id={`${ids}-budget`}
            type="number"
            inputMode="numeric"
            min={100}
            max={100000}
            step={50}
            value={draft.budgetUsd}
            onChange={(e) => {
              const n = Math.round(Number(e.target.value));
              if (Number.isFinite(n)) patch({ budgetUsd: Math.min(100000, Math.max(100, n)) });
            }}
            className="mt-1 block min-h-11 w-32 rounded-xl border border-line bg-page px-3 font-display text-[16px] font-bold text-fg"
          />
        </label>
        <Toggle label="Fechas flexibles" checked={draft.flexibleDates} onChange={(v) => patch({ flexibleDates: v })} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" onClick={simulate} disabled={!hasChange || loading}>
          {loading ? "Simulando…" : "Simular escenario"}
        </Button>
        <Button size="sm" variant="outline" onClick={reset} disabled={!hasChange && state.status === "idle"}>
          Volver a mi plan
        </Button>
      </div>
      {!hasChange && state.status === "idle" ? (
        <p className="mt-2 text-[12px] text-mid">Cambia al menos un valor para simular.</p>
      ) : null}

      <div aria-live="polite">
        {state.status === "error" ? (
          <p role="alert" className="mt-3 text-[13px] font-semibold text-alert">
            {state.message}
          </p>
        ) : null}

        {done ? (
          <div className="mt-4">
            <p className="text-[14px] leading-[1.5]">{done.verdict}</p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[300px] border-collapse">
                <caption className="sr-only">Comparación entre tu plan y el escenario</caption>
                <thead>
                  <tr className="text-[11px] uppercase tracking-wider text-mid">
                    <th scope="col" className="pb-1 text-left font-semibold">&nbsp;</th>
                    <th scope="col" className="pb-1 text-right font-semibold">Tu plan</th>
                    <th scope="col" className="pb-1 text-right font-semibold">Escenario</th>
                    <th scope="col" className="pb-1 text-right font-semibold">Diferencia</th>
                  </tr>
                </thead>
                <tbody>
                  <DeltaRow label="Costo total" d={done.totalUsd} fmt={formatUsd} lowerIsBetter />
                  <DeltaRow label="Vuelo" d={done.flightUsd} fmt={formatUsd} lowerIsBetter />
                  <DeltaRow label="Estadía" d={done.stayUsd} fmt={formatUsd} lowerIsBetter />
                  <DeltaRow label="Score" d={done.score} fmt={(v) => String(Math.round(v))} />
                  <DeltaRow label="Confianza" d={done.confidence} fmt={(v) => `${Math.round(v)}%`} />
                </tbody>
              </table>
            </div>
            {changedFactors.length > 0 ? (
              <p className="mt-3 text-[12px] leading-[1.5] text-mid">
                Factores que se mueven:{" "}
                {changedFactors.map((f) => `${f.label} ${signed(f.diff as number, (v) => String(Math.round(v)))}`).join(", ")}.
              </p>
            ) : null}
            <p className="mt-2 text-[11px] leading-4 text-mid">
              Simulación con los mismos datos de referencia del destino; no consulta tarifas en vivo ni garantiza precios futuros.
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
