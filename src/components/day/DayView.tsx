"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { DayPrefill } from "@/lib/day/query";
import { dayToTrip } from "@/lib/day/toTrip";
import { PlaceSignals } from "@/components/pulse/PlaceSignals";
import { usePlaceSignals, type PlaceSignalsState } from "@/components/pulse/usePlaceSignals";
import { buildTripPlan } from "@/lib/trip-twin/engine";
import { PACES, PACE_LABELS, type Pace } from "@/lib/client/dna-core";
import { CITIES } from "@/lib/day/cities";
import { clock } from "@/lib/day/openingHours";
import { addStopWish, swapOutdoorForIndoor, type Stop, type Wish } from "@/lib/day/planner";
import { KIND_META, KINDS, type Kind } from "@/lib/day/places";
import { MOODS, MOOD_LABELS, type Mood } from "@/lib/day/curate";
import type { Media } from "@/lib/day/media";
import type { StreetNote } from "@/lib/day/street-notes";
import type { TransitOption } from "@/lib/day/transit";
import type { DayResponse } from "@/lib/day/service";
import { PulseMeshPanel } from "../PulseMeshPanel";
import { Button } from "../ui/Button";
import { ContextCard } from "./ContextCard";
import { EntornoCard } from "./EntornoCard";
import { GuideCard } from "./GuideCard";
import { DayMap } from "./DayMap";

const toMin = (hhmm: string) => { const [h = "0", m = "0"] = hhmm.split(":"); return Number(h) * 60 + Number(m); };
const toHHMM = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const longDate = (iso: string) => new Intl.DateTimeFormat("es-CL", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));
const osmUrl = (id: string) => `https://www.openstreetmap.org/${id}`;

const field = "min-h-11 w-full rounded-xl border border-line bg-page px-3 text-[14px]";

function StatusChip({ stop }: { stop: Stop }) {
  return stop.status === "abierto" ? (
    <span className="rounded-full bg-good/15 px-2.5 py-1 text-[11px] font-bold text-good">Abierto{stop.closesAt ? ` · cierra ${clock(stop.closesAt)}` : ""}</span>
  ) : (
    <span className="rounded-full bg-[#f0a53a]/15 px-2.5 py-1 text-[11px] font-bold text-[#f0a53a]">Horario sin confirmar</span>
  );
}

const LEG_ICON: Record<TransitOption["legs"][number]["mode"], string> = { a_pie: "🚶", metro: "🚇", bus: "🚌", tren: "🚆", tranvia: "🚊", otro: "🚍" };
const KIND_TINT: Record<Kind, string> = { museo: "from-[#3b2a6b] to-[#0f1626]", galeria: "from-[#6b2a55] to-[#0f1626]", restaurante: "from-[#6b3a1f] to-[#0f1626]", pub: "from-[#5c4a12] to-[#0f1626]", parque: "from-[#16523c] to-[#0f1626]" };
const shortDate = (iso: string) => new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));

