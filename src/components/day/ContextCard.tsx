"use client";

import { useEffect, useState } from "react";
import type { DayContext } from "@/lib/context/types";

/** Contexto del día: feriado, aire y UV. Cada dato dice de dónde viene; lo que no se pudo consultar se muestra. */
interface Props {
  cityKey: string; date: string;
  /** Cambia lo que es al aire libre por lugares bajo techo (solo se ofrece ante aire dañino y con un clic explícito). */
  onSwapIndoor?: () => void;
  /** ¿Queda algo al aire libre en el día? Si no, no se ofrece el cambio. */
  hasOutdoor?: boolean;
  busy?: boolean;
}

export function ContextCard({ cityKey, date, onSwapIndoor, hasOutdoor = false, busy = false }: Props) {
  const [state, setState] = useState<{ status: "cargando" } | { status: "error" } | { status: "ok"; ctx: DayContext }>({ status: "cargando" });
  useEffect(() => {
    const ac = new AbortController();
    fetch(`/api/contexto?city=${encodeURIComponent(cityKey)}&date=${encodeURIComponent(date)}`, { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((ctx: DayContext) => setState({ status: "ok", ctx }))
      .catch((e) => { if (!ac.signal.aborted) { console.error(e); setState({ status: "error" }); } });
    return () => ac.abort();
  }, [cityKey, date]);

  return (
    <section className="rounded-2xl border border-line bg-surface p-4" aria-label="Contexto del día" aria-busy={state.status === "cargando"}>
      <h3 className="font-display text-base font-extrabold">Contexto del día</h3>
      {state.status === "cargando" ? <p className="mt-1 text-[13px] text-mid">Consultando feriados, aire y radiación UV…</p> : null}
      {state.status === "error" ? <p className="mt-1 text-[13px] text-fg2">No pudimos consultar el contexto del día. El plan sigue siendo válido; solo falta esta información.</p> : null}
      {state.status === "ok" ? (
        <>
          {state.ctx.items.length === 0 && state.ctx.gaps.length === 0 ? <p className="mt-1 text-[13px] text-fg2">Sin novedades para ese día.</p> : null}
          <ul className="mt-2 flex flex-col gap-2">
            {state.ctx.items.map((i) => (
              <li key={i.id} data-severity={i.severity} className={`rounded-xl border p-3 text-[13px] ${i.severity === "aviso" ? "border-[#e0a43a] bg-[#e0a43a]/10" : "border-line"}`}>
                <p className="font-bold">{i.severity === "aviso" ? "⚠ " : ""}{i.title}</p>
                <p className="mt-0.5 text-fg2">{i.detail}</p>
                {i.kind === "aire" && i.severity === "aviso" && onSwapIndoor ? (
                  hasOutdoor
                    ? <button type="button" disabled={busy} onClick={onSwapIndoor} className="mt-2 rounded-lg border border-[#e0a43a] px-3 py-1.5 text-[12px] font-bold hover:bg-[#e0a43a]/15 disabled:opacity-50">Cambiar lo del aire libre por museos y galerías bajo techo</button>
                    : <p className="mt-2 text-[12px] font-semibold text-fg2">Tu día ya es bajo techo: no hay nada al aire libre que cambiar.</p>
                ) : null}
                <p className="mt-1 text-[11px] text-mid">
                  {i.certainty === "pronostico" ? "Pronóstico · " : "Dato publicado · "}
                  <a className="underline" href={i.source.url} target="_blank" rel="noopener noreferrer">{i.source.name}</a>
                </p>
              </li>
            ))}
          </ul>
          {state.ctx.gaps.length ? (
            <ul className="mt-2 text-[12px] text-mid">
              {state.ctx.gaps.map((g) => <li key={g.source}>Sin dato de {g.source}: {g.reason}</li>)}
            </ul>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
