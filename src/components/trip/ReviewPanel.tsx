"use client";

import { useState } from "react";
import type { ReviewData } from "@/lib/day/refresh";
import type { PublicSignal } from "@/lib/pulsemesh/model";
import type { PlaceSignalsState } from "@/components/pulse/usePlaceSignals";
import { parseDayTripId } from "@/lib/trip-twin/dayTrip";
import { reviewTrip, type Finding } from "@/lib/trip-twin/review";
import type { Activity, PlanChange, Trip, TripPlan } from "@/lib/trip-twin/types";

interface Props {
  trip: Trip;
  activities: Activity[];
  plan: TripPlan;
  /** Aplica un cambio del motor (retrasar, cancelar…). Lo ejecuta la pantalla, que guarda el historial para deshacer. */
  onApplyChange: (change: PlanChange) => void;
  /** Aplica datos nuevos de una actividad (horarios con su fuente). Queda en el historial. */
  onApplyPatch: (activityId: string, patch: Partial<Activity>, label: string) => void;
  /** Reportes de viajeros de los lugares del viaje. En cada revisión se vuelven a consultar. */
  pulse: PlaceSignalsState;
}

const hhmm = (iso: string, tz: string) => new Intl.DateTimeFormat("es-CL", { hour: "2-digit", minute: "2-digit", timeZone: tz }).format(new Date(iso));

export function ReviewPanel({ trip, activities, plan, onApplyChange, onApplyPatch, pulse }: Props) {
  const ref = parseDayTripId(trip.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ReviewData | null>(null);
  /** `undefined`: la función de reportes no está disponible; `null`: se intentó y falló. */
  const [signals, setSignals] = useState<PublicSignal[] | null | undefined>(undefined);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  if (!ref) return null;

  async function run() {
    setBusy(true); setError(null); setDismissed(new Set());
    try {
      const places = [...new Set(activities.map((a) => a.location.placeId).filter((p): p is string => Boolean(p)))];
      const [res, fresh] = await Promise.all([
        fetch("/api/trip-review", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ city: ref!.city, date: ref!.date, places }) }),
        pulse.refresh(),
      ]);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? "No pudimos revisar el viaje.");
      setData(json as ReviewData); setSignals(fresh);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos revisar el viaje. Tu plan sigue guardado; inténtalo de nuevo.");
    } finally { setBusy(false); }
  }

  const result = data ? reviewTrip({ trip, activities, plan, date: ref.date, weather: data.weather, freshHours: data.hours, signals, now: data.checkedAt }) : null;
  const visible = result ? result.findings.filter((f) => !dismissed.has(f.id)) : [];
  const dismiss = (f: Finding) => setDismissed((s) => new Set(s).add(f.id));

  return (
    <section className="tt-card" id="tt-review" aria-label="Revisar con datos de hoy" style={{ padding: 20 }}>
      <header className="tt-section-heading">
        <div><h2>↻ Revisar con datos de hoy</h2><p>Vuelve a consultar horarios y pronóstico. Nada cambia sin que tú lo apruebes.</p></div>
        <button type="button" className="tt-primary" onClick={() => void run()} disabled={busy}>{busy ? "Revisando…" : data ? "Revisar de nuevo" : "Revisar ahora"}</button>
      </header>
      {error && <p role="alert" className="mt-3 text-xs text-red-300">{error}</p>}
      {data && result && (
        <div aria-live="polite" className="mt-3 space-y-3">
          <p className="text-[11px] text-slate-300">Revisado a las {hhmm(data.checkedAt, trip.timeZone)} · {data.sources.map((s) => `${s.name}: ${s.status === "ok" ? "ok" : s.status === "fuera_de_alcance" ? "fuera de alcance" : "no respondió"}`).join(" · ")}</p>
          {visible.length === 0 && (
            <p className="rounded-xl border border-slate-500/50 p-3 text-xs text-slate-200">
              {result.findings.length === 0 ? "No encontré cambios en lo que pude consultar: los horarios y el pronóstico coinciden con tu plan." : "Descartaste todos los avisos. Tu plan se mantiene."}
            </p>
          )}
          {visible.map((f) => (
            <article key={f.id} className="rounded-xl border border-amber-400/40 bg-amber-300/10 p-3" aria-label={`Aviso: ${f.activityName}`}>
              <p className="text-[11px] font-extrabold uppercase tracking-wide text-amber-200">{f.kind === "horario" ? "Cambió un horario · OpenStreetMap" : f.kind === "viajeros" ? "Reporte de viajeros · no oficial" : "Lluvia probable · Open-Meteo"}</p>
              <p className="mt-2 text-xs leading-5 text-slate-100">{f.message}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {f.kind === "horario" && <button type="button" className="tt-primary" onClick={() => { onApplyPatch(f.activityId, f.patch, `Actualizar horario de ${f.activityName}`); dismiss(f); }}>Actualizar horario</button>}
                {f.kind === "viajeros" && f.proposal && <button type="button" className="tt-primary" onClick={() => { onApplyChange(f.proposal!.change); dismiss(f); }}>{f.proposal.label}</button>}
                {f.kind === "lluvia" && f.proposal && <button type="button" className="tt-primary" onClick={() => { onApplyChange(f.proposal!.change); dismiss(f); }}>{f.proposal.label}</button>}
                <button type="button" className="rounded-lg border border-slate-500 px-3 py-2 text-[10px] font-bold text-slate-200" onClick={() => dismiss(f)}>Mantener mi plan</button>
              </div>
            </article>
          ))}
          {[...result.notes, ...data.warnings].filter((n, i, a) => a.indexOf(n) === i).map((n) => <p key={n} className="text-[11px] text-amber-200">{n}</p>)}
        </div>
      )}
    </section>
  );
}
