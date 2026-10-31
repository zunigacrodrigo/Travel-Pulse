"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { DEMO_SIGNALS } from "@/lib/signals/demo";
import { sameCity, signalConfidence, signalStatus } from "@/lib/signals/engine";
import type { SignalStatus, TravelSignal } from "@/lib/signals/types";
import { GlobeHero } from "../lux/GlobeHero";
import { ThemeToggle } from "../ui/ThemeToggle";

type Place = { id: string; name: string; category: string; lat: number | null; lon: number | null };
type Weather = {
  timezone: string;
  current: { temperature_2m: number; apparent_temperature: number; weather_code: number };
  daily: { time: string[]; temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_probability_max: number[] };
};
type Data = {
  ok: true; city: string; country: string; generatedAt: string; coordinates: { lat: number; lon: number };
  weather: Weather | null; places: Place[]; sources: { name: string; status: string; purpose: string }[]; limitations: string[];
};
const TABS = ["Resumen", "Mapa", "Clima", "Lugares", "Señales"] as const;
type Tab = (typeof TABS)[number];
const KEY = "travel-pulse-signals-v1";
const CACHE = "travel-pulse.city-cache.v1";
const SERIF = { fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400 } as const;
const TONE: Record<string, string> = { Transporte: "#d9473f", Clima: "#1f9d6b", Afluencia: "#7c5ce0", "Lugar nuevo": "#e08a1e", Seguridad: "#2f6fe0", Accesibilidad: "#0ea5e9", Precio: "#e08a1e", Otro: "#64748b" };

