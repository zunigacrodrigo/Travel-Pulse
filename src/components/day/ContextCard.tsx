"use client";

import { useEffect, useState } from "react";
import type { DayContext } from "@/lib/context/types";

/** Contexto del día: feriado, aire y UV. Cada dato dice de dónde viene; lo que no se pudo consultar se muestra. */
export function ContextCard({ cityKey, date }: { cityKey: string; date: string }) {
  const [state, setState] = useState<{ status: "cargando" } | { status: "error" } | { status: "ok"; ctx: DayContext }>({ status: "cargando" });
  useEffect(() => {
    const ac = new AbortController();
    setState({ status: "cargando" });
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
