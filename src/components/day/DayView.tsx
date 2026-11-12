"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { DayPrefill } from "@/lib/day/query";
import { CITIES } from "@/lib/day/cities";
import { clock } from "@/lib/day/openingHours";
import { addStopWish, swapOutdoorForIndoor, type Stop, type Wish } from "@/lib/day/planner";
import { KIND_META, KINDS, type Kind } from "@/lib/day/places";
import type { Media } from "@/lib/day/media";
import type { DayResponse } from "@/lib/day/service";
import { PulseMeshPanel } from "../PulseMeshPanel";
import { Button } from "../ui/Button";
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

function StopCard({ stop, media, n, prevName, busy, onPick, onRemove }: { stop: Stop; media: Media | undefined; n: number; prevName: string; busy: boolean; onPick: (id: string) => void; onRemove: () => void }) {
  const p = stop.place;
  return (
    <li className="relative">
      <div className="mb-2 ml-5 border-l-2 border-dashed border-line pl-4 text-[12px] text-mid">
        {stop.travel
          ? `${stop.travel.mode === "foot" ? "A pie" : "En auto, sin tráfico"} · ${stop.travel.minutes} min desde ${prevName}`
          : `Sin dato de traslado desde ${prevName}: se reservaron 30 min`}
        {stop.rainOnTravel ? <span className="ml-2 font-semibold text-[#8fc7ff]">· lluvia probable en el trayecto</span> : null}
      </div>
      <article className="rounded-2xl border border-line bg-surface p-4">
        {media?.thumbnailUrl ? (
          <figure className="mb-3 overflow-hidden rounded-xl">
            {/* Foto de Wikimedia Commons: <img> directo porque el origen es externo y su licencia exige atribución visible. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={media.thumbnailUrl} alt={`${p.name}`} loading="lazy" className="h-44 w-full object-cover" />
            <figcaption className="bg-page px-3 py-1 text-[11px] text-mid">Foto: <a className="underline" href={media.pageUrl} target="_blank" rel="noopener noreferrer">Wikipedia / Wikimedia Commons</a> (licencia libre; autoría en el enlace)</figcaption>
          </figure>
        ) : null}
        <div className="flex items-start gap-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-signal font-display text-[15px] font-extrabold text-ink" aria-hidden="true">{n}</span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-[22px] font-extrabold leading-none">{clock(stop.startMin)}<span className="text-mid"> – {clock(stop.endMin)}</span></p>
            <h3 className="mt-1 font-display text-[17px] font-extrabold leading-tight">{p.name}</h3>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-line px-2.5 py-1 text-[11px] font-semibold text-fg2">{KIND_META[p.kind].label}{p.cuisine ? ` · ${p.cuisine.split(";")[0]}` : ""}</span>
              <StatusChip stop={stop} />
              {stop.rainOnVisit ? <span className="rounded-full bg-[#8fc7ff]/15 px-2.5 py-1 text-[11px] font-bold text-[#8fc7ff]">Lluvia probable durante la visita (al aire libre)</span> : null}
            </div>
            {media?.extract ? <p className="mt-2 text-[13px] leading-[1.5] text-fg2">{media.extract}</p> : null}
            {p.hoursRaw ? <p className="mt-2 text-[12px] text-mid">Horario en OpenStreetMap: <span className="font-mono">{p.hoursRaw}</span></p> : null}
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
              <a className="font-semibold underline underline-offset-2" href={osmUrl(p.id)} target="_blank" rel="noopener noreferrer">Ver en OpenStreetMap</a>
              {p.website ? <a className="font-semibold underline underline-offset-2" href={p.website} target="_blank" rel="noopener noreferrer">Sitio web</a> : null}
            </div>
          </div>
        </div>
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
  const [wishes, setWishes] = useState<Wish[]>(prefill.kinds.map((kind) => ({ kind })));
  const [data, setData] = useState<DayResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function run(next: Wish[], note?: string) {
    setBusy(true); setError(null); setNotice(note ?? null);
    try {
      const res = await fetch("/api/day-plan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ city, date, startMin: toMin(start), endMin: toMin(end), wishes: next }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? "No pudimos armar el día.");
      setWishes(next); setData(json as DayResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos armar el día. Inténtalo de nuevo.");
    } finally { setBusy(false); }
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
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h2 id="plan-title" className="font-display text-[22px] font-extrabold first-letter:uppercase">{longDate(data.date)}</h2>
                  <p className="text-[13px] text-mid">{data.city.name} · llegas a las {toHHMM(data.startMin)} · {stops.length} parada{stops.length === 1 ? "" : "s"}{last ? ` · terminas a las ${clock(last.endMin)}` : ""}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => { const r = swapOutdoorForIndoor(wishes); if (r.changes.length) void run(r.wishes, `Cambié lo que era al aire libre por lugares bajo techo: ${r.changes.join("; ")}.`); else setNotice("Tu día ya es bajo techo: no hay nada al aire libre que cambiar. Cada parada tiene «Cambiar por otro cercano»."); }}>Está lloviendo</Button>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(addStopWish(wishes, "pub", wishes.some((w) => w.kind === "pub") && last ? last.endMin + 15 : undefined), "Agregué un pub a tu día.")}>Quiero un pub</Button>
                </div>
              </div>
              {stops.length === 0 ? <p className="mt-4 rounded-2xl border border-dashed border-line p-5 text-[14px] text-fg2">No pudimos programar ninguna parada con lo que hay confirmado. Mira los motivos abajo.</p> : (
                <ol className="mt-4 flex flex-col gap-1">
                  {stops.map((s, i) => (
                    <StopCard key={`${s.place.id}-${i}`} stop={s} media={data.media[s.place.id]} n={i + 1} prevName={i === 0 ? data.city.anchorName : stops[i - 1]!.place.name} busy={busy}
                      onPick={(id) => void run(wishes.map((w, wi) => (wi === s.wishIndex ? { ...w, pin: id } : w)), `Cambié ${s.place.name} por otro lugar cercano.`)}
                      onRemove={() => void run(wishes.filter((_, wi) => wi !== s.wishIndex))} />
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
                <p className="mt-2 text-mid">El orden de los lugares sale de la completitud de sus datos en OpenStreetMap, no de reseñas: no sabemos si un lugar es «bueno». Eso lo cuentan los viajeros.</p>
              </details>
            </section>

            <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-6 lg:self-start" aria-label="Mapa, clima y viajeros">
              <DayMap origin={data.city.center} originName={data.city.anchorName} stops={stops.map((s, i) => ({ n: i + 1, name: s.place.name, lat: s.place.lat, lon: s.place.lon }))} />
              <WeatherCard data={data} />
              <PulseMeshPanel cityName={cityInfo.name} country={cityInfo.country} />
            </aside>
          </div>
        ) : null}
      </main>
    </div>
  );
}
