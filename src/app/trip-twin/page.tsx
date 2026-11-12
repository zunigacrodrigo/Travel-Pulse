"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import "./trip-twin.css";
import { buildTripPlan, replanTrip } from "@/lib/trip-twin/engine";
import { activitySchema, tripPlanSchema, tripSchema, type Activity, type PlanChange, type Trip, type TripPlan } from "@/lib/trip-twin/types";
import { cityPlaceToActivity, getWeatherSuggestion, loadCityWorkspace, saveCityActivities, saveCityTrip, type CityWorkspace } from "@/lib/trip-twin/city-workspace";
import type { TravelSignal } from "@/lib/signals/types";
import { pickRelevantSignal } from "@/lib/signals/trip-link";
import { NO_BUDGET } from "@/lib/trip-twin/import";
import { budgetBreakdown } from "@/lib/trip-twin/budget";
import { emptyHistory, parseHistory, pushSnapshot, redo, undo, type History, type Snapshot } from "@/lib/trip-twin/history";

function Clock({ value, zone }: { value: string; zone: string }) {
  return <>{new Intl.DateTimeFormat("es-CL", { hour: "2-digit", minute: "2-digit", timeZone: zone }).format(new Date(value))}</>;
}

/** Lo que hace falta para abrir un viaje real: viene de una ciudad explorada o de un plan que el viajero importó. */
type Boot = { trip: Trip; activities: Activity[]; plan: TripPlan | null; workspace: CityWorkspace | null };

