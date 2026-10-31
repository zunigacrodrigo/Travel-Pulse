"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { buildTripPlan } from "@/lib/trip-twin/engine";
import { buildImportedTrip, parseItinerary, type ImportedDay, type ImportedItem, type ParsedItinerary, type Provenance } from "@/lib/trip-twin/import";

const KEY = "travel-pulse.trip-twin.v1";
const EXAMPLE = `Día 1 - 4 nov
09:00 Museo de Arte (2 h)
12:30 Almuerzo en el mercado US$15
Paseo por el parque

Día 2
10:00-12:00 Tour histórico
Cena en un barrio típico
Alojamiento: Hotel Centro`;

const LABEL: Record<Provenance, string> = { provided: "Dado por ti", inferred: "Inferido, confirma", unknown: "Desconocido" };
const TONE: Record<Provenance, string> = { provided: "text-good", inferred: "text-alert", unknown: "text-mid" };

function Badge({ kind, children }: { kind: Provenance; children: string }) {
  return <span className={`text-[11px] font-semibold ${TONE[kind]}`}>{children}: {LABEL[kind]}</span>;
}

export default function ImportarPage() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [city, setCity] = useState("");
  const [startDate, setStartDate] = useState("");
  const [travelers, setTravelers] = useState(1);
  const [currency, setCurrency] = useState("USD");
  const [budget, setBudget] = useState("");
  const [parsed, setParsed] = useState<ParsedItinerary | null>(null);
  const [geo, setGeo] = useState<{ latitude: number; longitude: number; timeZone: string; city: string; country: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => { try { setSaved(Boolean(localStorage.getItem(KEY))); } catch { setSaved(false); } }, []);

  async function interpret(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const result = parseItinerary(text);
    if (result.days.length === 0) { setParsed(null); setError(result.warnings[0] ?? "No encontré actividades."); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/live-data?city=${encodeURIComponent(city.trim())}`);
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "No pude ubicar el destino.");
      setGeo({ latitude: json.coordinates.lat, longitude: json.coordinates.lon, timeZone: json.weather?.timezone ?? "UTC", city: json.city, country: json.country });
      setParsed(result);
    } catch (err) {
      setParsed(null);
      setError(`${err instanceof Error ? err.message : "No pude ubicar el destino."} Revisa el nombre de la ciudad y tu conexión, y vuelve a intentarlo.`);
    } finally { setBusy(false); }
  }

  function patchItem(dayIdx: number, itemId: string, patch: (i: ImportedItem) => ImportedItem) {
    setParsed((p) => p && { ...p, days: p.days.map((d, di): ImportedDay => di !== dayIdx ? d : { ...d, items: d.items.map((i) => (i.id === itemId ? patch(i) : i)) }) });
  }
  function removeItem(dayIdx: number, itemId: string) {
    setParsed((p) => p && { ...p, days: p.days.map((d, di): ImportedDay => di !== dayIdx ? d : { ...d, items: d.items.filter((i) => i.id !== itemId) }).filter((d) => d.items.length > 0) });
  }

  function save() {
    if (!parsed || !geo) return;
    try {
      const now = new Date().toISOString();
      const { trip, activities } = buildImportedTrip({
        destination: `${geo.city}, ${geo.country}`, coordinates: { latitude: geo.latitude, longitude: geo.longitude }, timeZone: geo.timeZone,
        startDate, travelers, currency, budget: Number(budget) || null, parsed, now,
      });
      const plan = buildTripPlan(trip, activities, { now });
      localStorage.setItem(KEY, JSON.stringify({ trip, activities, plan }));
      router.push("/trip-twin");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el itinerario.");
    }
  }

  function remove() {
    try { localStorage.removeItem(KEY); } catch { /* sin almacenamiento */ }
    setSaved(false); setParsed(null);
  }

  const field = "w-full rounded-xl border-2 border-border bg-surface px-3 py-3 text-[15px] text-fg";
  return (
    <main className="flex-1 px-5 pb-16 pt-6">
      <div className="flex items-center justify-between"><Link href="/" className="font-display text-xl font-extrabold text-fg">Travel <span className="text-signal">Pulse</span></Link><Link href="/trip-twin" className="text-sm font-semibold text-fg2 underline">Mi viaje</Link></div>
      <h1 className="mt-6 font-display text-3xl font-extrabold leading-tight text-fg">Importar mi viaje</h1>
      <p className="mt-2 text-sm text-fg2">Pega un itinerario de ChatGPT, Claude, Gemini o tus notas. Lo interpreto en tu navegador, sin enviarlo a ningún modelo de IA, y tú lo revisas antes de guardarlo.</p>

      {saved && <div className="mt-4 rounded-xl border-2 border-border bg-surface p-3 text-sm text-fg2">Ya tienes un itinerario guardado en este dispositivo. <Link href="/trip-twin" className="font-semibold underline">Abrirlo</Link> o <button className="font-semibold underline" onClick={remove}>eliminarlo</button>.</div>}

      <form onSubmit={interpret} className="mt-5 space-y-4">
        <label className="block text-sm font-semibold text-fg" htmlFor="imp-text">Itinerario</label>
        <textarea id="imp-text" className={`${field} min-h-48 font-mono text-[13px]`} required value={text} onChange={(e) => setText(e.target.value)} placeholder={EXAMPLE} />
        <button type="button" className="text-xs font-semibold text-fg2 underline" onClick={() => setText(EXAMPLE)}>Usar un ejemplo</button>
        <div><label className="block text-sm font-semibold text-fg" htmlFor="imp-city">Destino (ciudad y país)</label><input id="imp-city" className={field} required minLength={2} value={city} onChange={(e) => setCity(e.target.value)} placeholder="Santiago, Chile" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-sm font-semibold text-fg" htmlFor="imp-date">Fecha del día 1</label><input id="imp-date" type="date" className={field} required value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
          <div><label className="block text-sm font-semibold text-fg" htmlFor="imp-trav">Viajeros</label><input id="imp-trav" type="number" min={1} max={20} className={field} value={travelers} onChange={(e) => setTravelers(Math.min(20, Math.max(1, Number(e.target.value) || 1)))} /></div>
          <div><label className="block text-sm font-semibold text-fg" htmlFor="imp-cur">Moneda</label><select id="imp-cur" className={field} value={currency} onChange={(e) => setCurrency(e.target.value)}>{["USD", "CLP", "EUR", "BRL"].map((c) => <option key={c}>{c}</option>)}</select></div>
          <div><label className="block text-sm font-semibold text-fg" htmlFor="imp-bud">Presupuesto (opcional)</label><input id="imp-bud" inputMode="decimal" className={field} value={budget} onChange={(e) => setBudget(e.target.value.replace(/[^\d.]/g, ""))} placeholder="Sin declarar" /></div>
        </div>
        {error && <p role="alert" className="rounded-xl border-2 border-alert p-3 text-sm text-alert">{error}</p>}
        <button disabled={busy} className="min-h-14 w-full rounded-[14px] bg-signal font-display text-[17px] font-extrabold text-ink shadow-[0_4px_0_var(--c-btn-shadow)] disabled:opacity-60">{busy ? "Ubicando el destino…" : "Interpretar itinerario"}</button>
      </form>

      {parsed && geo && (
        <section className="mt-8" aria-labelledby="imp-review">
          <h2 id="imp-review" className="font-display text-2xl font-extrabold text-fg">Revisa antes de guardar</h2>
          <p className="mt-1 text-sm text-fg2">Destino ubicado: {geo.city}, {geo.country}. Las ubicaciones de las actividades son aproximadas (el centro de la ciudad): los traslados quedan sin calcular.</p>
          {parsed.warnings.map((w) => <p key={w} className="mt-2 text-sm text-alert">{w}</p>)}
          {parsed.days.map((day, di) => (
            <div key={day.index} className="mt-5">
              <h3 className="font-display text-lg font-extrabold text-fg">{day.label}</h3>
              <ul className="mt-2 space-y-3">
                {day.items.map((it) => (
                  <li key={it.id} className="rounded-xl border-2 border-border bg-surface p-3">
                    <label className="sr-only" htmlFor={`n-${it.id}`}>Nombre de la actividad</label>
                    <input id={`n-${it.id}`} className={field} value={it.name} onChange={(e) => patchItem(di, it.id, (i) => ({ ...i, name: e.target.value }))} />
                    <div className="mt-2 grid grid-cols-2 gap-3">
                      <div><label className="text-xs text-mid" htmlFor={`t-${it.id}`}>Hora de inicio</label><input id={`t-${it.id}`} type="time" className={field} value={it.startTime ?? ""} onChange={(e) => patchItem(di, it.id, (i) => ({ ...i, startTime: e.target.value || null, provenance: { ...i.provenance, time: e.target.value ? "provided" : "unknown" } }))} /></div>
                      <div><label className="text-xs text-mid" htmlFor={`d-${it.id}`}>Duración (min)</label><input id={`d-${it.id}`} type="number" min={5} max={1440} className={field} value={it.durationMinutes ?? ""} placeholder="90 (por defecto)" onChange={(e) => patchItem(di, it.id, (i) => ({ ...i, durationMinutes: e.target.value ? Number(e.target.value) : null, provenance: { ...i.provenance, duration: e.target.value ? "provided" : "unknown" } }))} /></div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-col"><Badge kind={it.provenance.time}>Hora</Badge><Badge kind={it.provenance.duration}>Duración</Badge><Badge kind={it.provenance.cost}>{it.cost ? `Costo ${it.cost.amount} ${it.cost.currency ?? "(moneda sin confirmar)"}` : "Costo"}</Badge></div>
                      <button type="button" className="min-h-11 rounded-lg border-2 border-border px-3 text-sm font-semibold text-fg" onClick={() => removeItem(di, it.id)} aria-label={`Quitar ${it.name}`}>Quitar</button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {parsed.notes.length > 0 && <div className="mt-5 rounded-xl border-2 border-border p-3"><h3 className="text-sm font-bold text-fg">Pendiente de verificar</h3><ul className="mt-1 list-disc pl-5 text-sm text-fg2">{parsed.notes.map((n) => <li key={n}>{n}</li>)}</ul><p className="mt-1 text-xs text-mid">No los convertí en actividades ni los confirmé.</p></div>}
          <button onClick={save} disabled={parsed.days.length === 0} className="mt-6 min-h-14 w-full rounded-[14px] bg-signal font-display text-[17px] font-extrabold text-ink shadow-[0_4px_0_var(--c-btn-shadow)]">Guardar y abrir en Trip Twin</button>
          <p className="mt-2 text-xs text-mid">Se guarda solo en este dispositivo. Puedes eliminarlo cuando quieras desde esta pantalla.</p>
        </section>
      )}
    </main>
  );
}
