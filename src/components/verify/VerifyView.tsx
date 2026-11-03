"use client";
import { useState } from "react";
import { CITIES } from "@/lib/day/cities";
import type { VerifyResponse } from "@/lib/verify/service";
import { clock } from "@/lib/day/openingHours";

const TONE = { mantener: "border-emerald-500/50", confirmar: "border-amber-500/60", mover: "border-orange-500/70", cambiar: "border-red-500/70" } as const;
const LABEL = { mantener: "Mantener", confirmar: "Confirmar", mover: "Mover", cambiar: "Cambiar" } as const;

export function VerifyView({ defaultDate }: { defaultDate: string }) {
  const [city, setCity] = useState("sao-paulo-br");
  const [date, setDate] = useState(defaultDate);
  const [start, setStart] = useState("12:30");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [res, setRes] = useState<VerifyResponse | null>(null);

  async function run() {
    setBusy(true); setErr(null); setRes(null);
    try {
      const r = await fetch("/api/verify-plan", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ city, date, dayStart: +start.slice(0, 2) * 60 + +start.slice(3, 5), text }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error?.message ?? j?.message ?? "No se pudo verificar.");
      setRes(j);
    } catch (e) { setErr(e instanceof Error ? e.message : "Error"); } finally { setBusy(false); }
  }

  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 pb-28 pt-8">
      <header>
        <h1 className="text-2xl font-semibold">Verificar mi itinerario</h1>
        <p className="text-sm text-muted-foreground">Pega el itinerario de ChatGPT u otro. Lo contrasto con horarios, traslados y clima reales y te digo qué hacer.</p>
      </header>
      <section className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm">Ciudad
          <select className="mt-1 w-full rounded border bg-transparent p-2" value={city} onChange={(e) => setCity(e.target.value)}>
            {Object.values(CITIES).map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
          </select></label>
        <label className="text-sm">Fecha
          <input type="date" className="mt-1 w-full rounded border bg-transparent p-2" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="text-sm">Empiezo a las
          <input type="time" className="mt-1 w-full rounded border bg-transparent p-2" value={start} onChange={(e) => setStart(e.target.value)} /></label>
      </section>
      <textarea aria-label="Itinerario" rows={9} className="w-full rounded border bg-transparent p-3 text-sm" placeholder={"12:30 Mercado Municipal de São Paulo (90 min)\n15:00 Terraço Itália\n19:30 Kidoairaku"} value={text} onChange={(e) => setText(e.target.value)} />
      <button disabled={busy || text.trim().length < 3} onClick={run} className="rounded bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50">
        {busy ? "Verificando con datos reales…" : "Verificar"}
      </button>
      {err && <p role="alert" className="text-sm text-red-500">{err}</p>}
      {res && (
        <section className="space-y-4" aria-live="polite">
          <div className="rounded border p-4">
            <p className="text-xs uppercase text-muted-foreground">Lo primero que haría</p>
            <p className="mt-1 text-lg font-medium">{res.verdict.firstStep}</p>
            <p className="mt-1 text-sm text-muted-foreground">{res.verdict.summary}</p>
          </div>
          <ol className="space-y-3">
            {res.verdict.stops.map((s, i) => (
              <li key={i} className={`rounded border-l-4 border p-4 ${TONE[s.action]}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="font-medium">{clock(s.start)}–{clock(s.end)} · {s.name}</h2>
                  <span className="text-xs font-semibold uppercase">{LABEL[s.action]}</span>
                </div>
                <p className="mt-1 text-sm">{s.headline}</p>
                {s.matchedName && s.matchedName !== s.name && <p className="text-xs text-muted-foreground">Mapa: {s.matchedName}</p>}
                <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
                  {s.facts.map((f, k) => <li key={k}>{f}</li>)}
                  {s.unknown.map((f, k) => <li key={`u${k}`} className="text-amber-600">Sin confirmar: {f}</li>)}
                </ul>
              </li>
            ))}
          </ol>
          {res.warnings.length > 0 && <ul className="text-xs text-amber-600">{res.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}
          <p className="text-xs text-muted-foreground">Fuentes: {res.sources.map((s) => `${s.name}: ${s.status}`).join(" · ")}. Los reportes de viajeros aún no existen para estos lugares.</p>
        </section>
      )}
    </main>
  );
}