/** Cómo llegar: transporte público si se consultó y existe; si no, el traslado calculado. */
function Journey({ stop, prevName, transit }: { stop: Stop; prevName: string; transit: TransitOption | null | undefined }) {
  return (
    <div className="mb-3 ml-5 border-l-2 border-dashed border-line pl-4">
      <p className="text-[12px] text-mid">
        {stop.travel
          ? `${stop.travel.mode === "foot" ? "A pie" : "En auto, sin tráfico"} · ${stop.travel.minutes} min desde ${prevName}`
          : `Sin dato de traslado desde ${prevName}: se reservaron 30 min`}
        {stop.rainOnTravel ? <span className="ml-2 font-semibold text-[#8fc7ff]">· lluvia probable en el trayecto</span> : null}
      </p>
      {transit ? (
        <div className="mt-2 rounded-2xl border border-signal/30 bg-signal/[0.07] p-3" data-testid="transit">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-signal">En transporte público · {transit.minutes} min{transit.transfers > 0 ? ` · ${transit.transfers} transbordo${transit.transfers === 1 ? "" : "s"}` : ""}</p>
          <ol className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px]">
            {transit.legs.map((l, i) => (
              <li key={i} className="flex items-center gap-1.5">
                {i > 0 ? <span aria-hidden="true" className="text-mid">→</span> : null}
                <span className={`whitespace-nowrap rounded-full px-2.5 py-1 font-semibold ${l.mode === "a_pie" ? "border border-line text-fg2" : "bg-signal text-ink"}`}>
                  <span aria-hidden="true">{LEG_ICON[l.mode]} </span>
                  {l.mode === "a_pie" ? `camina ${l.minutes} min` : `${l.line ?? "línea sin nombre"} · ${l.minutes} min`}
                </span>
                {l.mode !== "a_pie" && l.from && l.to ? <span className="text-fg2">{l.from} → {l.to}</span> : null}
              </li>
            ))}
          </ol>
          <p className="mt-2 text-[11px] text-mid">Horario programado, no tiempo real · <a className="underline" href="https://transitous.org/" target="_blank" rel="noopener noreferrer">Transitous</a>{stop.travel && transit.minutes > stop.travel.minutes + 5 ? ` · toma más que los ${stop.travel.minutes} min reservados en el plan: sal antes o ajusta la hora` : ""}</p>
        </div>
      ) : transit === null ? (
        <p className="mt-1 text-[11px] text-mid">Sin recorrido de transporte público para este tramo en los datos abiertos.</p>
      ) : null}
    </div>
  );
}

interface StopCardProps {
  cityKey: string; pulse: PlaceSignalsState; stop: Stop; media: Media | undefined; n: number; prevName: string; busy: boolean;
  onPick: (id: string) => void; onRemove: () => void;
  why: { why: string[]; views30: number | null } | undefined; transit: TransitOption | null | undefined; notes: StreetNote[] | undefined;
}