const wLabel = (c: number) => c === 0 ? "Despejado" : c <= 3 ? "Parcialmente nublado" : c === 45 || c === 48 ? "Niebla" : c >= 51 && c <= 67 ? "Lluvia" : c >= 71 && c <= 77 ? "Nieve" : c >= 80 && c <= 82 ? "Chubascos" : c >= 95 ? "Tormenta" : "Variable";
const minutesAgo = (iso: string) => Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
const ago = (iso: string) => { const m = minutesAgo(iso); return m < 1 ? "ahora" : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} d`; };

function PulseLine({ status }: { status: SignalStatus }) {
  const color = status === "reciente" ? "#46d4f2" : status === "por confirmar" ? "#f0a53a" : "#8a97aa";
  const path = status === "reciente" ? "M1 10H20l4-8 5 15 4-7H63" : status === "por confirmar" ? "M1 10H20l4-8 5 15 4-7h9" : "M1 10H63";
  return <svg width="64" height="18" viewBox="0 0 64 18" aria-hidden="true" className="shrink-0"><path d={path} fill="none" stroke={color} strokeOpacity={status === "caducada" ? 0.45 : 1} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function loadSignals(city: string): TravelSignal[] {
  let saved: TravelSignal[] = [];
  try { const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]"); if (Array.isArray(raw)) saved = raw as TravelSignal[]; } catch { saved = []; }
  return [...saved, ...DEMO_SIGNALS].filter((s) => sameCity(s.city, city)).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export function CityPulseView() {
  const router = useRouter();
  const params = useSearchParams();
  const requested = params.get("city")?.trim() ?? "";
  const [input, setInput] = useState(requested || "Santiago, Chile");
  const [data, setData] = useState<Data | null>(null);
  const [signals, setSignals] = useState<TravelSignal[]>([]);
  const [tab, setTab] = useState<Tab>("Resumen");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const abort = useRef<AbortController | null>(null);

  const load = useCallback(async (city: string) => {
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/live-data?city=${encodeURIComponent(city)}`, { signal: ctrl.signal });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "No se pudo consultar la ciudad.");
      setData(json as Data); setSignals(loadSignals((json as Data).city)); setStale(null);
      try { localStorage.setItem(CACHE, JSON.stringify(json)); } catch { /* sin almacenamiento */ }
    } catch (e) {
      if (ctrl.signal.aborted) return;
      let cached: Data | null = null;
      try { cached = JSON.parse(localStorage.getItem(CACHE) ?? "null") as Data | null; } catch { cached = null; }
      if (cached && sameCity(cached.city, city.split(",")[0] ?? city)) { setData(cached); setSignals(loadSignals(cached.city)); setStale(cached.generatedAt); }
      else { setData(null); setError(e instanceof Error ? e.message : "No se pudieron consultar las fuentes."); }
    } finally { if (!ctrl.signal.aborted) setLoading(false); }
  }, []);

  useEffect(() => {
    const up = () => setOnline(true), down = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener("online", up); window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); abort.current?.abort(); };
  }, []);
  useEffect(() => { if (requested) { setInput(requested); void load(requested); } }, [requested, load]);

  const submit = (e: React.FormEvent) => { e.preventDefault(); const c = input.trim(); if (c.length >= 2) router.push(`/ciudad?city=${encodeURIComponent(c)}`); };
  const down = data?.sources.filter((s) => s.status !== "ok") ?? [];
  const live = signals.filter((s) => signalStatus(s) !== "caducada");
  const w = data?.weather;
  const todayRain = w?.daily.precipitation_probability_max[0] ?? null;
  const changes: { id: string; title: string; meta: string; status: SignalStatus }[] = [];
  if (data && w && todayRain !== null && todayRain >= 50) changes.push({ id: "rain", title: `Probabilidad de lluvia de ${todayRain} % hoy`, meta: `Clima, Open-Meteo, ${ago(data.generatedAt)}`, status: minutesAgo(data.generatedAt) < 60 ? "reciente" : "por confirmar" });
  live.slice(0, 2).forEach((s) => changes.push({ id: s.id, title: s.title, meta: `${s.type}, ${signalStatus(s)}, ${ago(s.createdAt)}`, status: signalStatus(s) }));
  const card = "tp-lift rounded-[20px] border border-line bg-surface p-4 shadow-[0_1px_0_rgba(255,255,255,.04)_inset]";
  const q = data ? encodeURIComponent(data.city) : "";
  const bbox = data ? `${data.coordinates.lon - 0.06},${data.coordinates.lat - 0.04},${data.coordinates.lon + 0.06},${data.coordinates.lat + 0.04}` : "";

  return (
    <main className="flex-1 px-5 pb-28 pt-5">
      <div className="flex items-center justify-between"><Link href="/" className="font-display text-xl font-extrabold text-fg">Travel <span className="text-signal">Pulse</span></Link><ThemeToggle /></div>
      <form onSubmit={submit} className="mt-4 flex gap-2" role="search">
        <label htmlFor="cp-city" className="sr-only">Ciudad y país</label>
        <input id="cp-city" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ciudad, País" autoComplete="off" className="min-h-12 flex-1 rounded-full border-2 border-border bg-surface px-4 text-[15px] text-fg" />
        <button className="min-h-12 rounded-full bg-signal px-5 font-display text-sm font-extrabold text-ink disabled:opacity-60" disabled={loading}>{loading ? "…" : "Ver"}</button>
      </form>

      {!online && <p role="status" className="mt-3 rounded-xl border-2 border-alert p-3 text-sm text-alert">Sin conexión. {data ? "Ves la última información guardada." : "Necesitas internet para consultar una ciudad."}</p>}
      {stale && online && <p role="status" className="mt-3 rounded-xl border-2 border-alert p-3 text-sm text-alert">No pudimos actualizar las fuentes. Ves lo último guardado, {ago(stale)}. <button className="font-semibold underline" onClick={() => void load(requested)}>Reintentar</button></p>}
      {error && <p role="alert" className="mt-3 rounded-xl border-2 border-alert p-3 text-sm text-alert">{error}. <button className="font-semibold underline" onClick={() => void load(requested || input)}>Reintentar</button></p>}
      {!requested && !data && <p className="mt-8 text-center text-sm text-fg2">Escribe una ciudad para ver su clima, mapa, lugares y señales.</p>}
      {loading && !data && <div role="status" aria-label="Consultando fuentes abiertas" className="mt-6 space-y-3"><div className="tp-skeleton h-14 w-2/3" /><div className="tp-skeleton h-36" /><div className="tp-skeleton h-28" /></div>}

      {data && (
        <>
          <header className="relative mt-5 min-h-[150px]"><div className="pointer-events-none absolute -right-20 -top-8 opacity-90" aria-hidden="true"><GlobeHero size={230} pin /></div><h1 className="relative text-[56px] leading-none text-fg" style={SERIF}>{data.city}</h1><p className="relative mt-1 text-sm text-mid">{data.country}, {data.sources.filter((s) => s.status === "ok").length} de {data.sources.length} fuentes activas</p></header>
          {down.map((s) => <p key={s.name} role="status" className="mt-3 rounded-xl border-2 border-alert p-3 text-sm text-alert">No pudimos consultar {s.name}. El resto de los datos sigue disponible.</p>)}
          <div role="tablist" aria-label="Secciones de la ciudad" className="-mx-5 mt-4 flex gap-2 overflow-x-auto px-5 pb-1">
            {TABS.map((t) => <button key={t} role="tab" id={`tab-${t}`} aria-selected={tab === t} aria-controls="cp-panel" onClick={() => setTab(t)} className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-semibold ${tab === t ? "border-signal bg-signal text-ink" : "border-border text-fg"}`}>{t}</button>)}
          </div>

          <section id="cp-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="mt-4 space-y-4">
            {tab === "Resumen" && (<>
              <div className={card}>
                {w ? (<><div className="flex items-end justify-between"><div className="flex items-end gap-3"><span className="text-[64px] leading-[0.9] text-fg" style={SERIF}>{Math.round(w.current.temperature_2m)}°</span><div className="pb-1 text-sm text-fg">{wLabel(w.current.weather_code)}<div className="text-xs text-mid">Sensación {Math.round(w.current.apparent_temperature)}°</div></div></div><span className="rounded-full bg-[#d9f2e8] px-2 py-1 text-[11px] font-bold text-[#17634c]">Real</span></div>
                  <p className="mt-2 flex items-center gap-2 text-xs text-mid"><PulseLine status={minutesAgo(data.generatedAt) < 60 ? "reciente" : "por confirmar"} />Open-Meteo, {ago(data.generatedAt)}. Es un modelo, no una alerta oficial.</p></>)
                  : <p className="text-sm text-fg2">El clima no está disponible ahora. Intenta de nuevo en unos minutos.</p>}
              </div>
              <div className={card}>
                <h2 className="text-2xl text-fg" style={SERIF}>¿Qué cambió hoy?</h2>
                {changes.length === 0 ? <p className="mt-2 text-sm text-fg2">No detectamos cambios relevantes con las fuentes disponibles. Eso no garantiza que no haya incidencias.</p> :
                  <ul className="mt-2 divide-y divide-line">{changes.map((c) => <li key={c.id} className="flex items-center gap-3 py-3"><PulseLine status={c.status} /><div className="text-sm text-fg">{c.title}<div className="text-xs text-mid">{c.meta}</div></div></li>)}</ul>}
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <button className={card} onClick={() => setTab("Clima")}><span className="text-3xl text-fg" style={SERIF}>{w ? `${Math.round(w.current.temperature_2m)}°` : "—"}</span><div className="text-xs text-mid">Clima</div></button>
                <button className={card} onClick={() => setTab("Lugares")}><span className="text-3xl text-fg" style={SERIF}>{data.places.length}</span><div className="text-xs text-mid">Lugares</div></button>
                <button className={card} onClick={() => setTab("Señales")}><span className="text-3xl text-fg" style={SERIF}>{live.length}</span><div className="text-xs text-mid">Señales</div></button>
              </div>
              <div className="flex gap-3"><Link href={`/trip-twin?city=${q}&country=${encodeURIComponent(data.country)}`} className="flex min-h-14 flex-1 items-center justify-center rounded-[14px] bg-signal font-display font-extrabold text-ink shadow-[0_4px_0_var(--c-btn-shadow)]">Adaptar mi plan</Link><Link href={`/live?city=${q}`} className="flex min-h-14 flex-1 items-center justify-center rounded-[14px] border-2 border-border font-semibold text-fg">Reportar señal</Link></div>
            </>)}

            {tab === "Mapa" && (<>
              <div className="overflow-hidden rounded-[20px] border border-line"><iframe title={`Mapa de ${data.city}`} className="h-[340px] w-full" loading="lazy" src={`https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${data.coordinates.lat},${data.coordinates.lon}`} /></div>
              <p className="text-xs text-mid">Mapa de OpenStreetMap. El marcador indica el centro de la ciudad, no un lugar específico. <a className="underline" href={`https://www.openstreetmap.org/?mlat=${data.coordinates.lat}&mlon=${data.coordinates.lon}#map=13/${data.coordinates.lat}/${data.coordinates.lon}`} target="_blank" rel="noreferrer">Abrir mapa completo</a></p>
            </>)}

            {tab === "Clima" && (w ? <div className={card}>
              <h2 className="text-2xl text-fg" style={SERIF}>Próximos 7 días</h2>
              <ul className="mt-2 divide-y divide-line">{w.daily.time.map((d, i) => <li key={d} className="flex items-center justify-between py-3 text-sm"><span className="w-24 capitalize text-fg">{new Intl.DateTimeFormat("es-CL", { weekday: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`))}</span><span className="text-mid">Lluvia {w.daily.precipitation_probability_max[i] ?? "—"} %</span><span className="text-fg">{Math.round(w.daily.temperature_2m_max[i]!)}° / {Math.round(w.daily.temperature_2m_min[i]!)}°</span></li>)}</ul>
              <p className="mt-2 text-xs text-mid">Open-Meteo, consultado {ago(data.generatedAt)}. Previsión de modelo, no alerta oficial.</p></div> : <p className="text-sm text-fg2">El clima no está disponible ahora.</p>)}

            {tab === "Lugares" && (<div className={card}>
              <h2 className="text-2xl text-fg" style={SERIF}>Cerca del centro</h2>
              {data.places.length === 0 ? <p className="mt-2 text-sm text-fg2">OpenStreetMap no devolvió lugares ahora. Intenta de nuevo en unos minutos.</p> :
                <ul className="mt-2 divide-y divide-line">{data.places.slice(0, 20).map((p) => <li key={p.id} className="flex items-center justify-between gap-3 py-3 text-sm"><div className="text-fg">{p.name}<div className="text-xs text-mid">{p.category}, OpenStreetMap</div></div><span className="shrink-0 rounded-full bg-[#fff0ca] px-2 py-1 text-[10px] font-bold text-[#795200]">Horario sin verificar</span></li>)}</ul>}
              <ul className="mt-3 list-disc pl-5 text-xs text-mid">{data.limitations.map((l) => <li key={l}>{l}</li>)}</ul></div>)}

            {tab === "Señales" && (<>
              {signals.length === 0 && <p className="text-sm text-fg2">Aún no hay señales de viajeros en {data.city}. Sé la primera persona en <Link className="font-semibold underline" href={`/live?city=${q}`}>reportar una</Link>.</p>}
              {signals.map((s) => { const st = signalStatus(s); return (
                <article key={s.id} className={`${card} ${st === "caducada" ? "opacity-60" : ""}`}>
                  <div className="flex items-center gap-3"><span className="flex size-11 shrink-0 items-center justify-center rounded-2xl text-lg font-bold text-white" style={{ background: TONE[s.type] ?? "#2f6fe0" }} aria-hidden="true">{s.type[0]}</span><div className="min-w-0 flex-1"><h3 className="font-display text-base font-extrabold leading-tight text-fg">{s.title}</h3><p className="text-xs text-mid">{s.place}, {ago(s.createdAt)}</p></div><span className="shrink-0 rounded-md border border-signal/60 px-2 py-1 text-[10px] font-bold text-signal">{s.type}</span></div>
                  <div className="mt-3 flex items-center gap-2"><PulseLine status={st} /><span className="text-xs text-mid">{st === "reciente" ? "Reciente" : st === "por confirmar" ? "Por confirmar" : "Caducada"}, confianza {signalConfidence(s)} % (estimación){s.source === "demo" ? ", ejemplo" : ""}</span></div>
                  <p className="mt-2 text-sm text-fg2">{s.detail}</p>
                </article>); })}
              <p className="text-xs text-mid">Las señales de este dispositivo no se comparten con otros viajeros. Los ejemplos están marcados.</p>
            </>)}
          </section>
        </>
      )}
    </main>
  );
}