function TripWorkbench({ boot }: { boot: Boot }) {
  const [activities, setActivities] = useState<Activity[]>(boot.activities);
  const [plan, setPlan] = useState<TripPlan>(() => boot.plan ?? buildTripPlan(boot.trip, boot.activities, { now: new Date().toISOString() }));
  const [notice, setNotice] = useState(boot.workspace ? `Itinerario de ${boot.workspace.city}. Horarios, precios y traslados sin datos se indican como pendientes.` : "Plan importado por ti. Las ubicaciones son aproximadas; lo que no tiene fuente queda sin confirmar.");
  const [hist, setHist] = useState<History>(emptyHistory);
  const [histLoaded, setHistLoaded] = useState(false);
  const [delayId, setDelayId] = useState(boot.activities.find((a) => a.importance !== "fixed")?.id ?? "");
  const [chat, setChat] = useState("");
  const [chatReply, setChatReply] = useState("");
  const [assistantProposal, setAssistantProposal] = useState<{ change: PlanChange; source: "anthropic" | "local"; preview: { status: TripPlan["status"]; warnings: number; conflicts: number } } | null>(null);
  const [chatBusy, setChatBusy] = useState(false);
  const [tripOverride, setTripOverride] = useState<Trip | null>(boot.workspace ? null : boot.trip);
  const [showAll, setShowAll] = useState(false);
  const [ready] = useState(true);
  const [workspace, setWorkspace] = useState<CityWorkspace | null>(boot.workspace);
  const [inboundSignal, setInboundSignal] = useState<TravelSignal | null>(null);
  const [signalActivityId, setSignalActivityId] = useState("");
  const [weatherDismissed, setWeatherDismissed] = useState(false);
  const [selectedId, setSelectedId] = useState<string>(boot.activities[0]?.id ?? "");
  const currentTrip = workspace?.trip ?? tripOverride ?? boot.trip;
  const weatherSuggestion = workspace && !weatherDismissed ? getWeatherSuggestion(workspace) : null;
  const activityById = useMemo(() => new Map<string, Activity>(activities.map((a): [string, Activity] => [a.id, a])), [activities]);
  const budget = useMemo(() => budgetBreakdown(currentTrip, activities), [currentTrip, activities]);
  const hardCount = plan.violations.filter((v) => v.severity === "hard").length;
  const warningCount = plan.violations.filter((v) => v.severity === "warning").length;
  const selected = activityById.get(selectedId) ?? activities[0];


  useEffect(() => {
    if (!tripOverride || inboundSignal) return;
    try {
      const saved = localStorage.getItem("travel-pulse-signals-v1");
      const found = saved ? pickRelevantSignal(JSON.parse(saved), tripOverride.destination) : null;
      if (found) setInboundSignal(found);
    } catch { /* las señales locales son opcionales */ }
  }, [tripOverride, inboundSignal]);

  useEffect(() => {
    try {
      const signalId = new URLSearchParams(window.location.search).get("signal");
      if (!signalId) return;
      const saved = localStorage.getItem("travel-pulse-signals-v1");
      if (!saved) return;
      const rows = JSON.parse(saved) as unknown;
      if (!Array.isArray(rows)) return;
      const signal = rows.find((row): row is TravelSignal => row && typeof row === "object" && "id" in row && row.id === signalId && "title" in row && "city" in row);
      if (signal && signal.source === "comunidad") setInboundSignal(signal);
    } catch { /* la señal local es opcional */ }
  }, []);

  useEffect(() => {
    if (ready) {
      try {
        if (workspace) saveCityActivities(workspace, activities);
        else localStorage.setItem("travel-pulse.trip-twin.v1", JSON.stringify({ trip: currentTrip, activities, plan }));
      }
      catch { setNotice("No se pudo guardar en este navegador. Los cambios solo permanecerán mientras esta pestaña esté abierta."); }
    }
  }, [activities, currentTrip, plan, ready, workspace]);

  const histKey = workspace ? `travel-pulse.trip-twin.history.v1:${workspace.city}|${workspace.country}` : "travel-pulse.trip-twin.history.v1";
  useEffect(() => {
    if (!ready) return;
    try { const raw = localStorage.getItem(histKey); setHist(raw ? parseHistory(JSON.parse(raw)) : emptyHistory()); }
    catch { setHist(emptyHistory()); }
    setHistLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  useEffect(() => {
    if (!histLoaded) return;
    try { localStorage.setItem(histKey, JSON.stringify(hist)); } catch { /* el historial es opcional */ }
  }, [hist, histLoaded, histKey]);

  function describeChange(change: PlanChange): string {
    if (change.type === "activity_cancelled") return `Cancelar ${activityById.get(change.activityId)?.name ?? "actividad"}`;
    if (change.type === "delay") return `Retrasar ${activityById.get(change.activityId)?.name ?? "actividad"} ${change.delayMinutes} min`;
    if (change.type === "budget_changed") return "Cambiar presupuesto";
    return change.description;
  }
  function snapshotNow(label: string): Snapshot {
    return { label, at: new Date().toISOString(), trip: currentTrip, activities, plan };
  }
  function remember(label: string) { setHist((old) => pushSnapshot(old, snapshotNow(label))); }
  function restore(target: Snapshot) {
    setActivities(target.activities); setPlan(target.plan);
    if (JSON.stringify(target.trip) !== JSON.stringify(currentTrip)) {
      if (workspace) { setWorkspace({ ...workspace, trip: target.trip }); saveCityTrip(workspace, target.trip); }
      else setTripOverride(target.trip);
    }
    if (!target.activities.some((a) => a.id === selectedId)) setSelectedId(target.activities[0]?.id ?? "");
    if (!target.activities.some((a) => a.id === delayId)) setDelayId(target.activities.find((a) => a.importance !== "fixed")?.id ?? "");
  }
  function doUndo() {
    const result = undo(hist, snapshotNow("Estado anterior al deshacer"));
    if (!result) return;
    const label = hist.past.at(-1)?.label ?? "cambio";
    setHist(result.history); restore(result.restored);
    setNotice(`Deshecho: ${label}. Puedes rehacerlo.`);
  }
  function doRedo() {
    const result = redo(hist, snapshotNow("Estado anterior al rehacer"));
    if (!result) return;
    setHist(result.history); restore(result.restored);
    setNotice("Cambio rehecho.");
  }

  function addSuggestion(name: string, location: Activity["location"], category?: string, placeId?: string) {
    if (activities.some((activity) => activity.name === name)) {
      setNotice(`${name} ya forma parte de este itinerario.`);
      return;
    }
    const evidence = { status: "unknown" as const, sourceId: null, observedAt: null, expiresAt: null };
    const mapped = category ? { status: "estimated" as const, sourceId: "openstreetmap", observedAt: new Date().toISOString(), expiresAt: null } : evidence;
    const activity = activitySchema.parse({ id: `osm-${placeId ?? name}`, name, category, location: { ...location, ...(placeId ? { placeId } : {}) }, durationMinutes: 60, importance: "normal", cost: { amount: null, currency: "USD", basis: "unknown" }, travelMinutesFromPrevious: null, travelEvidence: evidence, hoursEvidence: evidence, costEvidence: mapped, demoData: false });
    const next = [...activities, activity];
    setActivities(next);
    const result = buildTripPlan(currentTrip, next, { version: plan.version + 1, parentPlanId: plan.id, now: new Date().toISOString() });
    remember(`Añadir ${name}`); setPlan(result); setSelectedId(activity.id);
    setNotice(`${name} se añadió desde OpenStreetMap. Horarios, traslados y precios no están disponibles.`);
  }

  function applyChange(change: PlanChange) {
    try {
      const result = replanTrip(currentTrip, activities, plan, change, new Date().toISOString());
      remember(describeChange(change)); setPlan(result.plan);
      if (change.type === "activity_cancelled") {
        const remaining = activities.filter((activity) => activity.id !== change.activityId);
        setActivities(remaining);
        if (selectedId === change.activityId) setSelectedId(remaining[0]?.id ?? "");
        if (delayId === change.activityId) setDelayId(remaining.find((activity) => activity.importance !== "fixed")?.id ?? "");
      }
      if (change.type === "budget_changed") {
        const updatedTrip = { ...currentTrip, budget: { ...currentTrip.budget, amount: change.amount } };
        if (workspace) { const updatedWorkspace = { ...workspace, trip: updatedTrip }; setWorkspace(updatedWorkspace); saveCityTrip(workspace, updatedTrip); }
        else setTripOverride(updatedTrip);
      }
      setNotice(`${result.explanation} ${result.tradeoffs.join(" ")}`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "No se pudo recalcular el plan."); }
  }
  function moveActivity(activityId: string, delta: -1 | 1) {
    const index = activities.findIndex((activity) => activity.id === activityId);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= activities.length) return;
    const next = [...activities];
    [next[index], next[target]] = [next[target]!, next[index]!];
    setActivities(next);
    remember("Reordenar actividades");
    setPlan(buildTripPlan(currentTrip, next, { version: plan.version + 1, parentPlanId: plan.id, now: new Date().toISOString() }));
  }
  function adjustDuration(activityId: string, delta: -15 | 15) {
    const next = activities.map((activity) => activity.id === activityId ? { ...activity, durationMinutes: Math.max(15, Math.min(720, activity.durationMinutes + delta)) } : activity);
    setActivities(next); remember("Ajustar duración");
    setPlan(buildTripPlan(currentTrip, next, { version: plan.version + 1, parentPlanId: plan.id, now: new Date().toISOString() }));
  }
  function reset() {
    if (workspace) {
      remember("Reinicio del itinerario"); setActivities([]); setPlan(buildTripPlan(currentTrip, [], { version: plan.version + 1, parentPlanId: plan.id, now: new Date().toISOString() }));
      setNotice(`Itinerario de ${workspace.city} reiniciado. Puedes volver a elegir lugares en Explorar ciudad.`); setWeatherDismissed(true); return;
    }
    // Plan importado: se descarta de este dispositivo y se vuelve a la pantalla de inicio de Mi viaje.
    try { localStorage.removeItem("travel-pulse.trip-twin.v1"); localStorage.removeItem("travel-pulse.trip-twin.history.v1"); } catch { /* sin almacenamiento */ }
    window.location.assign("/trip-twin");
  }
  async function askTwin(requestedMessage = chat) {
    if (!requestedMessage.trim() || chatBusy) return;
    const message = requestedMessage;
    setChat(""); setChatBusy(true); setAssistantProposal(null);
    try {
      const response = await fetch("/api/trip-twin/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, trip: currentTrip, activities, plan }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? "Trip Twin no pudo interpretar la petición.");
      setChatReply(payload.data.message);
      setAssistantProposal(payload.data.proposal && payload.data.preview ? { change: payload.data.proposal as PlanChange, source: payload.data.source, preview: payload.data.preview } : null);
    } catch (error) {
      setChatReply(error instanceof Error ? error.message : "No pude preparar una propuesta. El plan sigue igual.");
    } finally { setChatBusy(false); }
  }

  function applyWeatherAlternative() {
    if (!workspace || !weatherSuggestion) return;
    const alternative = cityPlaceToActivity(weatherSuggestion.alternative, workspace.weatherUpdatedAt ?? new Date().toISOString());
    const replacement = { ...alternative, durationMinutes: weatherSuggestion.activity.durationMinutes, importance: weatherSuggestion.activity.importance };
    const next = activities.map((activity) => activity.id === weatherSuggestion.activity.id ? replacement : activity);
    remember("Alternativa por clima");
    setActivities(next);
    setPlan(buildTripPlan(currentTrip, next, { version: plan.version + 1, parentPlanId: plan.id, now: new Date().toISOString() }));
    setSelectedId(replacement.id); setDelayId(replacement.id); setWeatherDismissed(true);
    setNotice(`Alternativa aplicada. ${weatherSuggestion.explanation} El trayecto hacia el nuevo lugar aún no está calculado.`);
  }

  const featuredAttractions = workspace
    ? workspace.places.filter((place) => !activities.some((activity) => activity.location.placeId === place.id)).slice(0, 4).map((place) => ({ id: place.id, name: place.name, meta: place.category, time: "Lugar mapeado · OpenStreetMap", price: "Horario y precio no disponibles", tag: "Lugar", location: { latitude: place.latitude, longitude: place.longitude, placeId: place.id }, category: place.category }))
    : [] as { id: string; name: string; meta: string; time: string; price: string; tag: string; location: { latitude: number; longitude: number; placeId?: string }; category: string | undefined }[];
  const relatedSignalActivityId = activities.some((activity) => activity.id === signalActivityId)
    ? signalActivityId
    : activities.find((activity) => activity.importance !== "fixed")?.id ?? "";
  const proposeSignalAdjustment = (kind: "cancel" | "delay") => {
    const activity = activities.find((item) => item.id === relatedSignalActivityId);
    if (!inboundSignal || !activity) return;
    const request = kind === "cancel"
      ? `Cancela exactamente la actividad ${activity.name}. El viajero decidió esto después de revisar un reporte local.`
      : `Retrasa exactamente la actividad ${activity.name} 30 minutos. El viajero decidió esto después de revisar un reporte local.`;
    void askTwin(request);
  };

  return <main className="tt-shell">

    <div className="tt-main" id="trip-twin">
      {inboundSignal && <section className="tt-alert-banner" role="status"><b>Observación recibida desde Pulso · {inboundSignal.type}</b><small>“{inboundSignal.title}” · {inboundSignal.place}, {inboundSignal.city} · {new Date(inboundSignal.createdAt).toLocaleString("es-CL")} · {inboundSignal.confirmations} confirmaciones guardadas en este dispositivo. Es una observación local, no una alerta verificada. Elige una actividad para preparar una alternativa; no cambiaremos el plan sin tu aprobación.</small><div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]"><select aria-label="Actividad afectada por la observación" value={relatedSignalActivityId} onChange={(event) => setSignalActivityId(event.target.value)} className="min-h-10 rounded-lg border border-slate-500 bg-slate-900 px-3 text-xs text-slate-100">{activities.filter((activity) => activity.importance !== "fixed").map((activity) => <option key={activity.id} value={activity.id}>{activity.name}</option>)}</select><button type="button" disabled={!relatedSignalActivityId || chatBusy} onClick={() => proposeSignalAdjustment("delay")} className="rounded-lg border border-slate-500 px-3 py-2 text-xs font-bold text-slate-100 disabled:opacity-50">Preparar demora +30 min</button><button type="button" disabled={!relatedSignalActivityId || chatBusy} onClick={() => proposeSignalAdjustment("cancel")} className="rounded-lg border border-slate-500 px-3 py-2 text-xs font-bold text-slate-100 disabled:opacity-50">Preparar retiro</button></div></section>}
      <section className="tt-destination tt-card">
        <div className="tt-dest-top"><div><div className="tt-eyebrow">{workspace ? "TU VIAJE · CIUDAD" : "TU VIAJE IMPORTADO"}</div><h1>Tu viaje a {workspace?.city ?? tripOverride?.destination ?? currentTrip.destination}</h1><p>{workspace ? `${workspace.country} · ${new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeZone: currentTrip.timeZone }).format(new Date(currentTrip.startAt))} · 1 viajero` : `${new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeZone: currentTrip.timeZone }).format(new Date(currentTrip.startAt))} · ${currentTrip.travelers} viajero${currentTrip.travelers === 1 ? "" : "s"} · importado por ti`}</p></div><div className="tt-weather"><span>◌</span><div><b>Clima</b><small>{workspace?.weatherSource ? `${workspace.precipitationProbability ?? "—"}% prob. lluvia · Open-Meteo` : "Sin fuente conectada"}</small></div></div></div>
        <div className="tt-hero-photo"><div>PLAN DE VIAJE <h2>{workspace ? `${workspace.city}, ${workspace.country}` : currentTrip.destination}</h2><p>{workspace ? "Lugares de OpenStreetMap; horarios, precios y traslados se muestran como desconocidos." : "Itinerario importado por ti. Las ubicaciones son aproximadas; los traslados, precios y horarios de lugares quedan sin confirmar."}</p></div></div>
        <div className="tt-stats"><div><span className="tt-stat-icon">▤</span><div><small>{workspace ? "Itinerario de ciudad" : "Itinerario importado"}</small><b>{`${new Set(plan.items.map((i) => i.plannedStart.slice(0, 10))).size} día(s)`} · {plan.items.length} actividades</b></div></div><div><span className="tt-stat-icon">＄</span><div><small>{workspace ? "Coste" : "Coste parcial declarado"}</small><b>{plan.estimatedTotalCost === null ? "Aún no disponible" : `${plan.currency} ${plan.estimatedTotalCost.toFixed(0)}`}</b><small>{workspace ? "Precios no conectados" : "Solo lo que tú indicaste"}</small></div></div><div><span className="tt-stat-icon">▰</span><div><small>Traslados</small><b>Sin datos de ruta</b></div></div><div><span className="tt-stat-icon">✦</span><div><small>Recomendaciones</small><b>{workspace ? "Lugares mapeados" : "Aún sin conectar"}</b></div></div></div>
        <section className="tt-budget" aria-label="Presupuesto por categoría"><header><h3>Presupuesto por categoría</h3><small>{budget.currency} {budget.knownTotal.toFixed(0)} conocidos{budget.budget >= NO_BUDGET ? " · sin presupuesto definido" : ` de ${budget.budget.toFixed(0)}${budget.usedPct !== null ? ` · ${budget.usedPct}%` : ""}`}</small></header>{budget.usedPct !== null && budget.budget < NO_BUDGET && <div className="tt-budget-track" role="img" aria-label={`${budget.usedPct}% del presupuesto cubierto por costos conocidos`}><span style={{ width: `${Math.min(100, budget.usedPct)}%` }} className={budget.usedPct > 100 ? "over" : undefined} /></div>}{budget.rows.length ? <ul>{budget.rows.map((r) => <li key={r.category}><span>{r.category}<small>{r.activities} actividad{r.activities === 1 ? "" : "es"}{r.unknown ? ` · ${r.unknown} sin precio` : ""}</small></span><div className="tt-budget-bar"><span style={{ width: `${budget.knownTotal > 0 ? Math.round((r.known / budget.knownTotal) * 100) : 0}%` }} /></div><b>{r.known > 0 ? `${budget.currency} ${r.known.toFixed(0)}` : "—"}</b></li>)}</ul> : <p>Sin actividades en el itinerario.</p>}<p className="tt-budget-note">{budget.unknownCount ? `${budget.unknownCount} actividad${budget.unknownCount === 1 ? "" : "es"} sin precio: no se estiman, así que el total es parcial.` : "Todos los costos del itinerario están declarados."}</p></section>
        <div className="tt-section-heading" style={featuredAttractions.length === 0 ? { display: "none" } : undefined}><div><h2>Tu itinerario destacado</h2><p>Ideas para completar tu viaje</p></div><button onClick={() => setShowAll(!showAll)}>{showAll ? "Ver menos ↑" : "Ver todo →"}</button></div>
        <div className="tt-attraction-grid">{featuredAttractions.slice(0, showAll ? featuredAttractions.length : 2).map((a, i) => <article className="tt-attraction" key={a.id}><div className={`tt-attraction-photo photo-${i}`}>⌖</div><div className="tt-attraction-body"><b>{a.name}</b><small>{a.time}</small><small>{a.meta}</small><strong>{a.price}</strong><span className={`tt-tag tag-${i}`}>{a.tag}</span><button onClick={() => addSuggestion(a.name, a.location, a.category, workspace ? a.id : undefined)}>Añadir al viaje</button></div></article>)}</div>
      </section>

      <section className="tt-copilot tt-card">
        <header className="tt-copilot-header"><div className="tt-pulse-logo">⌁</div><div><h2>Trip Twin <span>Beta</span></h2><p>Ajustes explicables para tu itinerario</p></div><button className="tt-icon-button" onClick={reset} aria-label={workspace ? "Vaciar itinerario" : "Descartar plan importado"}>↻</button></header>
        <div className="tt-copilot-content"><div className="tt-steps"><div className="chosen">◉ <span>Entiende tu viaje</span></div><div>♧ <span>Analiza el contexto</span></div><div>◷ <span>Detecta cambios</span></div><div>▣ <span>Replanifica</span></div><div>◇ <span>Te muestra opciones</span></div></div><div className="tt-chat-panel"><div className="tt-chat-bubble"><div className="tt-bot-icon">✦</div><div><b>{workspace ? `Tu plan en ${workspace.city}` : `Tu plan en ${currentTrip.destination}`}</b><p>{workspace ? "Puedo preparar cambios acotados con tu itinerario y el motor determinista. Las propuestas requieren tu aprobación." : "Puedo preparar cambios acotados con tu plan importado. Lo que no tenga fuente sigue como desconocido; nada cambia sin tu aprobación."}</p><p className="tt-chat-subhead">Resumen del plan:</p><ul><li>◷ Tu itinerario tiene <b>{plan.items.length} actividades</b>.</li><li>⚑ Hay <b>{warningCount} advertencias</b> por datos incompletos.</li><li>✦ {workspace ? "El clima y los lugares consultados se muestran con su fuente." : "Las horas y duraciones son las que tú indicaste; el resto queda sin confirmar."}</li></ul></div></div>{chatReply && <div className="tt-reply" role="status">{chatReply}{assistantProposal && <div className="mt-3 rounded-xl border border-slate-500/60 p-3"><p className="text-[11px] font-bold">Vista previa · {assistantProposal.preview.conflicts} conflictos · {assistantProposal.preview.warnings} advertencias · interpretación {assistantProposal.source === "anthropic" ? "IA" : "local"}</p><div className="mt-2 flex flex-wrap gap-2"><button type="button" className="tt-primary" onClick={() => { applyChange(assistantProposal.change); setAssistantProposal(null); }}>Aplicar propuesta</button><button type="button" className="rounded-lg border border-slate-500 px-3 py-2 text-[10px] font-bold text-slate-200" onClick={() => { setAssistantProposal(null); setChatReply("Propuesta descartada. Tu itinerario se mantiene sin cambios."); }}>Mantener mi plan</button></div></div>}</div>}<div className="tt-quick-actions"><button onClick={() => document.getElementById("tt-itinerary")?.scrollIntoView({ behavior: "smooth" })}>Ver itinerario completo</button><button onClick={() => document.getElementById("tt-replan")?.scrollIntoView({ behavior: "smooth" })}>Ver cambios</button><button onClick={() => document.getElementById("tt-replan")?.scrollIntoView({ behavior: "smooth" })}>Modificar plan</button></div></div></div>
        <form className="tt-chat-input" onSubmit={(e) => { e.preventDefault(); void askTwin(); }}><input value={chat} onChange={e=>setChat(e.target.value)} placeholder="Ej. Retrasa el museo 30 minutos" aria-label="Pregunta a Trip Twin" maxLength={500} disabled={chatBusy}/><button aria-label="Enviar pregunta" type="submit" disabled={chatBusy || !chat.trim()}>{chatBusy ? "…" : "➤"}</button></form>
        <div className="tt-source-note">{workspace ? "Contexto externo disponible: clima Open-Meteo y lugares OpenStreetMap. Sin tráfico ni rutas en vivo." : "Plan importado: sin consultas externas todavía. Usa «Mi día» para contrastarlo con horarios y traslados reales."}</div>
      </section>

      <section className="tt-itinerary tt-card" id="tt-itinerary"><header className="tt-section-heading"><div><h2>← Itinerario</h2><p>{workspace ? `${new Intl.DateTimeFormat("es-CL", { dateStyle: "full", timeZone: currentTrip.timeZone }).format(new Date(currentTrip.startAt))} · itinerario de ciudad` : `Desde el ${new Intl.DateTimeFormat("es-CL", { dateStyle: "full", timeZone: currentTrip.timeZone }).format(new Date(currentTrip.startAt))} · itinerario importado`}</p></div><button onClick={reset}>Reiniciar</button></header><div className="tt-itinerary-body"><div className="tt-timeline">{plan.items.length ? plan.items.map((item, index) => { const a = activityById.get(item.activityId); if (!a) return null; return <article className={`tt-timeline-item tt-timeline-select${selectedId === a.id ? " is-selected" : ""}`} key={item.activityId}><div className="tt-timeline-content"><button className="tt-timeline-pick" onClick={() => setSelectedId(a.id)} aria-pressed={selectedId === a.id}><time><Clock value={item.plannedStart} zone={currentTrip.timeZone}/></time><div className="tt-timeline-dot"/><div className="tt-timeline-detail"><b>{a.name}</b><small><Clock value={item.plannedEnd} zone={currentTrip.timeZone}/> fin · {a.durationMinutes} min</small><small>Traslado: {item.travelMinutesFromPrevious === null ? "sin datos" : `${item.travelMinutesFromPrevious} min`}</small></div></button>{workspace && <div className="tt-duration-control"><button type="button" aria-label={`Restar 15 minutos a ${a.name}`} disabled={a.durationMinutes <= 15} onClick={() => adjustDuration(a.id, -15)}>−</button><span>{a.durationMinutes} min · ajustar bloque</span><button type="button" aria-label={`Sumar 15 minutos a ${a.name}`} onClick={() => adjustDuration(a.id, 15)}>+</button></div>}</div><div className="tt-order-controls"><button aria-label={`Mover ${a.name} hacia arriba`} disabled={index === 0} onClick={() => moveActivity(a.id, -1)}>↑</button><button aria-label={`Mover ${a.name} hacia abajo`} disabled={index === plan.items.length - 1} onClick={() => moveActivity(a.id, 1)}>↓</button></div></article>; }) : <p>No quedan actividades. Descarta el plan para empezar de nuevo.</p>}</div><div className="tt-map"><iframe title={`Mapa OpenStreetMap de ${selected?.name ?? workspace?.city ?? "São Paulo"}`} src={`https://www.openstreetmap.org/export/embed.html?bbox=${(selected?.location.longitude ?? workspace?.coordinates.longitude ?? -46.65) - 0.025}%2C${(selected?.location.latitude ?? workspace?.coordinates.latitude ?? -23.56) - 0.018}%2C${(selected?.location.longitude ?? workspace?.coordinates.longitude ?? -46.65) + 0.025}%2C${(selected?.location.latitude ?? workspace?.coordinates.latitude ?? -23.56) + 0.018}&layer=mapnik&marker=${selected?.location.latitude ?? workspace?.coordinates.latitude ?? -23.56}%2C${selected?.location.longitude ?? workspace?.coordinates.longitude ?? -46.65}`} loading="lazy"/><a className="tt-map-open" href={`https://www.openstreetmap.org/?mlat=${selected?.location.latitude ?? workspace?.coordinates.latitude ?? -23.56}&mlon=${selected?.location.longitude ?? workspace?.coordinates.longitude ?? -46.65}#map=14/${selected?.location.latitude ?? workspace?.coordinates.latitude ?? -23.56}/${selected?.location.longitude ?? workspace?.coordinates.longitude ?? -46.65}`} target="_blank" rel="noreferrer">Abrir mapa completo ↗</a><span className="tt-map-disclaimer">Mapa de OpenStreetMap · Los tiempos de traslado no están conectados</span></div></div></section>

      <section className="tt-replan tt-card" id="tt-replan"><header className="tt-section-heading"><div><h2>↖ Replanificación</h2><p>Prueba cómo cambia el plan ante un imprevisto</p></div><div className="tt-history-controls"><button type="button" onClick={doUndo} disabled={hist.past.length === 0} aria-label="Deshacer último cambio">↶ Deshacer</button><button type="button" onClick={doRedo} disabled={hist.future.length === 0} aria-label="Rehacer cambio">↷ Rehacer</button><span className="tt-version">v{plan.version}</span></div></header><div className="tt-alert-banner"><b>{workspace ? "Revisa el contexto del viaje" : "Prueba un imprevisto en tu plan"}</b><small>{workspace ? "Las sugerencias de clima requieren tu decisión." : "Elige una actividad para cancelarla o retrasarla."}</small></div>{weatherSuggestion && <div role="status" className="mt-3 rounded-xl border border-amber-400/40 bg-amber-300/10 p-3"><p className="text-[11px] font-extrabold uppercase tracking-wide text-amber-200">Alternativa por pronóstico · Open-Meteo</p><p className="mt-2 text-xs leading-5 text-slate-200">{weatherSuggestion.explanation}</p><p className="mt-2 text-xs"><b>{weatherSuggestion.activity.name}</b> → <b>{weatherSuggestion.alternative.name}</b> · lugar mapeado por OpenStreetMap</p><div className="mt-3 flex flex-wrap gap-2"><button className="tt-primary" onClick={applyWeatherAlternative}>Aplicar alternativa</button><button className="rounded-lg border border-slate-500 px-3 py-2 text-[10px] font-bold text-slate-200" onClick={() => { setWeatherDismissed(true); setNotice("Se mantiene el itinerario actual. Puedes revisar la sugerencia de clima después."); }}>Mantener mi plan</button></div></div>}<div className="tt-replan-controls">{activities.filter((a) => a.importance !== "fixed").map((a) => <button key={a.id} onClick={() => applyChange({ type: "activity_cancelled", activityId: a.id })}><span><b>{a.name}</b><small>Cancelar actividad</small></span><span>×</span></button>)}<label htmlFor="tt-delay">Simular demora</label><div className="tt-delay-row"><select id="tt-delay" value={delayId} onChange={(e) => setDelayId(e.target.value)}>{activities.filter((a) => a.importance !== "fixed").map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select><button className="tt-primary" disabled={!activities.some((a) => a.id === delayId)} onClick={() => applyChange({ type: "delay", activityId: delayId, delayMinutes: 30 })}>+30 min</button></div><div className="tt-result-note">{notice}</div></div><div className="tt-confidence"><div><small>Conflictos</small><b>{hardCount}</b></div><div><small>Advertencias</small><b>{warningCount}</b></div><div><small>Cambios guardados</small><b>{hist.past.length}</b></div></div>{hist.past.length > 0 && <div className="tt-history-list" aria-label="Historial de cambios"><h3>Historial</h3><ol>{[...hist.past].reverse().slice(0, 5).map((entry, i) => <li key={`${entry.at}-${i}`}><b>{entry.label}</b><small>v{entry.plan.version}</small></li>)}</ol></div>}</section>
      <footer className="tt-footer">TRAVEL PULSE · TRIP TWIN <span>Solo datos con fuente; lo demás, sin confirmar</span></footer>
    </div>
  </main>;
}

function EmptyTrip() {
  return (
    <main className="min-h-dvh bg-page px-5 pb-28 pt-16 text-fg">
      <div className="mx-auto max-w-xl rounded-[24px] border border-line bg-surface p-6 sm:p-8">
        <p className="text-xs font-extrabold uppercase tracking-[.2em] text-signal">Mi viaje</p>
        <h1 className="mt-3 font-display text-3xl font-extrabold leading-tight">Todavía no tienes un viaje guardado</h1>
        <p className="mt-3 text-base leading-7 text-fg2">Aquí aparece tu itinerario cuando armas tu día o traes un plan que ya tienes. No mostramos ejemplos: solo lo que es tuyo y lo que tiene fuente.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/" className="inline-flex min-h-12 items-center rounded-[14px] bg-signal px-6 font-display text-base font-extrabold text-ink">Armar mi día</Link>
          <Link href="/importar" className="inline-flex min-h-12 items-center rounded-[14px] border-2 border-border px-5 text-base font-semibold text-fg">Traer un plan que ya tengo</Link>
        </div>
      </div>
    </main>
  );
}

/** Un viaje guardado antes de que existiera la regla «solo datos reales» puede venir con ejemplos: se descarta. */
function isLegacyExample(trip: Trip, activities: Activity[]): boolean {
  return trip.id === "sao-paulo-demo" || activities.some((a) => a.demoData);
}

function loadBoot(): Boot | null {
  const params = new URLSearchParams(window.location.search);
  const city = params.get("city");
  const country = params.get("country");
  const workspace = city && country ? loadCityWorkspace(city, country) : null;
  if (workspace) return { trip: workspace.trip, activities: workspace.activities, plan: null, workspace };
  const raw = localStorage.getItem("travel-pulse.trip-twin.v1");
  if (!raw) return null;
  const data: unknown = JSON.parse(raw);
  if (!data || typeof data !== "object") return null;
  const d = data as { trip?: unknown; activities?: unknown; plan?: unknown };
  const trip = tripSchema.safeParse(d.trip);
  if (!trip.success || !Array.isArray(d.activities)) return null;
  const activities = d.activities.flatMap((item) => { const r = activitySchema.safeParse(item); return r.success ? [r.data] : []; });
  if (!activities.length || isLegacyExample(trip.data, activities)) return null;
  const plan = tripPlanSchema.safeParse(d.plan);
  return { trip: trip.data, activities, plan: plan.success ? plan.data : null, workspace: null };
}

export default function TripTwinPage() {
  const [boot, setBoot] = useState<Boot | null | undefined>(undefined);
  useEffect(() => {
    let found: Boot | null = null;
    try { found = loadBoot(); } catch { found = null; /* almacenamiento ilegible: se trata como sin viaje */ }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBoot(found);
  }, []);
  if (boot === undefined) return <main className="tt-shell" aria-busy="true" />;
  if (boot === null) return <EmptyTrip />;
  return <TripWorkbench boot={boot} />;
}
