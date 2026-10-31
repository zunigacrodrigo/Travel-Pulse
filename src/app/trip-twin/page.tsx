"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import "./trip-twin.css";
import { buildTripPlan, replanTrip } from "@/lib/trip-twin/engine";
import { DEMO_ACTIVITIES, DEMO_TRIP } from "@/lib/trip-twin/demo";
import { activitySchema, tripPlanSchema, tripSchema, type Activity, type PlanChange, type Trip, type TripPlan } from "@/lib/trip-twin/types";
import { cityPlaceToActivity, getWeatherSuggestion, loadCityWorkspace, saveCityActivities, saveCityTrip, type CityWorkspace } from "@/lib/trip-twin/city-workspace";
import type { TravelSignal } from "@/lib/signals/types";
import { pickRelevantSignal } from "@/lib/signals/trip-link";

const attractions = [
  { id: "f1", name: "Fórmula 1 · GP de São Paulo", meta: "Autódromo de Interlagos", time: "Evento en otra fecha del destino", price: "Precio no conectado", tag: "Evento", image: "" },
  { id: "park", name: "Parque Ibirapuera", meta: "Parque Ibirapuera", time: "Lugar para explorar", price: "Precio no conectado", tag: "Naturaleza", image: "" },
  { id: "food", name: "Restaurante Mocotó", meta: "Vila Medeiros", time: "Lugar para explorar", price: "Precio no conectado", tag: "Gastronomía", image: "" },
  { id: "night", name: "Vila Madalena", meta: "Bares y música", time: "Lugar para explorar", price: "Precio no conectado", tag: "Vida nocturna", image: "" },
];

function Clock({ value, zone }: { value: string; zone: string }) {
  return <>{new Intl.DateTimeFormat("es-CL", { hour: "2-digit", minute: "2-digit", timeZone: zone }).format(new Date(value))}</>;
}

