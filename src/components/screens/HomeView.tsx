"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { GlobeHero } from "../lux/GlobeHero";
import { useId, useState } from "react";
import { capitalize, formatUsd, MONTHS, originName } from "@/lib/client/format";
import { useDna } from "@/lib/client/dna";
import { dnaToRequest } from "@/lib/client/dna-core";
import { encodeRequest, storeLastRequest } from "@/lib/client/query";
import { CITIES } from "@/lib/day/cities";
import { dayHref } from "@/lib/day/query";
import { KINDS, KIND_META, type Kind } from "@/lib/day/places";
import { INTEREST_LABELS, INTERESTS, type Interest, type TripRequest } from "@/lib/types";
import { Globe } from "../Globe";
import { Button } from "../ui/Button";
import { Chip } from "../ui/Chip";
import { ChevronDown } from "../ui/Icons";
import { Slider } from "../ui/Slider";
import { Stepper } from "../ui/Stepper";
import { ThemeToggle } from "../ui/ThemeToggle";
import { Toggle } from "../ui/Toggle";

const BUDGET_MIN = 300;
const BUDGET_MAX = 5000;
const CITY_SUGGESTIONS = ["Santiago, Chile", "Valparaíso, Chile", "Antofagasta, Chile", "Buenos Aires, Argentina", "São Paulo, Brasil", "Tokyo, Japan", "Paris, France"];

