"use client";

import { useEffect, useState } from "react";
import type { Guide } from "@/lib/context/guide";

/** Consejos prácticos citados de Wikivoyage. Texto de voluntarios: se cita, se enlaza y se dice que no lo verificamos. */
export function GuideCard({ cityKey }: { cityKey: string }) {
  const [state, setState] = useState<{ status: "cargando" } | { status: "error" } | { status: "ok"; guide: Guide }>({ status: "cargando" });
  useEffect(() => {
    const ac = new AbortController();
    fetch(`/api/guia?city=${encodeURIComponent(cityKey)}`, { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((guide: Guide) => setState({ status: "ok", guide }))
      .catch((e) => { if (!ac.signal.aborted) { console.error(e); setState({ status: "error" }); } });
    return () => ac.abort();
  }, [cityKey]);

  return (
    <section className="rounded-2xl border border-line bg-surface p-4" aria-label="Guía del destino" aria-busy={state.status === "cargando"}>
      <h3 className="font-display text-base font-extrabold">Guía del destino</h3>
      {state.status === "cargando" ? <p className="mt-1 text-[13px] text-mid">Consultando la guía de viajeros…</p> : null}
      {state.status === "error" ? <p className="mt-1 text-[13px] text-fg2">No pudimos consultar la guía en este momento. Tu plan no depende de ella.</p> : null}
      {state.status === "ok" ? (
        <>
          {state.guide.tips.length === 0 ? <p className="mt-1 text-[13px] text-fg2">La guía de este destino no tiene consejos prácticos escritos todavía.</p> : null}
          <div className="mt-2 flex flex-col gap-2">
            {state.guide.tips.map((t) => (
              <details key={t.id} className="rounded-xl border border-line p-3 text-[13px]">
                <summary className="cursor-pointer font-bold">{t.title}{t.lang === "en" ? <span className="ml-2 rounded bg-line px-1.5 py-0.5 text-[10px] font-semibold text-mid">en inglés</span> : null}</summary>
                <p className="mt-2 text-fg2" lang={t.lang}>{t.text}</p>
              </details>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-mid">
            Texto de <a className="underline" href={state.guide.pageUrl} target="_blank" rel="noopener noreferrer">Wikivoyage</a> ({state.guide.license}), escrito por voluntarios. Travel Pulse no lo ha verificado y puede estar desactualizado.
            {state.guide.stale ? " Mostramos una copia guardada porque Wikivoyage no respondió ahora." : ""}
          </p>
        </>
      ) : null}
    </section>
  );
}