function StopCard({ stop, media, n, prevName, busy, onPick, onRemove, cityKey, pulse, why, transit, notes }: StopCardProps) {
  const p = stop.place;
  return (
    <li className="relative">
      <Journey stop={stop} prevName={prevName} transit={transit} />
      <article className="overflow-hidden rounded-3xl border border-line bg-surface shadow-[0_18px_40px_-24px_rgba(0,0,0,.7)]">
        <figure className={`relative ${media?.thumbnailUrl ? "h-56 sm:h-64" : "h-28"} bg-gradient-to-br ${KIND_TINT[p.kind]}`}>
          {media?.thumbnailUrl ? (
            <>
              {/* Foto de Wikimedia Commons: <img> directo porque el origen es externo y su licencia exige atribución visible. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={media.thumbnailUrl} alt={`${p.name}`} loading="lazy" className="absolute inset-0 size-full object-cover" />
              <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-[#070c18] via-[#070c18]/35 to-transparent" />
            </>
          ) : null}
          <div className="absolute inset-x-0 bottom-0 flex items-end gap-3 p-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-signal font-display text-[17px] font-extrabold text-ink shadow-lg" aria-hidden="true">{n}</span>
            <div className="min-w-0 text-white">
              <p className="font-display text-[13px] font-bold tracking-wide text-white/85">{clock(stop.startMin)} – {clock(stop.endMin)} · {KIND_META[p.kind].label}{p.cuisine ? ` · ${p.cuisine.split(";")[0]}` : ""}</p>
              <h3 className="font-display text-[22px] font-extrabold leading-tight drop-shadow sm:text-[26px]">{p.name}</h3>
            </div>
          </div>
          {media?.thumbnailUrl ? <figcaption className="absolute right-2 top-2 rounded-full bg-black/55 px-2.5 py-1 text-[10px] text-white/85 backdrop-blur">Foto: <a className="underline" href={media.pageUrl} target="_blank" rel="noopener noreferrer">Wikipedia / Wikimedia Commons</a></figcaption> : null}
        </figure>
        <div className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip stop={stop} />
            {why && why.views30 !== null ? <span className="rounded-full border border-signal/40 px-2.5 py-1 text-[11px] font-semibold text-signal" title="Lecturas del artículo en Wikipedia, últimos 30 días. Mide interés, no calidad.">👥 {why.views30.toLocaleString("es-CL")} lecturas este mes</span> : null}
            {stop.rainOnVisit ? <span className="rounded-full bg-[#8fc7ff]/15 px-2.5 py-1 text-[11px] font-bold text-[#8fc7ff]">Lluvia probable durante la visita (al aire libre)</span> : null}
          </div>
          {why?.why.length ? (
            <div className="mt-3 rounded-2xl border-l-4 border-signal bg-signal/[0.06] p-3" data-testid="why">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-signal">Por qué te lo propongo</p>
              <ul className="mt-1 text-[13px] leading-[1.5] text-fg2">{why.why.map((w) => <li key={w}>{w}</li>)}</ul>
              <p className="mt-1 text-[11px] text-mid">Interés medido en lecturas de Wikipedia: indica atención de la gente, no si es «bueno».</p>
            </div>
          ) : null}
          {media?.extract ? <p className="mt-3 text-[14px] leading-[1.55] text-fg2">{media.extract}</p> : null}
          {notes?.length ? (
            <div className="mt-3 rounded-2xl border border-[#f0a53a]/40 bg-[#f0a53a]/10 p-3 text-[13px]" data-testid="street-notes">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#f0a53a]">Aviso de la calle · sin verificar</p>
              <ul className="mt-1 text-fg2">{notes.map((nt) => <li key={nt.id}>«{nt.text}» <span className="text-mid">— alguien lo anotó en <a className="underline" href={nt.url} target="_blank" rel="noopener noreferrer">OpenStreetMap</a>{nt.date ? ` el ${shortDate(nt.date)}` : ""}, cerca de aquí.</span></li>)}</ul>
            </div>
          ) : null}
          {p.hoursRaw ? <p className="mt-3 text-[12px] text-mid">Horario en OpenStreetMap: <span className="font-mono">{p.hoursRaw}</span></p> : null}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
            <a className="font-semibold underline underline-offset-2" href={osmUrl(p.id)} target="_blank" rel="noopener noreferrer">Ver en OpenStreetMap</a>
            {p.website ? <a className="font-semibold underline underline-offset-2" href={p.website} target="_blank" rel="noopener noreferrer">Sitio web</a> : null}
          </div>
          <PlaceSignals cityKey={cityKey} placeId={p.id} placeName={p.name} state={pulse} tone="day" />
          <details className="mt-3 text-[13px] text-fg2">
            <summary className="cursor-pointer select-none font-semibold">¿Por qué este lugar?</summary>
            <ul className="mt-1 list-disc pl-5">{stop.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
          </details>
          <div className="mt-3 flex flex-wrap items-start gap-2">
            {stop.alternatives.length > 0 ? (
              <details className="text-[13px]">
                <summary className="cursor-pointer select-none rounded-xl border border-line px-3 py-2 font-semibold">Cambiar por otro cercano</summary>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {stop.alternatives.map((a) => (
                    <li key={a.place.id}>
                      <button type="button" disabled={busy} onClick={() => onPick(a.place.id)} className="w-full rounded-xl border border-line px-3 py-2 text-left hover:border-signal disabled:opacity-50">
                        <b>{a.place.name}</b>
                        <span className="block text-[12px] text-mid">{clock(a.startMin)} · {a.travelMin !== null ? `${a.travelMin} min de traslado` : "traslado sin dato"} · {a.status === "abierto" ? "abierto a esa hora" : "horario sin confirmar"}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
            <Button size="sm" variant="outline" disabled={busy} onClick={onRemove}>Quitar</Button>
          </div>
        </div>
      </article>
    </li>
  );
}

function WeatherCard({ data }: { data: DayResponse }) {
  const w = data.weather;
  if (!w) {
    return <section className="rounded-2xl border border-line bg-surface p-4 text-[13px] text-fg2"><h3 className="font-display text-base font-extrabold text-fg">Clima</h3><p className="mt-1">No hay pronóstico por hora para esa fecha todavía, así que no se evaluó la lluvia.</p></section>;
  }
  const temps = w.hours.map((h) => h.tempC).filter((t): t is number => t !== null);
  return (
    <section className="rounded-2xl border border-line bg-surface p-4" aria-label="Pronóstico por hora">
      <h3 className="font-display text-base font-extrabold">Clima por hora</h3>
      <p className="text-[12px] text-mid">{temps.length ? `${Math.round(Math.min(...temps))}° a ${Math.round(Math.max(...temps))}° · ` : ""}Open-Meteo, probabilidad de lluvia</p>
      <div className="mt-3 flex h-20 items-end gap-[3px]" role="img" aria-label={w.windows.length ? `Lluvia probable de ${w.windows.map((x) => `${x.fromHour}:00 a ${x.toHour}:00 (hasta ${x.maxProb} %)`).join(" y ")}` : "Sin lluvia probable"}>
        {w.hours.map((h) => {
          const inDay = h.hour * 60 < data.endMin && (h.hour + 1) * 60 > data.startMin;
          return <div key={h.hour} title={`${h.hour}:00 · ${h.rainProb ?? "?"} %`} className={`flex-1 rounded-t ${inDay ? "bg-[#8fc7ff]" : "bg-[#8fc7ff]/30"}`} style={{ height: `${Math.max(4, h.rainProb ?? 0)}%` }} />;
        })}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-mid"><span>0 h</span><span>6 h</span><span>12 h</span><span>18 h</span><span>24 h</span></div>
      <p className="mt-2 text-[13px] text-fg2">
        {w.windows.length ? `Lluvia probable ${w.windows.map((x) => `de ${x.fromHour}:00 a ${x.toHour}:00 (hasta ${x.maxProb} %)`).join(" y ")}.` : "No se espera lluvia probable ese día."}
      </p>
    </section>
  );
}

export function DayView({ prefill }: { prefill: DayPrefill }) {
  const [city, setCity] = useState(prefill.city);
  const [date, setDate] = useState(prefill.date);
  const [start, setStart] = useState(prefill.start);
  const [end, setEnd] = useState(prefill.end);
  const [pace, setPace] = useState<Pace | "">(prefill.pace ?? "");
  const [wishes, setWishes] = useState<Wish[]>(prefill.kinds.map((kind) => ({ kind })));
  const [mood, setMood] = useState<Mood>("clasico");
  const [variant, setVariant] = useState(0);
  const [data, setData] = useState<DayResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const router = useRouter();
  const pulse = usePlaceSignals(data?.city.key ?? null, data?.plan.stops.map((s) => s.place.id) ?? []);

  /** Pasa el día armado a Mi viaje, donde se puede mover, cancelar y deshacer. Reemplaza el viaje guardado solo si la persona lo confirma. */
  function saveToTrip() {
    if (!data || data.plan.stops.length === 0) return;
    try {
      if (localStorage.getItem("travel-pulse.trip-twin.v1") && !window.confirm("Ya tienes un viaje guardado en este dispositivo. ¿Quieres reemplazarlo con este día?")) return;
      const { trip, activities } = dayToTrip(data);
      const plan = buildTripPlan(trip, activities, { now: new Date().toISOString() });
      localStorage.setItem("travel-pulse.trip-twin.v1", JSON.stringify({ trip, activities, plan, origin: "mi-dia" }));
      localStorage.removeItem("travel-pulse.trip-twin.history.v1");
      router.push("/trip-twin");
    } catch {
      setError("No pudimos guardar el día en este navegador. Revisa que el almacenamiento esté permitido e inténtalo de nuevo.");
    }
  }

  async function run(next: Wish[], note?: string, v: number = variant) {
    setBusy(true); setError(null); setNotice(note ?? null);
    try {
      const res = await fetch("/api/day-plan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ city, date, startMin: toMin(start), endMin: toMin(end), ...(pace ? { pace } : {}), mood, variant: v, wishes: next }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? "No pudimos armar el día.");
      setWishes(next); setVariant(v); setData(json as DayResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos armar el día. Inténtalo de nuevo.");
    } finally { setBusy(false); }
  }

  const hasOutdoor = wishes.some((w) => !KIND_META[w.kind].indoor);
  /** Cambia lo que era al aire libre por lugares bajo techo; `why` aclara el motivo en el aviso. */
  function swapIndoor(why = "") {
    const r = swapOutdoorForIndoor(wishes);
    if (r.changes.length) void run(r.wishes, `Cambié lo que era al aire libre por lugares bajo techo${why}: ${r.changes.join("; ")}.`);
    else setNotice("Tu día ya es bajo techo: no hay nada al aire libre que cambiar. Cada parada tiene «Cambiar por otro cercano».");
  }

  // Viene de la portada con todo dicho: se arma sola, una vez.
  const started = useRef(false);
  useEffect(() => {
    if (prefill.go && !started.current) { started.current = true; void run(wishes); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const has = (k: Kind) => wishes.some((w) => w.kind === k);
  const toggle = (k: Kind) => setWishes(has(k) ? wishes.filter((w) => w.kind !== k) : [...wishes, { kind: k }]);
  const cityInfo = CITIES[city]!;
  const stops = data?.plan.stops ?? [];
  const last = stops[stops.length - 1];

  return (
    <div className="day-route">
      <main className="flex flex-col gap-5 px-5 pb-28 pt-6 lg:px-8 lg:pb-10">
        <header>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-signal">Mi día en la ciudad</p>
          <h1 className="font-display text-[30px] font-extrabold leading-tight lg:text-[38px]">Llegas y tienes el día. Armémoslo con lo que realmente hay.</h1>
          <p className="mt-1 max-w-2xl text-[14px] text-fg2">Lugares y horarios de OpenStreetMap, traslados reales, pronóstico por hora y lo que reportan otros viajeros. Si algo no se sabe, te lo decimos.</p>
        </header>

        <form className="grid gap-3 rounded-2xl border border-line bg-surface p-4 sm:grid-cols-2 lg:grid-cols-[1.2fr_1fr_.7fr_.7fr]" onSubmit={(e) => { e.preventDefault(); void run(wishes); }}>
          <label className="text-[13px] font-semibold">Ciudad
            <select className={`${field} mt-1`} value={city} onChange={(e) => setCity(e.target.value)}>
              {Object.values(CITIES).map((c) => <option key={c.key} value={c.key}>{c.name}, {c.country}</option>)}
            </select>
          </label>
          <label className="text-[13px] font-semibold">Fecha
            <input className={`${field} mt-1`} type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
          <label className="text-[13px] font-semibold">Llegas a las
            <input className={`${field} mt-1`} type="time" value={start} onChange={(e) => setStart(e.target.value)} required />
          </label>
          <label className="text-[13px] font-semibold">Hasta las
            <input className={`${field} mt-1`} type="time" value={end} onChange={(e) => setEnd(e.target.value)} required />
          </label>
          <label className="text-[13px] font-semibold sm:col-span-2 lg:col-span-4">Ritmo
            <select className={`${field} mt-1 sm:max-w-xs`} value={pace} onChange={(e) => setPace(e.target.value as Pace | "")}>
              <option value="">Sin preferencia</option>
              {PACES.map((p) => <option key={p} value={p}>{PACE_LABELS[p]}</option>)}
            </select>
            <span className="mt-1 block text-[12px] font-normal text-mid">{prefill.pace ? "Viene de tu Travel DNA. " : ""}Cambia cuánto tiempo se dedica a cada visita; es un supuesto, no un dato de los lugares.</span>
          </label>
          <fieldset className="sm:col-span-2 lg:col-span-4">
            <legend className="text-[13px] font-semibold">¿Qué día quieres hoy?</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {MOODS.map((m) => (
                <button key={m} type="button" aria-pressed={mood === m} onClick={() => { setMood(m); setVariant(0); }} className={`rounded-2xl border p-3 text-left transition ${mood === m ? "border-signal bg-signal/15" : "border-line hover:border-signal/50"}`}>
                  <span className={`block font-display text-[15px] font-extrabold ${mood === m ? "text-signal" : ""}`}>{m === "clasico" ? "⭐ " : "🧭 "}{MOOD_LABELS[m]}</span>
                  <span className="mt-0.5 block text-[12px] font-normal text-mid">{m === "clasico" ? "Lo que más gente busca en esta ciudad, primero." : "Lugares con datos confiables que casi nadie mira."}</span>
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="sm:col-span-2 lg:col-span-4">
            <legend className="text-[13px] font-semibold">¿Qué quieres hacer?</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {KINDS.map((k) => (
                <button key={k} type="button" aria-pressed={has(k)} onClick={() => toggle(k)} className={`min-h-11 rounded-full border px-4 text-[13px] font-semibold ${has(k) ? "border-signal bg-signal/15 text-signal" : "border-line text-fg2"}`}>{KIND_META[k].label}</button>
              ))}
            </div>
          </fieldset>
          <div className="sm:col-span-2 lg:col-span-4">
            <Button type="submit" disabled={busy || wishes.length === 0}>{busy ? "Armando tu día…" : data ? "Rehacer mi día" : "Armar mi día"}</Button>
          </div>
        </form>

        {error ? <p role="alert" className="rounded-xl border border-line bg-surface p-3 text-[13px] text-alert">{error}</p> : null}
        {notice ? <p role="status" className="rounded-xl border border-line bg-surface p-3 text-[13px] text-fg2">{notice}</p> : null}
        {busy && !data ? <div aria-busy="true" className="tp-pulse h-48 rounded-2xl bg-surface" /> : null}
        {data?.warnings.length ? (
          <ul role="status" className="rounded-xl border border-[#f0a53a]/40 bg-[#f0a53a]/10 p-3 text-[13px] text-fg2">{data.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        ) : null}

        {data ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
            <section aria-labelledby="plan-title" className="min-w-0">
              <div className="flex flex-wrap items-end justify-between gap-3 rounded-3xl border border-signal/25 bg-gradient-to-br from-signal/15 via-surface to-surface p-5">
                <div>
                  <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-signal">{data.mood ? MOOD_LABELS[data.mood] : "Tu día"} · {data.city.name}</p>
                  <h2 id="plan-title" className="font-display text-[28px] font-extrabold leading-tight first-letter:uppercase lg:text-[34px]">{longDate(data.date)}</h2>
                  <p className="text-[13px] text-mid">{data.city.name} · llegas a las {toHHMM(data.startMin)} · {stops.length} parada{stops.length === 1 ? "" : "s"}{last ? ` · terminas a las ${clock(last.endMin)}` : ""}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {data.mood ? <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(wishes.map((w) => ({ kind: w.kind, ...(w.minStart !== undefined ? { minStart: w.minStart } : {}) })), "Otra propuesta: roté los lugares equivalentes. Si ves los mismos, es que ninguno compite de cerca con ellos.", variant + 1)}>Otra propuesta</Button> : null}
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => swapIndoor()}>Está lloviendo</Button>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(addStopWish(wishes, "pub", wishes.some((w) => w.kind === "pub") && last ? last.endMin + 15 : undefined), "Agregué un pub a tu día.")}>Quiero un pub</Button>
                  <Button size="sm" disabled={busy || stops.length === 0} onClick={saveToTrip}>Guardar en Mi viaje</Button>
                </div>
              </div>
              {stops.length === 0 ? <p className="mt-4 rounded-2xl border border-dashed border-line p-5 text-[14px] text-fg2">No pudimos programar ninguna parada con lo que hay confirmado. Mira los motivos abajo.</p> : (
                <ol className="mt-5 flex flex-col gap-5">
                  {stops.map((s, i) => (
                    <StopCard key={`${s.place.id}-${i}`} stop={s} media={data.media[s.place.id]} n={i + 1} prevName={i === 0 ? data.city.anchorName : stops[i - 1]!.place.name} busy={busy}
                      onPick={(id) => void run(wishes.map((w, wi) => (wi === s.wishIndex ? { ...w, pin: id } : w)), `Cambié ${s.place.name} por otro lugar cercano.`)}
                      onRemove={() => void run(wishes.filter((_, wi) => wi !== s.wishIndex))} cityKey={data.city.key} pulse={pulse}
                      why={data.curation?.[s.place.id]} transit={data.transit ? data.transit[s.place.id] : undefined} notes={data.streetNotes?.[s.place.id]} />
                  ))}
                </ol>
              )}
              {data.plan.unplaced.length ? (
                <div className="mt-4 rounded-2xl border border-line bg-surface p-4">
                  <h3 className="font-display text-base font-extrabold">Lo que no pudimos programar</h3>
                  <ul className="mt-1 list-disc pl-5 text-[13px] text-fg2">{data.plan.unplaced.map((u) => <li key={`${u.wishIndex}-${u.reason}`}><b>{KIND_META[u.wish.kind].label}:</b> {u.reason}.</li>)}</ul>
                </div>
              ) : null}
              <details className="mt-4 rounded-2xl border border-line bg-surface p-4 text-[13px] text-fg2">
                <summary className="cursor-pointer select-none font-semibold">Supuestos y fuentes</summary>
                <ul className="mt-2 list-disc pl-5">{data.plan.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
                <ul className="mt-2 list-disc pl-5">{data.sources.map((s) => <li key={s.name}><a className="underline" href={s.url} target="_blank" rel="noopener noreferrer">{s.name}</a>: {s.status === "ok" ? "consultada" : s.status === "fuera_de_alcance" ? "fuera de alcance para esa fecha" : "no respondió"}{s.detail ? ` (${s.detail})` : ""}</li>)}</ul>
                <p className="mt-2 text-mid">{data.mood ? "El orden combina el interés real de la gente (lecturas de Wikipedia del último mes) con qué tan confiable es el dato de cada lugar. No hay reseñas: no sabemos si un lugar es «bueno». Eso lo cuentan los viajeros." : "El orden de los lugares sale de la completitud de sus datos en OpenStreetMap, no de reseñas: no sabemos si un lugar es «bueno». Eso lo cuentan los viajeros."}</p>
              </details>
            </section>

            <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-6 lg:self-start" aria-label="Mapa, clima y viajeros">
              <DayMap origin={data.city.center} originName={data.city.anchorName} stops={stops.map((s, i) => ({ n: i + 1, name: s.place.name, lat: s.place.lat, lon: s.place.lon }))} />
              <WeatherCard data={data} />
              <ContextCard key={`${data.city.key}-${data.date}`} cityKey={data.city.key} date={data.date} hasOutdoor={hasOutdoor} busy={busy} onSwapIndoor={() => swapIndoor(" por el aire dañino")} />
              <GuideCard key={data.city.key} cityKey={data.city.key} />
              <EntornoCard key={data.city.key} cityKey={data.city.key} />
              <PulseMeshPanel cityName={cityInfo.name} country={cityInfo.country} />
            </aside>
          </div>
        ) : null}
      </main>
    </div>
  );
}
