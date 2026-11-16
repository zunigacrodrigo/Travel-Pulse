"use client";

import Link from "next/link";
import { useState } from "react";
import { getCloud } from "@/lib/cloud/client";
import { kindLabel, reportInputSchema, toInsertRow, TTL_HOURS, type Category } from "@/lib/pulsemesh/model";
import { NO_REPORTS, summarizePlace } from "@/lib/pulsemesh/place";
import { PulseError, supabasePulseStore } from "@/lib/pulsemesh/store";
import type { PlaceSignalsState } from "./usePlaceSignals";

/** Lo que se puede reportar de un lugar con un toque. La seguridad queda fuera del piloto. */
const QUICK: ReadonlyArray<{ category: Category; kind: string }> = [
  { category: "afluencia", kind: "fila_larga" }, { category: "afluencia", kind: "muy_lleno" }, { category: "afluencia", kind: "tranquilo" },
  { category: "condiciones", kind: "cerrado" }, { category: "condiciones", kind: "obras" }, { category: "condiciones", kind: "buen_estado" },
];

/** `tt`: Mi viaje (paleta oscura propia). `day`: Mi día (tokens del tema, que cambian en modo claro). */
const TONE = {
  tt:  { muted: "text-slate-400", strong: "text-slate-100", warn: "text-amber-200", btn: "border-slate-500 text-slate-100", box: "border-slate-500/60", legend: "text-slate-200", note: "text-slate-300", on: "border-sky-300 bg-sky-300/15 text-sky-200", off: "border-slate-500 text-slate-200", go: "bg-sky-400 text-slate-900", ok: "text-emerald-300", err: "text-red-300", link: "text-sky-300" },
  day: { muted: "text-mid", strong: "text-fg", warn: "text-[#f0a53a]", btn: "border-line text-fg", box: "border-line", legend: "text-fg2", note: "text-fg2", on: "border-signal bg-signal/15 text-signal", off: "border-line text-fg2", go: "bg-signal text-ink", ok: "text-good", err: "text-alert", link: "text-signal" },
} as const;

interface Props { cityKey: string; placeId: string; placeName: string; state: PlaceSignalsState; tone?: keyof typeof TONE }

/** Línea de viajeros bajo una parada: lo que reportaron, quién puede confirmarlo y cómo reportar. Nunca presenta nada como oficial. */
export function PlaceSignals({ cityKey, placeId, placeName, state, tone = "tt" }: Props) {
  const t = TONE[tone];
  const { status, signals, session, refresh } = state;
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<(typeof QUICK)[number] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const cloud = getCloud();

  if (status === "no_disponible") return <p className={`mt-1 text-[11px] ${t.muted}`}>Reportes de viajeros: no disponibles en esta instalación.</p>;
  if (status === "cargando") return <p className={`mt-1 text-[11px] ${t.muted}`} aria-live="polite">Consultando reportes de viajeros…</p>;
  if (status === "error") return <p className={`mt-1 text-[11px] ${t.warn}`}>No se pudieron consultar los reportes de viajeros.</p>;

  const summary = summarizePlace(signals, placeId, new Date());
  const shown = summary.corroborated[0] ?? summary.reports[0];
  const canAct = Boolean(cloud && session && shown && !shown.isMine);

  async function act(fn: () => Promise<void>, ok: string) {
    setBusy(true); setMsg(null);
    try { await fn(); setMsg({ kind: "ok", text: ok }); await refresh(); }
    catch (e) { setMsg({ kind: "error", text: e instanceof PulseError ? e.message : "No se pudo completar la acción. Inténtalo de nuevo." }); }
    finally { setBusy(false); }
  }

  function send() {
    if (!cloud || !session || !picked) return;
    const parsed = reportInputSchema.safeParse({ category: picked.category, kind: picked.kind, title: kindLabel(picked.category, picked.kind), placeId, placeName });
    if (!parsed.success) { setMsg({ kind: "error", text: parsed.error.issues[0]?.message ?? "Revisa el reporte." }); return; }
    void act(async () => { await supabasePulseStore(cloud).create(toInsertRow(parsed.data, session.user.id, cityKey)); setOpen(false); setPicked(null); }, "Gracias. Tu reporte quedó publicado sin tu nombre.");
  }

  return (
    <div className="mt-1 text-[11px] leading-4" aria-label={`Reportes de viajeros: ${placeName}`} role="group">
      <p className={summary.state === "sin_reportes" ? t.muted : t.strong}>
        <span aria-hidden="true">👥 </span>{summary.state === "sin_reportes" ? NO_REPORTS : summary.headline}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        {canAct && shown && (
          <>
            <button type="button" disabled={busy} className={`rounded-md border px-2 py-1 font-bold disabled:opacity-50 ${t.btn}`} onClick={() => void act(() => supabasePulseStore(cloud!).respond(shown.id, session!.user.id, "confirma"), "Gracias, registramos que lo confirmas.")}>Lo confirmo</button>
            <button type="button" disabled={busy} className={`rounded-md border px-2 py-1 font-bold disabled:opacity-50 ${t.btn}`} onClick={() => void act(() => supabasePulseStore(cloud!).respond(shown.id, session!.user.id, "contradice"), "Gracias, registramos que no coincide.")}>No es así</button>
          </>
        )}
        {cloud && session && <button type="button" aria-expanded={open} className={`rounded-md border px-2 py-1 font-bold ${t.btn}`} onClick={() => { setOpen(!open); setMsg(null); }}>Reportar algo de este lugar</button>}
        {cloud && session === null && <Link href="/cuenta" className={`font-bold underline ${t.link}`}>Inicia sesión para reportar</Link>}
      </div>
      {open && (
        <fieldset className={`mt-2 rounded-lg border p-2 ${t.box}`}>
          <legend className={`px-1 font-bold ${t.legend}`}>¿Qué viste en {placeName}?</legend>
          <div className="flex flex-wrap gap-1.5">
            {QUICK.map((q) => (
              <button key={q.kind} type="button" aria-pressed={picked?.kind === q.kind} className={`rounded-full border px-2.5 py-1 font-semibold ${picked?.kind === q.kind ? t.on : t.off}`} onClick={() => setPicked(q)}>{kindLabel(q.category, q.kind)}</button>
            ))}
          </div>
          {picked && (
            <>
              <p className={`mt-2 ${t.note}`}>Se publica sin tu nombre y dura {TTL_HOURS[picked.category]} h. No se envía tu ubicación: solo el lugar. Es una observación tuya, no una fuente oficial.</p>
              <button type="button" disabled={busy} className={`mt-2 rounded-md px-3 py-1.5 font-extrabold disabled:opacity-50 ${t.go}`} onClick={send}>Publicar reporte</button>
            </>
          )}
        </fieldset>
      )}
      {msg && <p role={msg.kind === "error" ? "alert" : "status"} className={`mt-1 ${msg.kind === "error" ? t.err : t.ok}`}>{msg.text}</p>}
    </div>
  );
}
