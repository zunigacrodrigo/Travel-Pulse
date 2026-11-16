"use client";

import { useEffect, useState } from "react";
import type { Entorno } from "@/lib/context/entorno";

/** Patrimonio protegido y aves más registradas cerca del centro. Cada lista dice qué mide y qué NO mide. */
export function EntornoCard({ cityKey }: { cityKey: string }) {
  const [state, setState] = useState<{ status: "cargando" } | { status: "error" } | { status: "ok"; e: Entorno }>({ status: "cargando" });
  useEffect(() => {
    const ac = new AbortController();
    fetch(`/api/entorno?city=${encodeURIComponent(cityKey)}`, { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((e: Entorno) => setState({ status: "ok", e }))
      .catch((err) => { if (!ac.signal.aborted) { console.error(err); setState({ status: "error" }); } });
    return () => ac.abort();
  }, [cityKey]);

  return (
    <section className="rounded-2xl border border-line bg-surface p-4" aria-label="Patrimonio y naturaleza" aria-busy={state.status === "cargando"}>
      <h3 className="font-display text-base font-extrabold">Patrimonio y naturaleza</h3>
      {state.status === "cargando" ? <p className="mt-1 text-[13px] text-mid">Consultando patrimonio protegido y aves…</p> : null}
      {state.status === "error" ? <p className="mt-1 text-[13px] text-fg2">No pudimos consultar esta información ahora. Tu plan no depende de ella.</p> : null}
      {state.status === "ok" ? (
        <>
          {state.e.heritage ? (
            <div className="mt-2">
              <h4 className="text-[13px] font-bold">Patrimonio protegido a menos de {state.e.heritage.radiusKm} km del centro</h4>
              <ul className="mt-1 flex flex-col gap-1.5 text-[13px]">
                {state.e.heritage.sites.map((s) => (
                  <li key={s.id}>
                    <a className="font-semibold underline" href={s.url} target="_blank" rel="noopener noreferrer">{s.name}</a>
                    <span className="text-fg2"> · {s.designations.length ? s.designations.join(" · ") : "con declaratoria"}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-[11px] text-mid">Según Wikidata (datos abiertos). Ordenado por cuántos idiomas de Wikipedia tienen artículo: indica qué tan conocido es, no si conviene visitarlo ni si está abierto.{state.e.heritage.stale ? " Copia guardada: Wikidata no respondió ahora." : ""}</p>
            </div>
          ) : null}
          {state.e.nature ? (
            <div className="mt-3">
              <h4 className="text-[13px] font-bold">Aves más registradas en una zona de unos {state.e.nature.areaKm} km de lado alrededor del centro</h4>
              <ul className="mt-1 flex flex-col gap-1 text-[13px]">
                {state.e.nature.species.map((b) => <li key={b.scientificName}><i>{b.scientificName}</i> <span className="text-fg2">· {b.records.toLocaleString("es-CL")} registros</span></li>)}
              </ul>
              <p className="mt-1 text-[11px] text-mid">GBIF, {state.e.nature.yearFrom}–{state.e.nature.yearTo}, {state.e.nature.totalRecords.toLocaleString("es-CL")} registros de aves en total. Cuenta registros de observadores, no cuántas aves hay: las especies urbanas comunes aparecen primero. Sin nombres comunes: la fuente no los trae.{state.e.nature.stale ? " Copia guardada: GBIF no respondió ahora." : ""}</p>
            </div>
          ) : null}
          {state.e.gaps.length ? <ul className="mt-2 text-[12px] text-mid">{state.e.gaps.map((g) => <li key={g.source}>Sin dato de {g.source}: {g.reason}</li>)}</ul> : null}
        </>
      ) : null}
    </section>
  );
}
