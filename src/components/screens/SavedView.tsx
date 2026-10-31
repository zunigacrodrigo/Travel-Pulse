"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { shareImageUrl } from "@/lib/client/api";
import { useFeedbackProgress } from "@/lib/client/feedback";
import { formatDayMonth, formatUsd } from "@/lib/client/format";
import { encodeRequest } from "@/lib/client/query";
import { removeTrip, useSavedTrips, type SavedTrip } from "@/lib/client/saved";
import { BoardingPassRow } from "../BoardingPassRow";
import { ShareCard } from "../ShareCard";
import { Button } from "../ui/Button";
import { Check, Share } from "../ui/Icons";
import { ThemeToggle } from "../ui/ThemeToggle";

const STEPS = [
  { key: "before", slug: "antes", title: "Antes", hint: "Qué esperas" },
  { key: "during", slug: "durante", title: "Durante", hint: "3 toques" },
  { key: "after", slug: "despues", title: "Después", hint: "Cómo fue" },
] as const;

function FeedbackCycle({ trip }: { trip: SavedTrip }) {
  const progress = useFeedbackProgress(trip.destinationId);
  const nextIndex = progress ? STEPS.findIndex((s) => !progress[s.key]) : 0;
  return (
    <section aria-labelledby="cycle-title" className="rounded-2xl bg-surface p-3.5">
      <h2 id="cycle-title" className="font-display text-[17px] font-extrabold">
        Tu viaje a {trip.name}
      </h2>
      <p className="mt-0.5 text-[12px] text-mid">Tus respuestas mejoran el puntaje para otros viajeros.</p>
      <ul className="mt-2.5 flex gap-2">
        {STEPS.map((s, i) => {
          const done = !!progress?.[s.key];
          const primary = i === nextIndex && !done;
          return (
            <li key={s.key} className="flex-1">
              <Link
                href={`/feedback/${trip.destinationId}/${s.slug}`}
                className={`flex min-h-16 flex-col justify-center gap-0.5 rounded-xl px-2.5 py-2 ${
                  primary ? "panel bg-panel text-panel-fg" : "border-2 border-border"
                }`}
              >
                <span className={`flex items-center gap-1 font-display text-[15px] font-extrabold ${primary ? "text-signal" : ""}`}>
                  {s.title}
                  {done ? <Check size={13} /> : null}
                </span>
                <span className={`text-[11px] ${primary ? "text-panel-fg2" : "text-mid"}`}>
                  {done ? "Hecho" : s.hint}
                  {done ? <span className="sr-only">: {s.hint}</span> : null}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function SharePanel({ trip }: { trip: SavedTrip }) {
  const [status, setStatus] = useState("");
  const q = encodeRequest(trip.request);
  const url = () => `${window.location.origin}/destino/${trip.destinationId}?q=${q}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url());
      setStatus("Enlace copiado.");
    } catch {
      setStatus("No pudimos copiar el enlace. Cópialo desde la barra del navegador.");
    }
  };

  const share = async () => {
    const data = { title: "Travel Pulse", text: `Mi próximo viaje: ${trip.name}. Travel Pulse.`, url: url() };
    try {
      if (typeof navigator.share === "function") {
        await navigator.share(data);
        return;
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
    }
    await copy();
  };

  return (
    <section aria-labelledby="share-title">
      <h2 id="share-title" className="font-display text-[22px] font-extrabold">
        Compartir tu elección
      </h2>
      <div className="mt-3 flex items-start gap-4">
        <ShareCard trip={trip} />
        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          <Button size="lg" onClick={share} className="px-2 text-[14px]">
            <Share size={16} />
            Compartir
          </Button>
          <Button
            variant="outline"
            size="md"
            className="whitespace-nowrap px-2 text-[13px]"
            href={shareImageUrl(trip.destinationId, trip.score, q)}
            download={`travel-pulse-${trip.destinationId}.png`}
          >
            Guardar imagen
          </Button>
          <Button variant="outline" size="md" onClick={copy} className="whitespace-nowrap px-2 text-[13px]">
            Copiar enlace
          </Button>
          <p className="text-[12px] leading-[1.5] text-mid">Formato vertical 9:16, listo para Instagram y WhatsApp.</p>
          <p role="status" className="min-h-4 text-[12px] font-semibold">
            {status}
          </p>
        </div>
      </div>
    </section>
  );
}

function ListSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-2.5">
      <p role="status" className="sr-only">
        Cargando tus viajes guardados
      </p>
      {[0, 1].map((i) => (
        <div key={i} className="tp-pulse flex h-[84px] overflow-hidden rounded-2xl bg-surface">
          <div className="w-[84px] bg-skeleton" />
        </div>
      ))}
    </div>
  );
}

export function SavedView() {
  const trips = useSavedTrips();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const pickerId = useId();
  const selected = trips?.find((t) => t.destinationId === selectedId) ?? trips?.[0] ?? null;

  return (
    <main className="flex flex-1 flex-col gap-5 px-5 pb-8 pt-[calc(env(safe-area-inset-top)+16px)]">
      <header className="flex items-center justify-between gap-2">
        <h1 className="font-display text-[34px] font-extrabold tracking-[-0.5px]">Guardados</h1>
        <div className="flex items-center gap-1">
          {trips ? (
            <span className="text-[14px] text-mid">{trips.length === 1 ? "1 viaje" : `${trips.length} viajes`}</span>
          ) : null}
          <ThemeToggle />
        </div>
      </header>

      {trips === null ? (
        <ListSkeleton />
      ) : trips.length === 0 ? (
        <section className="rounded-[18px] bg-surface p-5">
          <h2 className="cond font-display text-[30px] font-extrabold leading-none tracking-[-0.4px]">
            Todavía no guardaste ningún viaje.
          </h2>
          <p className="mt-3 text-[15px] leading-[1.5] text-fg2">
            Busca un destino y toca Guardar. Aquí podrás compartirlo y contarnos cómo te fue antes, durante y después.
          </p>
          <Button href="/" className="mt-5 w-full">
            Buscar un viaje
          </Button>
        </section>
      ) : (
        <>
          <ul className="flex flex-col gap-2.5">
            {trips.map((t) => (
              <li key={t.destinationId}>
                <BoardingPassRow
                  compact
                  href={`/destino/${t.destinationId}?q=${encodeRequest(t.request)}`}
                  code={t.code}
                  name={t.name}
                  poster={t.poster}
                  score={t.score}
                  body={
                    <>
                      {t.totalUsd != null ? `${formatUsd(t.totalUsd)}, ` : ""}guardado el {formatDayMonth(t.savedAt)}
                    </>
                  }
                />
              </li>
            ))}
          </ul>

          {trips.length > 1 && selected ? (
            <div role="radiogroup" aria-label="Viaje para feedback y compartir" id={pickerId} className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[13px] text-mid">Viaje:</span>
              {trips.map((t) => {
                const on = t.destinationId === selected.destinationId;
                return (
                  <button
                    key={t.destinationId}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setSelectedId(t.destinationId)}
                    className={`min-h-11 rounded-full px-4 font-display text-[14px] font-extrabold ${
                      on ? "bg-chip-on text-chip-on-fg" : "border-[1.5px] border-border"
                    }`}
                  >
                    {t.code}
                  </button>
                );
              })}
            </div>
          ) : null}

          {selected ? (
            <>
              <FeedbackCycle trip={selected} />
              <SharePanel trip={selected} />
              <button
                type="button"
                onClick={() => removeTrip(selected.destinationId)}
                className="min-h-11 self-start text-[14px] font-semibold underline"
              >
                Quitar {selected.name} de guardados
              </button>
            </>
          ) : null}
        </>
      )}
    </main>
  );
}