export function HomeView({ initial, defaultDate }: { initial: TripRequest; defaultDate: string }) {
  const router = useRouter();
  const [req, setReq] = useState<TripRequest>(initial);
  const [city, setCity] = useState("Santiago, Chile");
  const [formOpen, setFormOpen] = useState(false);
  const [tripCity, setTripCity] = useState("sao-paulo-br");
  const [tripDate, setTripDate] = useState(defaultDate);
  const [arrive, setArrive] = useState("11:00");
  const [until, setUntil] = useState("23:00");
  const [kinds, setKinds] = useState<Kind[]>(["museo", "restaurante", "pub"]);
  const toggleKind = (k: Kind) => setKinds((c) => (c.includes(k) ? c.filter((x) => x !== k) : [...c, k]));
  const planDay = (e: React.FormEvent) => { e.preventDefault(); if (kinds.length) router.push(dayHref({ city: tripCity, date: tripDate, start: arrive, end: until, kinds })); };
  const dna = useDna();
  const ids = useId();
  const budgetLabelId = `${ids}-budget`;
  const monthId = `${ids}-month`;
  const patch = (p: Partial<TripRequest>) => setReq((r) => ({ ...r, ...p }));
  const toggleInterest = (i: Interest) => setReq((r) => ({ ...r, interests: r.interests.includes(i) ? r.interests.filter((x) => x !== i) : [...r.interests, i] }));
  const budget = Math.min(BUDGET_MAX, Math.max(BUDGET_MIN, req.budgetUsd));
  const applyDna = () => { if (dna) { setReq((r) => dnaToRequest(dna, r.month)); setFormOpen(true); } };
  const submit = (e: React.FormEvent) => { e.preventDefault(); storeLastRequest(req); router.push(`/resultados?q=${encodeRequest(req)}`); };
  const openCity = (e: React.FormEvent) => { e.preventDefault(); const query = city.trim(); if (query) router.push(`/ciudad?city=${encodeURIComponent(query)}`); };

  return (
    <main className="city-first-home min-h-dvh overflow-x-clip bg-page px-5 pb-28 pt-[calc(env(safe-area-inset-top)+12px)] text-fg sm:px-8 lg:px-12">
      <header className="mx-auto flex max-w-6xl items-center justify-between"><Link href="/" className="font-display text-xl font-extrabold tracking-tight">Travel <span className="text-signal">Pulse</span></Link><div className="flex items-center gap-3"><span className="hidden items-center gap-2 text-xs text-mid sm:flex"><i className="size-2 rounded-full bg-signal"/>Exploración en beta</span><ThemeToggle/></div></header>
      <section className="relative mx-auto grid max-w-6xl items-center gap-8 py-10 sm:py-16 lg:grid-cols-[1.05fr_.95fr] lg:gap-16">
        <div className="pointer-events-none absolute -right-28 -top-2 z-0 opacity-60 sm:-right-10 sm:top-2 sm:opacity-80 lg:right-[38%] lg:top-4" aria-hidden="true"><GlobeHero size={300} pin /></div>
        <div className="relative z-10">
          <p className="text-xs font-extrabold uppercase tracking-[.2em] text-signal">La inteligencia detrás de cada viaje</p>
          <h1 className="cond mt-4 max-w-3xl font-display text-4xl font-extrabold leading-[.98] tracking-tight sm:text-6xl">Cuéntanos tu viaje. Te armamos el día con lo que realmente hay.</h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-fg2 sm:text-lg">Horarios, traslados y lluvia reales. Lo que no se sabe, te lo decimos en vez de inventarlo.</p>
          <form onSubmit={planDay} className="mt-7 rounded-[24px] border border-line bg-surface p-4 shadow-sm sm:p-5" aria-label="Armar mi día">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-bold">¿A dónde vas?<select value={tripCity} onChange={(e) => setTripCity(e.target.value)} className="mt-1 min-h-12 w-full rounded-xl border border-line bg-page px-3 text-base font-normal">{Object.values(CITIES).map((c) => <option key={c.key} value={c.key}>{c.name}, {c.country}</option>)}</select></label>
              <label className="text-sm font-bold">¿Qué día?<input type="date" value={tripDate} onChange={(e) => setTripDate(e.target.value)} required className="mt-1 min-h-12 w-full rounded-xl border border-line bg-page px-3 text-base font-normal"/></label>
              <label className="text-sm font-bold">Llegas a las<input type="time" value={arrive} onChange={(e) => setArrive(e.target.value)} required className="mt-1 min-h-12 w-full rounded-xl border border-line bg-page px-3 text-base font-normal"/></label>
              <label className="text-sm font-bold">Hasta las<input type="time" value={until} onChange={(e) => setUntil(e.target.value)} required className="mt-1 min-h-12 w-full rounded-xl border border-line bg-page px-3 text-base font-normal"/></label>
            </div>
            <fieldset className="mt-4 border-0 p-0"><legend className="text-sm font-bold">¿Qué quieres vivir?</legend><div className="mt-2 flex flex-wrap gap-2">{KINDS.map((k) => <button key={k} type="button" aria-pressed={kinds.includes(k)} onClick={() => toggleKind(k)} className={`min-h-11 rounded-full border px-4 text-sm font-semibold ${kinds.includes(k) ? "border-signal bg-signal/15 text-signal" : "border-line text-fg2"}`}>{KIND_META[k].label}</button>)}</div></fieldset>
            <Button type="submit" disabled={kinds.length === 0} className="mt-5 min-h-12 w-full px-6 sm:w-auto">Armar mi día →</Button>
            <p className="mt-3 text-xs leading-5 text-mid">Hoy cubre São Paulo, Santiago, Valparaíso y Antofagasta. Los precios aún no tienen fuente, así que no los mostramos.</p>
          </form>
          <form onSubmit={openCity} className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center"><label htmlFor={`${ids}-city`} className="text-sm font-semibold text-fg2">¿Solo quieres entender una ciudad?</label><input id={`${ids}-city`} list={`${ids}-cities`} value={city} onChange={(e) => setCity(e.target.value)} placeholder="Ciudad, país" className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-page px-4 text-sm"/><datalist id={`${ids}-cities`}>{CITY_SUGGESTIONS.map((name) => <option key={name} value={name}/>)}</datalist><Button type="submit" className="min-h-11 px-5">Ver pulso →</Button></form>
        </div>
        <div className="relative z-10 overflow-hidden rounded-[28px] bg-[#0b1626] p-5 text-white shadow-[0_24px_60px_-30px_rgba(70,212,242,.45)] sm:p-7">
          <div className="absolute -right-16 -top-16 size-64 rounded-full border border-white/10"/><div className="absolute -right-4 -top-4 size-40 rounded-full border border-white/10"/>
          <p className="relative text-xs font-extrabold uppercase tracking-[.2em] text-[#46d4f2]">Una plataforma, varias capas</p>
          <div className="relative mt-6 space-y-3">
            {[{n:"01",t:"Contexto de ciudad",d:"Clima de Open-Meteo y lugares de OpenStreetMap para cualquier ciudad. El Radar suma avisos oficiales, sismos y desastres de 30 destinos."},{n:"02",t:"Pulso de viajeros",d:"Observaciones en este dispositivo; todavía no hay comunidad sincronizada."},{n:"03",t:"Oportunidad de destino",d:"Recomienda destinos con clima, aviso oficial y tendencia de interés reales. Aún no usa precios: no hay una fuente de precios conectada."},{n:"04",t:"Mi día · traslados y horarios",d:"Arma el día con horarios de OpenStreetMap y traslados reales; si llueve, propone alternativas bajo techo. Aún sin tarifas."}].map((item) => <div key={item.n} className="flex gap-4 rounded-2xl border border-white/10 bg-white/[.06] p-4"><span className="font-display text-sm font-extrabold text-[#46d4f2]">{item.n}</span><div><h2 className="font-display text-base font-extrabold">{item.t}</h2><p className="mt-1 text-sm leading-5 text-white/65">{item.d}</p></div></div>)}
          </div>
          <p className="relative mt-5 text-[11px] leading-5 text-white/55">La cobertura de fuentes varía. El mapa y el clima tienen fuentes externas; las señales humanas todavía no se sincronizan entre viajeros.</p>
        </div>
      </section>
      <section className="mx-auto grid max-w-6xl gap-3 sm:grid-cols-3">
        <Link href="/ciudad?city=Santiago%2C%20Chile" className="rounded-2xl border border-line bg-surface p-5 hover:border-signal"><p className="text-xs font-bold uppercase tracking-widest text-mid">Explorar ciudad</p><h2 className="mt-2 font-display text-xl font-extrabold">World Monitor + Pulso</h2><p className="mt-2 text-sm leading-6 text-fg2">Consulta clima, lugares mapeados y reportes con sus límites a la vista.</p></Link>
        <Link href="/trip-twin" className="rounded-2xl border border-line bg-surface p-5 hover:border-signal"><p className="text-xs font-bold uppercase tracking-widest text-mid">Plan vivo</p><h2 className="mt-2 font-display text-xl font-extrabold">Continúa en Mi viaje</h2><p className="mt-2 text-sm leading-6 text-fg2">Guarda lugares y prueba cambios del itinerario con explicación y aprobación.</p></Link>
        <Link href="/sorpresa" className="rounded-2xl border border-line bg-surface p-5 hover:border-signal"><p className="text-xs font-bold uppercase tracking-widest text-mid">Descubrimiento</p><h2 className="mt-2 font-display text-xl font-extrabold">Encuentra un destino</h2><p className="mt-2 text-sm leading-6 text-fg2">Si aún no tienes ciudad, explora alternativas para tu próximo viaje.</p></Link>
        <Link href="/radar" className="rounded-2xl border border-line bg-surface p-5 hover:border-signal"><p className="text-xs font-bold uppercase tracking-widest text-mid">Radar en vivo</p><h2 className="mt-2 font-display text-xl font-extrabold">Riesgo y sismos hoy</h2><p className="mt-2 text-sm leading-6 text-fg2">Avisos oficiales de viaje y sismos recientes por destino, con la fuente y la hora de cada dato.</p></Link>
      </section>
      {dna ? <div className="mx-auto mt-8 flex max-w-6xl flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-4"><p className="text-sm text-fg2">Tienes un <b className="text-fg">Travel DNA</b> guardado: {formatUsd(dna.budgetUsd)}, {dna.days} días{dna.interests.length ? `, ${dna.interests.map((i) => INTEREST_LABELS[i].toLowerCase()).join(", ")}` : ""}.</p><div className="flex gap-2"><Button type="button" onClick={applyDna} className="min-h-11 px-4">Usar mi Travel DNA</Button><Link href="/perfil" className="inline-flex min-h-11 items-center px-3 text-sm font-semibold underline underline-offset-2">Editar</Link></div></div> : null}
      <details open={formOpen} onToggle={(e) => setFormOpen(e.currentTarget.open)} className="mx-auto mt-8 max-w-6xl rounded-2xl border border-line bg-surface p-5">
        <summary className="cursor-pointer list-none font-display text-lg font-extrabold">¿Todavía no tienes destino? Buscar por presupuesto y preferencias <span className="float-right text-signal">＋</span></summary>
        <form onSubmit={submit} className="mt-5 space-y-4">
          <div className="flex flex-wrap items-end gap-6"><div><p className="text-xs text-mid">Salgo desde</p><p className="font-display text-xl font-extrabold">{req.origin} <span className="font-sans text-sm font-medium">{originName(req.origin)}</span></p></div><label className="text-xs text-mid" htmlFor={monthId}>Mes<div className="relative mt-1"><select id={monthId} value={req.month} onChange={(e) => patch({ month: Number(e.target.value) })} className="min-h-11 appearance-none bg-transparent pr-6 font-display text-lg font-bold text-fg">{MONTHS.map((m,i) => <option key={m} value={i+1}>{capitalize(m)}</option>)}</select><ChevronDown size={16} className="pointer-events-none absolute bottom-3.5 right-0 text-mid"/></div></label></div>
          <div><div className="flex justify-between text-xs text-mid"><label id={budgetLabelId} htmlFor={`${ids}-budget`}>Presupuesto total en USD</label><output htmlFor={`${ids}-budget`} className="font-display text-lg font-extrabold text-fg">{formatUsd(budget)}</output></div><Slider id={`${ids}-budget`} value={budget} min={BUDGET_MIN} max={BUDGET_MAX} step={50} onChange={(v) => patch({ budgetUsd: v })} ariaLabelledBy={budgetLabelId} ariaValueText={formatUsd(budget)}/></div>
          <div className="flex flex-wrap items-end gap-6"><Stepper label="Días" unit="días" value={req.days} min={3} max={21} onChange={(v) => patch({ days: v })}/><Stepper label="Viajeros" unit="viajeros" value={req.travelers} min={1} max={6} onChange={(v) => patch({ travelers: v })}/><Toggle label="Fechas flexibles" checked={req.flexibleDates} onChange={(v) => patch({ flexibleDates: v })}/></div>
          <fieldset className="border-0 p-0"><legend className="mb-2 text-xs font-semibold">Intereses</legend><div className="flex flex-wrap gap-2">{INTERESTS.map((i) => <Chip key={i} selected={req.interests.includes(i)} onClick={() => toggleInterest(i)}>{INTEREST_LABELS[i]}</Chip>)}</div></fieldset>
          <Button type="submit">Explorar destinos recomendados</Button>
        </form>
      </details>
      <div className="mx-auto mt-8 max-w-6xl"><details className="rounded-2xl border border-line bg-surface p-4"><summary className="cursor-pointer font-semibold">Ver visualización global de destinos</summary><div className="mt-3 max-w-xl"><Globe origin={req.origin} month={req.month}/></div></details></div>
    </main>
  );
}
