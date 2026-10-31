"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { postSurprise } from "@/lib/client/api";
import { describeRequest, formatUsd, monthName, capitalize, plural } from "@/lib/client/format";
import { decodeRequest, encodeRequest, loadLastRequest, parseRequest } from "@/lib/client/query";
import { saveTrip } from "@/lib/client/saved";
import type { SurpriseResponse, TripRequest } from "@/lib/types";
import { FlapScore } from "../FlapScore";
import { ErrorPanel } from "../StatePanels";
import { BackButton } from "../ui/BackButton";
import { BottomTabBar } from "../ui/BottomTabBar";
import { Button } from "../ui/Button";
import { Compass, Share, Sparkle, Warning } from "../ui/Icons";
import { DestinationPoster } from "../DestinationPoster";

type Phase = "idle" | "loading" | "result" | "empty" | "error";

function Backdrop() {
  return (
    <svg
      viewBox="0 0 400 400"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 bottom-0 h-[430px] w-full"
    >
      <circle cx="292" cy="196" r="62" fill="#fff" />
      <path d="M0 400 V250 Q70 190 140 240 T280 226 T400 220 V400Z" fill="#2E8B6F" />
      <path d="M0 400 V300 Q90 252 180 292 T400 280 V400Z" fill="#E5412D" />
      <path d="M0 400 V350 Q120 318 240 346 T400 338 V400Z" fill="#0B1626" />
    </svg>
  );
}

function Bunting() {
  const flags: Array<[string, number, number]> = [
    ["#E5412D", 16, 20],
    ["#0B1626", 62, 29],
    ["#2C6FA3", 108, 33],
    ["#E5412D", 154, 32],
    ["#0B1626", 200, 24],
    ["#2C6FA3", 246, 21],
    ["#E5412D", 292, 22],
    ["#0B1626", 338, 28],
    ["#2C6FA3", 380, 32],
  ];
  return (
    <svg viewBox="0 0 400 56" preserveAspectRatio="none" aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[56px] w-full">
      <path d="M-4 16 Q100 46 200 22 T404 30" stroke="#0B1626" strokeWidth="1.5" fill="none" />
      {flags.map(([c, x, y]) => (
        <path key={x} d={`M${x} ${y} l16 0 l-8 22z`} fill={c} />
      ))}
    </svg>
  );
}

function Start({ request, onGo, loading, q }: { request: TripRequest; onGo: () => void; loading: boolean; q?: string }) {
  return (
    <>
      <main className="surprise-route relative isolate flex flex-1 flex-col overflow-hidden px-5 pb-8 pt-[calc(env(safe-area-inset-top)+22px)]">
        <div className="surprise-topbar">
          <Link href="/" className="surprise-wordmark"><span className="surprise-brand-icon"><Compass size={18} /></span>Travel <b>Pulse</b></Link>
          <span className="surprise-top-caption">IDEAS PARA SALIR DE LA RUTINA</span>
        </div>
        <div className="surprise-stage">
          <section className="surprise-copy">
            <p className="surprise-eyebrow"><Sparkle size={14} /> TU PRÓXIMO VIAJE, FUERA DEL MAPA</p>
            <h1 className="surprise-heading">¿Y si esta vez<br className="hidden sm:block" /> eliges distinto?</h1>
            <p className="surprise-description">Cuéntanos cuánto tiempo y presupuesto tienes. Nosotros buscamos un destino que quizá todavía no estaba en tus planes.</p>

            <div className="surprise-trip-summary" aria-label={`Preferencias actuales: ${describeRequest(request)}`}>
              <span className="surprise-summary-icon"><Compass size={18} /></span>
              <div><small>TU PUNTO DE PARTIDA</small><strong>{describeRequest(request)}</strong></div>
              <span className="surprise-summary-mark" aria-hidden="true">↗</span>
            </div>

            <div className="surprise-actions">
              <Button variant="primary" onClick={onGo} disabled={loading} className="surprise-submit w-full justify-between">
                <span>{loading ? "Buscando tu destino…" : "Descubrir mi destino"}</span><span className="surprise-submit-icon"><Sparkle size={18} /></span>
              </Button>
              <Link href={`/?q=${q ?? encodeRequest(request)}`} className="surprise-edit-link">Ajustar fechas, presupuesto o intereses <span aria-hidden="true">→</span></Link>
            </div>
            <p className="surprise-footnote">La recomendación se basa en tu perfil y en los datos disponibles del viaje.</p>
          </section>

          <aside className="surprise-art" aria-label="Ilustración de un destino por descubrir">
            <div className="surprise-art-top"><span>TRAVEL PULSE / 01</span><span>DESTINO POR DESCUBRIR</span></div>
            <div className="surprise-poster-wrap">
              <div className="surprise-orbit surprise-orbit-one" />
              <div className="surprise-orbit surprise-orbit-two" />
              <div className="surprise-poster"><DestinationPoster poster={{ sky: "#c5d9d7", sun: "#e96b4b", far: "#426773", near: "#0b2635", accent: "#46d4f2", motif: "mountains" }} variant="header" /></div>
              <div className="surprise-poster-stamp"><Sparkle size={15} /><span>ENCUENTRA<br />TU PRÓXIMO<br />LUGAR FAVORITO</span></div>
              <div className="surprise-route-mark" aria-hidden="true"><svg viewBox="0 0 150 88" fill="none"><path d="M5 73C34 73 35 17 70 25c28 7 15 45 40 35 12-5 17-18 35-43" stroke="#46d4f2" strokeWidth="2" strokeDasharray="4 7" strokeLinecap="round"/><circle cx="5" cy="73" r="4" fill="#46d4f2"/><path d="m135 18 10-1-3 10" stroke="#46d4f2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
            </div>
            <div className="surprise-art-bottom"><span>UN VIAJE EMPIEZA CON UNA BUENA PREGUNTA.</span><span>01 — 04</span></div>
          </aside>
        </div>
      </main>
      <BottomTabBar active="sorpresa" />
    </>
  );
}