export default function TripTwinPage() {
  const [activities, setActivities] = useState<Activity[]>(DEMO_ACTIVITIES);
  const [plan, setPlan] = useState<TripPlan>(() => buildTripPlan(DEMO_TRIP, DEMO_ACTIVITIES, { now: "2026-10-27T15:00:00Z" }));
  const [notice, setNotice] = useState("Analicé tu viaje y encontré algunos puntos que conviene revisar. Los precios, rutas y horarios de esta demo son sintéticos.");
  const [history, setHistory] = useState<TripPlan[]>([]);
  const [delayId, setDelayId] = useState("museum");
  const [chat, setChat] = useState("");
  const [chatReply, setChatReply] = useState("");
  const [assistantProposal, setAssistantProposal] = useState<{ change: PlanChange; source: "anthropic" | "local"; preview: { status: TripPlan["status"]; warnings: number; conflicts: number } } | null>(null);
  const [chatBusy, setChatBusy] = useState(false);
  const [tripOverride, setTripOverride] = useState<Trip | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [ready, setReady] = useState(false);
  const [workspace, setWorkspace] = useState<CityWorkspace | null>(null);
  const [inboundSignal, setInboundSignal] = useState<TravelSignal | null>(null);
  const [signalActivityId, setSignalActivityId] = useState("");
  const [weatherDismissed, setWeatherDismissed] = useState(false);
  const [selectedId, setSelectedId] = useState<string>(DEMO_ACTIVITIES[0]!.id);
  const currentTrip = workspace?.trip ?? tripOverride ?? DEMO_TRIP;
  const weatherSuggestion = workspace && !weatherDismissed ? getWeatherSuggestion(workspace) : null;
  const activityById = useMemo(() => new Map<string, Activity>(activities.map((a): [string, Activity] => [a.id, a])), [activities]);
  const hardCount = plan.violations.filter((v) => v.severity === "hard").length;
  const warningCount = plan.violations.filter((v) => v.severity === "warning").length;
  const selected = activityById.get(selectedId) ?? activities[0];

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const requestedCity = params.get("city");
      const requestedCountry = params.get("country");
      const cityWorkspace = requestedCity && requestedCountry ? loadCityWorkspace(requestedCity, requestedCountry) : null;
      if (cityWorkspace) {
        setWorkspace(cityWorkspace);
        setActivities(cityWorkspace.activities);
        setPlan(buildTripPlan(cityWorkspace.trip, cityWorkspace.activities, { now: new Date().toISOString() }));
        setSelectedId(cityWorkspace.activities[0]?.id ?? "");
        setDelayId(cityWorkspace.activities.find((activity) => activity.importance !== "fixed")?.id ?? "");
        setNotice(`Itinerario de ${cityWorkspace.city}. Horarios, precios y traslados sin datos se indican como pendientes.`);
        setReady(true);
        return;
      }
      const saved = localStorage.getItem("travel-pulse.trip-twin.v1");
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (parsed && typeof parsed === "object" && "activities" in parsed && "plan" in parsed) {
          const data = parsed as { activities: unknown; plan: unknown; trip?: unknown };
          const restoredTrip = tripSchema.safeParse(data.trip);
          if (restoredTrip.success) setTripOverride(restoredTrip.data);
          if (Array.isArray(data.activities)) {
            const restored = data.activities.flatMap((item) => {
              const result = activitySchema.safeParse(item);
              return result.success ? [result.data] : [];
            });
            if (restored.length) { setActivities(restored); setSelectedId(restored[0]!.id); setDelayId(restored.find((a) => a.importance !== "fixed")?.id ?? ""); }
          }
          const restoredPlan = tripPlanSchema.safeParse(data.plan);
          if (restoredPlan.success) setPlan(restoredPlan.data);
        }
      }
    } catch { /* almacenamiento local inválido: se conserva la demo inicial */ }
    setReady(true);
  }, []);

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

  function addSuggestion(name: string, location: Activity["location"], category?: string, placeId?: string) {
    if (activities.some((activity) => activity.name === name)) {
      setNotice(`${name} ya forma parte de este itinerario.`);
      return;
    }
    const evidence = category ? { status: "unknown" as const, sourceId: null, observedAt: null, expiresAt: null } : { status: "estimated" as const, sourceId: "synthetic-demo-data", observedAt: new Date().toISOString(), expiresAt: null };
    const mapped = category ? { status: "estimated" as const, sourceId: "openstreetmap", observedAt: new Date().toISOString(), expiresAt: null } : evidence;
    const activity = activitySchema.parse({ id: category ? `osm-${placeId ?? name}` : `demo-${Date.now()}`, name, category, location: { ...location, ...(placeId ? { placeId } : {}) }, durationMinutes: category ? 60 : 90, importance: "normal", cost: { amount: null, currency: "USD", basis: "unknown" }, travelMinutesFromPrevious: null, travelEvidence: evidence, hoursEvidence: evidence, costEvidence: mapped, demoData: !category });
    const next = [...activities, activity];
    setActivities(next);
    const result = buildTripPlan(currentTrip, next, { version: plan.version + 1, parentPlanId: plan.id, now: new Date().toISOString() });
    setHistory((old) => [...old, plan]); setPlan(result); setSelectedId(activity.id);
    setNotice(category ? `${name} se añadió desde OpenStreetMap. Horarios, traslados y precios no están disponibles.` : `${name} se añadió al itinerario de demostración. Horarios, traslados y precios no están verificados.`);
  }

  function applyChange(change: PlanChange) {
    try {
      const result = replanTrip(currentTrip, activities, plan, change, new Date().toISOString());
      setHistory((old) => [...old, plan]); setPlan(result.plan);
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
    setHistory((old) => [...old, plan]);
    setPlan(buildTripPlan(currentTrip, next, { version: plan.version + 1, parentPlanId: plan.id, now: new Date().toISOString() }));
  }
  function adjustDuration(activityId: string, delta: -15 | 15) {
    const next = activities.map((activity) => activity.id === activityId ? { ...activity, durationMinutes: Math.max(15, Math.min(720, activity.durationMinutes + delta)) } : activity);
    setActivities(next); setHistory((old) => [...old, plan]);
    setPlan(buildTripPlan(currentTrip, next, { version: plan.version + 1, parentPlanId: plan.id, now: new Date().toISOString() }));
  }
  function reset() {
    if (workspace) {
      setActivities([]); setPlan(buildTripPlan(currentTrip, [], { version: plan.version + 1, parentPlanId: plan.id, now: new Date().toISOString() }));
      setHistory([]); setNotice(`Itinerario de ${workspace.city} reiniciado. Puedes volver a elegir lugares en Explorar ciudad.`); setWeatherDismissed(true); return;
    }
    setTripOverride(null); setActivities(DEMO_ACTIVITIES); setPlan(buildTripPlan(DEMO_TRIP, DEMO_ACTIVITIES, { now: new Date().toISOString() }));
    setHistory([]); setNotice("Demo reiniciada. Los precios, rutas y horarios siguen siendo datos sintéticos.");
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
    setHistory((old) => [...old, plan]);
    setActivities(next);
    setPlan(buildTripPlan(currentTrip, next, { version: plan.version + 1, parentPlanId: plan.id, now: new Date().toISOString() }));
    setSelectedId(replacement.id); setDelayId(replacement.id); setWeatherDismissed(true);
    setNotice(`Alternativa aplicada. ${weatherSuggestion.explanation} El trayecto hacia el nuevo lugar aún no está calculado.`);
  }

  const featuredAttractions = workspace
    ? workspace.places.filter((place) => !activities.some((activity) => activity.location.placeId === place.id)).slice(0, 4).map((place) => ({ id: place.id, name: place.name, meta: place.category, time: "Lugar mapeado · OpenStreetMap", price: "Horario y precio no disponibles", tag: "Lugar", location: { latitude: place.latitude, longitude: place.longitude, placeId: place.id }, category: place.category }))
    : tripOverride ? [] : attractions.map((attraction, index) => ({ ...attraction, category: undefined, location: index === 1 ? { latitude: -23.5874, longitude: -46.6576 } : index === 0 ? { latitude: -23.7036, longitude: -46.6997 } : index === 2 ? { latitude: -23.48, longitude: -46.59 } : { latitude: -23.557, longitude: -46.691 } }));
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
    <aside className="tt-sidebar">
      <Link href="/" className="tt-brand"><span className="tt-brand-mark">〰</span><span>Travel <b>Pulse</b></span></Link>
      <nav className="tt-nav"><Link href="/">⌂ <span>Inicio</span></Link><Link href="/importar">⇪ <span>Importar viaje</span></Link><Link href="/guardados">▣ <span>Mis viajes</span></Link><a className="active" href="#trip-twin">✦ <span>Trip Twin</span><em>Nuevo</em></a><Link href="/resultados">◎ <span>Destinos</span></Link><Link href="/sorpresa">⌕ <span>Explorar</span></Link></nav>
      <div className="tt-profile"><div className="tt-avatar">TP</div><div><b>Viajero</b><small>Tu espacio de viaje</small></div><span>⌄</span></div>
    </aside>

    <div className="tt-main" id="trip-twin">
      {inboundSignal && <section className="tt-alert-banner" role="status"><b>Observación recibida desde Pulso · {inboundSignal.type}</b><small>“{inboundSignal.title}” · {inboundSignal.place}, {inboundSignal.city} · {new Date(inboundSignal.createdAt).toLocaleString("es-CL")} · {inboundSignal.confirmations} confirmaciones guardadas en este dispositivo. Es una observación local, no una alerta verificada. Elige una actividad para preparar una alternativa; no cambiaremos el plan sin tu aprobación.</small><div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]"><select aria-label="Actividad afectada por la observación" value={relatedSignalActivityId} onChange={(event) => setSignalActivityId(event.target.value)} className="min-h-10 rounded-lg border border-slate-500 bg-slate-900 px-3 text-xs text-slate-100">{activities.filter((activity) => activity.importance !== "fixed").map((activity) => <option key={activity.id} value={activity.id}>{activity.name}</option>)}</select><button type="button" disabled={!relatedSignalActivityId || chatBusy} onClick={() => proposeSignalAdjustment("delay")} className="rounded-lg border border-slate-500 px-3 py-2 text-xs font-bold text-slate-100 disabled:opacity-50">Preparar demora +30 min</button><button type="button" disabled={!relatedSignalActivityId || chatBusy} onClick={() => proposeSignalAdjustment("cancel")} className="rounded-lg border border-slate-500 px-3 py-2 text-xs font-bold text-slate-100 disabled:opacity-50">Preparar retiro</button></div></section>}
      <section className="tt-destination tt-card">
        <div className="tt-dest-top"><div><div className="tt-eyebrow">{workspace ? "TU VIAJE · CIUDAD" : tripOverride ? "TU VIAJE IMPORTADO" : "TU VIAJE DE DEMOSTRACIÓN"}</div><h1>Tu viaje a {workspace?.city ?? tripOverride?.destination ?? "São Paulo"} {!workspace && !tripOverride && <span>🇧🇷</span>}</h1><p>{workspace ? `${workspace.country} · ${new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeZone: currentTrip.timeZone }).format(new Date(currentTrip.startAt))} · 1 viajero` : tripOverride ? `${new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeZone: tripOverride.timeZone }).format(new Date(tripOverride.startAt))} · ${tripOverride.travelers} viajero${tripOverride.travelers === 1 ? "" : "s"} · importado por ti` : "4 nov 2026 · 1 día · 2 viajeros"}</p></div><div className="tt-weather"><span>◌</span><div><b>Clima</b><small>{workspace?.weatherSource ? `${workspace.precipitationProbability ?? "—"}% prob. lluvia · Open-Meteo` : "Sin fuente conectada"}</small></div></div></div>
        <div className="tt-hero-photo"><div>PLAN DE VIAJE <h2>{workspace ? `${workspace.city}, ${workspace.country}` : tripOverride ? tripOverride.destination : "São Paulo, Brasil"}</h2><p>{workspace ? "Lugares de OpenStreetMap; horarios, precios y traslados se muestran como desconocidos." : tripOverride ? "Itinerario importado por ti. Las ubicaciones son aproximadas; los traslados, precios y horarios de lugares quedan sin confirmar." : "Explora ideas para tu itinerario. La Fórmula 1 ocurre en otra fecha."}</p></div></div>
        <div className="tt-stats"><div><span className="tt-stat-icon">▤</span><div><small>{workspace ? "Itinerario de ciudad" : tripOverride ? "Itinerario importado" : "Itinerario de demostración"}</small><b>{tripOverride ? `${new Set(plan.items.map((i) => i.plannedStart.slice(0, 10))).size} días` : "1 día"} · {plan.items.length} actividades</b></div></div><div><span className="tt-stat-icon">＄</span><div><small>{workspace ? "Coste" : tripOverride ? "Coste parcial declarado" : "Coste parcial sintético"}</small><b>{plan.estimatedTotalCost === null ? "Aún no disponible" : `${plan.currency} ${plan.estimatedTotalCost.toFixed(0)}`}</b><small>{workspace ? "Precios no conectados" : tripOverride ? "Solo lo que tú indicaste" : "No es una cotización"}</small></div></div><div><span className="tt-stat-icon">▰</span><div><small>Traslados</small><b>Sin datos de ruta</b></div></div><div><span className="tt-stat-icon">✦</span><div><small>Recomendaciones</small><b>{workspace ? "Lugares mapeados" : tripOverride ? "Aún sin conectar" : "Ejemplos locales"}</b></div></div></div>
        <div className="tt-section-heading" style={featuredAttractions.length === 0 ? { display: "none" } : undefined}><div><h2>Tu itinerario destacado</h2><p>Ideas para completar tu viaje</p></div><button onClick={() => setShowAll(!showAll)}>{showAll ? "Ver menos ↑" : "Ver todo →"}</button></div>
        <div className="tt-attraction-grid">{featuredAttractions.slice(0, showAll ? featuredAttractions.length : 2).map((a, i) => <article className="tt-attraction" key={a.id}><div className={`tt-attraction-photo photo-${i}`}>{workspace ? "⌖" : ["🏎️","🌳","🍽️","🎶"][i]}</div><div className="tt-attraction-body"><b>{a.name}</b><small>{a.time}</small><small>{a.meta}</small><strong>{a.price}</strong><span className={`tt-tag tag-${i}`}>{a.tag}</span><button onClick={() => addSuggestion(a.name, a.location, a.category, workspace ? a.id : undefined)}>Añadir al viaje</button></div></article>)}</div>
      </section>

      <section className="tt-copilot tt-card">
        <header className="tt-copilot-header"><div className="tt-pulse-logo">⌁</div><div><h2>Trip Twin <span>{workspace ? "Beta" : "Demo"}</span></h2><p>{workspace ? "Ajustes explicables para tu itinerario" : "Un copiloto demostrativo para ajustar tu itinerario"}</p></div><button className="tt-icon-button" onClick={reset} aria-label={workspace ? "Vaciar itinerario" : "Reiniciar demo"}>↻</button></header>
        <div className="tt-copilot-content"><div className="tt-steps"><div className="chosen">◉ <span>Entiende tu viaje</span></div><div>♧ <span>Analiza el contexto</span></div><div>◷ <span>Detecta cambios</span></div><div>▣ <span>Replanifica</span></div><div>◇ <span>Te muestra opciones</span></div></div><div className="tt-chat-panel"><div className="tt-chat-bubble"><div className="tt-bot-icon">✦</div><div><b>{workspace ? `Tu plan en ${workspace.city}` : "¡Hola! Soy tu Trip Twin."}</b><p>{workspace ? "Puedo preparar cambios acotados con tu itinerario y el motor determinista. Las propuestas requieren tu aprobación." : "Puedo preparar propuestas para este itinerario de ejemplo. Las rutas, horarios y costos que no tengan fuente seguirán como desconocidos."}</p><p className="tt-chat-subhead">Resumen del plan:</p><ul><li>◷ Tu itinerario tiene <b>{plan.items.length} actividades</b>.</li><li>⚑ Hay <b>{warningCount} advertencias</b> por datos incompletos.</li><li>✦ {workspace ? "El clima y los lugares consultados se muestran con su fuente." : "Los datos del itinerario de ejemplo son sintéticos."}</li></ul></div></div>{chatReply && <div className="tt-reply" role="status">{chatReply}{assistantProposal && <div className="mt-3 rounded-xl border border-slate-500/60 p-3"><p className="text-[11px] font-bold">Vista previa · {assistantProposal.preview.conflicts} conflictos · {assistantProposal.preview.warnings} advertencias · interpretación {assistantProposal.source === "anthropic" ? "IA" : "local"}</p><div className="mt-2 flex flex-wrap gap-2"><button type="button" className="tt-primary" onClick={() => { applyChange(assistantProposal.change); setAssistantProposal(null); }}>Aplicar propuesta</button><button type="button" className="rounded-lg border border-slate-500 px-3 py-2 text-[10px] font-bold text-slate-200" onClick={() => { setAssistantProposal(null); setChatReply("Propuesta descartada. Tu itinerario se mantiene sin cambios."); }}>Mantener mi plan</button></div></div>}</div>}<div className="tt-quick-actions"><button onClick={() => document.getElementById("tt-itinerary")?.scrollIntoView({ behavior: "smooth" })}>Ver itinerario completo</button><button onClick={() => document.getElementById("tt-replan")?.scrollIntoView({ behavior: "smooth" })}>Ver cambios</button><button onClick={() => document.getElementById("tt-replan")?.scrollIntoView({ behavior: "smooth" })}>Modificar plan</button></div></div></div>
        <form className="tt-chat-input" onSubmit={(e) => { e.preventDefault(); void askTwin(); }}><input value={chat} onChange={e=>setChat(e.target.value)} placeholder="Ej. Retrasa el museo 30 minutos" aria-label="Pregunta a Trip Twin" maxLength={500} disabled={chatBusy}/><button aria-label="Enviar pregunta" type="submit" disabled={chatBusy || !chat.trim()}>{chatBusy ? "…" : "➤"}</button></form>
        <div className="tt-demo-note">{workspace ? "Contexto externo disponible: clima Open-Meteo y lugares OpenStreetMap. Sin tráfico ni rutas en vivo." : "Demo funcional · Itinerario y datos sintéticos, sin consultas externas."}</div>
      </section>

      <section className="tt-itinerary tt-card" id="tt-itinerary"><header className="tt-section-heading"><div><h2>← Itinerario</h2><p>{workspace ? `${new Intl.DateTimeFormat("es-CL", { dateStyle: "full", timeZone: currentTrip.timeZone }).format(new Date(currentTrip.startAt))} · itinerario de ciudad` : tripOverride ? `Desde el ${new Intl.DateTimeFormat("es-CL", { dateStyle: "full", timeZone: tripOverride.timeZone }).format(new Date(tripOverride.startAt))} · itinerario importado` : "Miércoles 4 de noviembre · horario de demostración"}</p></div><button onClick={reset}>Reiniciar</button></header><div className="tt-itinerary-body"><div className="tt-timeline">{plan.items.length ? plan.items.map((item, index) => { const a = activityById.get(item.activityId) ?? DEMO_ACTIVITIES.find((x) => x.id === item.activityId); if (!a) return null; return <article className={`tt-timeline-item tt-timeline-select${selectedId === a.id ? " is-selected" : ""}`} key={item.activityId}><div className="tt-timeline-content"><button className="tt-timeline-pick" onClick={() => setSelectedId(a.id)} aria-pressed={selectedId === a.id}><time><Clock value={item.plannedStart} zone={currentTrip.timeZone}/></time><div className="tt-timeline-dot"/><div className="tt-timeline-detail"><b>{a.name}</b><small><Clock value={item.plannedEnd} zone={currentTrip.timeZone}/> fin · {a.durationMinutes} min</small><small>Traslado: {item.travelMinutesFromPrevious === null ? "sin datos" : `${item.travelMinutesFromPrevious} min`}</small></div></button>{workspace && <div className="tt-duration-control"><button type="button" aria-label={`Restar 15 minutos a ${a.name}`} disabled={a.durationMinutes <= 15} onClick={() => adjustDuration(a.id, -15)}>−</button><span>{a.durationMinutes} min · ajustar bloque</span><button type="button" aria-label={`Sumar 15 minutos a ${a.name}`} onClick={() => adjustDuration(a.id, 15)}>+</button></div>}</div><div className="tt-order-controls"><button aria-label={`Mover ${a.name} hacia arriba`} disabled={index === 0} onClick={() => moveActivity(a.id, -1)}>↑</button><button aria-label={`Mover ${a.name} hacia abajo`} disabled={index === plan.items.length - 1} onClick={() => moveActivity(a.id, 1)}>↓</button></div></article>; }) : <p>No quedan actividades. Reinicia la demo para empezar de nuevo.</p>}</div><div className="tt-map"><iframe title={`Mapa OpenStreetMap de ${selected?.name ?? workspace?.city ?? "São Paulo"}`} src={`https://www.openstreetmap.org/export/embed.html?bbox=${(selected?.location.longitude ?? workspace?.coordinates.longitude ?? -46.65) - 0.025}%2C${(selected?.location.latitude ?? workspace?.coordinates.latitude ?? -23.56) - 0.018}%2C${(selected?.location.longitude ?? workspace?.coordinates.longitude ?? -46.65) + 0.025}%2C${(selected?.location.latitude ?? workspace?.coordinates.latitude ?? -23.56) + 0.018}&layer=mapnik&marker=${selected?.location.latitude ?? workspace?.coordinates.latitude ?? -23.56}%2C${selected?.location.longitude ?? workspace?.coordinates.longitude ?? -46.65}`} loading="lazy"/><a className="tt-map-open" href={`https://www.openstreetmap.org/?mlat=${selected?.location.latitude ?? workspace?.coordinates.latitude ?? -23.56}&mlon=${selected?.location.longitude ?? workspace?.coordinates.longitude ?? -46.65}#map=14/${selected?.location.latitude ?? workspace?.coordinates.latitude ?? -23.56}/${selected?.location.longitude ?? workspace?.coordinates.longitude ?? -46.65}`} target="_blank" rel="noreferrer">Abrir mapa completo ↗</a><span className="tt-map-disclaimer">Mapa de OpenStreetMap · Los tiempos de traslado no están conectados</span></div></div></section>

      <section className="tt-replan tt-card" id="tt-replan"><header className="tt-section-heading"><div><h2>↖ Replanificación</h2><p>Prueba cómo cambia el plan ante un imprevisto</p></div><span className="tt-version">v{plan.version}</span></header><div className="tt-alert-banner"><b>{workspace ? "Revisa el contexto del viaje" : "Simula una incidencia en tu viaje"}</b><small>{workspace ? "Las sugerencias de clima requieren tu decisión." : "Elige una actividad para cancelarla o retrasarla."}</small></div>{weatherSuggestion && <div role="status" className="mt-3 rounded-xl border border-amber-400/40 bg-amber-300/10 p-3"><p className="text-[11px] font-extrabold uppercase tracking-wide text-amber-200">Alternativa por pronóstico · Open-Meteo</p><p className="mt-2 text-xs leading-5 text-slate-200">{weatherSuggestion.explanation}</p><p className="mt-2 text-xs"><b>{weatherSuggestion.activity.name}</b> → <b>{weatherSuggestion.alternative.name}</b> · lugar mapeado por OpenStreetMap</p><div className="mt-3 flex flex-wrap gap-2"><button className="tt-primary" onClick={applyWeatherAlternative}>Aplicar alternativa</button><button className="rounded-lg border border-slate-500 px-3 py-2 text-[10px] font-bold text-slate-200" onClick={() => { setWeatherDismissed(true); setNotice("Se mantiene el itinerario actual. Puedes revisar la sugerencia de clima después."); }}>Mantener mi plan</button></div></div>}<div className="tt-replan-controls">{activities.filter((a) => a.importance !== "fixed").map((a) => <button key={a.id} onClick={() => applyChange({ type: "activity_cancelled", activityId: a.id })}><span><b>{a.name}</b><small>Cancelar actividad</small></span><span>×</span></button>)}<label htmlFor="tt-delay">Simular demora</label><div className="tt-delay-row"><select id="tt-delay" value={delayId} onChange={(e) => setDelayId(e.target.value)}>{activities.filter((a) => a.importance !== "fixed").map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select><button className="tt-primary" disabled={!activities.some((a) => a.id === delayId)} onClick={() => applyChange({ type: "delay", activityId: delayId, delayMinutes: 30 })}>+30 min</button></div><div className="tt-result-note">{notice}</div></div>{!workspace && <div className="tt-alternatives"><h3>Opciones de demostración</h3>{["Museo del Fútbol", "Tour gastronómico por Liberdade", "Compras en Rua Oscar Freire"].map((name, i) => <div className="tt-option" key={name}><span className="tt-option-emoji">{["🏛️","🍜","🛍️"][i]}</span><div><b>{name}</b><small>Idea de ejemplo · verifica horarios y precios por tu cuenta</small></div><button onClick={() => addSuggestion(name, i === 0 ? { latitude: -23.5275, longitude: -46.6782 } : i === 1 ? { latitude: -23.5558, longitude: -46.6359 } : { latitude: -23.568, longitude: -46.668 })}>Añadir al plan</button></div>)}</div>}<div className="tt-confidence"><div><small>Conflictos</small><b>{hardCount}</b></div><div><small>Advertencias</small><b>{warningCount}</b></div><div><small>Cambios en esta sesión</small><b>{history.length}</b></div></div></section>
      <footer className="tt-footer">TRAVEL PULSE · TRIP TWIN <span>Prototipo visual interactivo · Datos sintéticos</span></footer>
    </div>
  </main>;
}