export function SurpriseView({ q }: { q?: string }) {
  const [request, setRequest] = useState<TripRequest>(() => parseRequest(q));
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<SurpriseResponse | null>(null);
  const [seen, setSeen] = useState<string[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [status, setStatus] = useState("");
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!decodeRequest(q)) {
      const last = loadLastRequest();
      if (last) setRequest(last);
    }
  }, [q]);

  useEffect(() => () => abort.current?.abort(), []);

  const run = async (exclude: string[]) => {
    abort.current?.abort();
    const ac = new AbortController();
    abort.current = ac;
    setPhase("loading");
    setStatus("");
    try {
      const res = await postSurprise({ request, exclude }, ac.signal);
      if (ac.signal.aborted) return;
      if (!res.card) {
        setPhase("empty");
        return;
      }
      setResult(res);
      setSeen([...exclude, res.card.destination.id]);
      setPhase("result");
    } catch (e) {
      if (ac.signal.aborted) return;
      setError(e);
      setPhase("error");
    }
  };

  if (phase === "idle" || (phase === "loading" && !result)) {
    return <Start request={request} onGo={() => run([])} loading={phase === "loading"} q={q} />;
  }

  if (phase === "error") {
    return (
      <>
        <main className="flex flex-1 flex-col">
          <div className="px-5 pt-[calc(env(safe-area-inset-top)+20px)] pb-4">
            <BackButton href="/sorpresa" />
          </div>
          <ErrorPanel error={error} onRetry={() => run(seen)} />
        </main>
        <BottomTabBar active="sorpresa" />
      </>
    );
  }

  if (phase === "empty") {
    return (
      <>
        <main className="flex flex-1 flex-col px-5 pb-8 pt-[calc(env(safe-area-inset-top)+30px)]">
          <h1 className="cond font-display text-[38px] font-extrabold leading-[0.98]">No encontramos más sorpresas con estos datos.</h1>
          <p className="mt-3 text-[15px] leading-[1.5] text-fg2">
            No encontramos una opción que supere los mínimos de puntaje y confianza con los datos disponibles para {formatUsd(request.budgetUsd)} y {plural(request.days, "día", "días")}. Esto no significa que no existan destinos; consulta el ranking completo o ajusta tus condiciones.
          </p>
          <div className="mt-6 flex flex-col gap-2.5">
            <Button href={`/resultados?q=${encodeRequest(request)}`} variant="panel">Ver opciones y datos faltantes</Button>
            <Button href={`/?q=${encodeRequest(request)}`} variant="outlineBold" size="md">
              Cambiar mis datos
            </Button>
          </div>
        </main>
        <BottomTabBar active="sorpresa" />
      </>
    );
  }

  const card = result!.card!;
  const { destination: d, result: r } = card;
  const warning = result!.warning;
  const wm = warning ? /^([\s\S]*?[.!?])\s+([\s\S]*)$/.exec(warning) : null;
  const head = wm ? wm[1] : (warning ?? "");
  const tail = wm ? wm[2] : "";
  const encoded = encodeRequest(request);
  const loading = phase === "loading";

  const shareAndSave = async () => {
    saveTrip({
      destinationId: d.id,
      name: d.name,
      code: d.id,
      score: r.score,
      totalUsd: r.cost.totalUsd,
      savedAt: new Date().toISOString(),
      request,
      country: d.country,
      poster: d.poster,
    });
    const url = `${window.location.origin}/destino/${d.id}?q=${encoded}`;
    const text = `Mi próximo viaje: ${d.name}, ${d.country}. Travel Pulse.`;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: "Travel Pulse", text, url });
        setStatus("Viaje guardado en Guardados.");
        return;
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        setStatus("Viaje guardado en Guardados.");
        return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setStatus("Viaje guardado y enlace copiado.");
    } catch {
      setStatus("Viaje guardado en Guardados.");
    }
  };

  return (
    <div className="on-signal relative flex flex-1 flex-col overflow-hidden bg-signal text-ink" aria-busy={loading}>
      <Bunting />
      <Backdrop />
      <main className="relative z-10 flex flex-1 flex-col px-5 pb-7 pt-[calc(env(safe-area-inset-top)+56px)]">
        <div className="flex items-center justify-between">
          <BackButton href="/sorpresa" tone="ink" />
          <p className="rounded-full bg-ink px-3.5 py-2 text-[13px] font-semibold text-signal">
            {capitalize(monthName(request.month)).slice(0, 3)}, {plural(request.days, "día", "días")}, {formatUsd(request.budgetUsd)}
          </p>
        </div>

        <div className="mt-8" aria-live="polite">
          <p className="text-[16px] font-semibold">Un destino que no habías considerado</p>
          <h1 className="cond -ml-1.5 font-display font-black leading-[0.82] tracking-[-4px]" style={{ fontSize: "clamp(96px, 45vw, 176px)" }}>
            {d.id}
          </h1>
          <p className="mt-2.5 font-display text-[30px] font-extrabold">
            {d.name}, {d.country}
          </p>
          <div className="mt-3 flex items-center gap-3">
            <FlapScore value={r.score} size="md" />
            <p className="text-[15px] font-medium leading-[1.35]">
              {formatUsd(r.cost.totalUsd)} en total.
              <br />
              {r.reason}
              <span className="mt-1 block text-[11px]">Estimación de referencia; no es una cotización de vuelo actual.</span>
            </p>
          </div>
        </div>

        {warning ? (
          <p className="panel mt-6 flex gap-2.5 rounded-[14px] bg-ink px-3.5 py-3 text-[13px] leading-[1.5] text-panel-fg">
            <Warning size={16} className="mt-0.5 shrink-0 text-signal" />
            <span>
              <b className="text-signal">{head}</b> {tail}
            </span>
          </p>
        ) : null}

        <div className="mt-auto flex flex-col gap-2.5 pt-24">
          <div className="flex min-h-9 justify-center">
            <p
              role="status"
              className={status ? "rounded-full bg-ink px-4 py-2 text-center text-[13px] font-semibold text-signal shadow-[0_2px_8px_rgba(11,22,38,.35)]" : "sr-only"}
            >
              {status}
            </p>
          </div>
          <Button variant="ink" onClick={shareAndSave} className="gap-2.5">
            <Share size={18} />
            Compartir y guardar
          </Button>
          <div className="flex gap-2.5">
            <Button variant="white" size="md" className="flex-1 text-[15px]" onClick={() => run(seen)} disabled={loading}>
              {loading ? "Buscando…" : "Otro destino"}
            </Button>
            <Button variant="white" size="md" href={`/destino/${d.id}?q=${encoded}`} className="flex-1 text-[15px]">
              Ver detalle
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
