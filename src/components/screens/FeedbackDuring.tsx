"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { postFeedback } from "@/lib/client/api";
import { markFeedback } from "@/lib/client/feedback";
import type { DuringSignal } from "@/lib/types";
import { Button } from "../ui/Button";
import { FeedbackActions, useTripInfo } from "./feedback-shared";

type Group = { key: keyof DuringSignal; title: string; options: Array<{ value: string; label: string }> };

const GROUPS: Group[] = [
  {
    key: "ambiente",
    title: "Ambiente",
    options: [
      { value: "tranquilo", label: "Tranquilo" },
      { value: "animado", label: "Animado" },
      { value: "tenso", label: "Tenso" },
    ],
  },
  {
    key: "afluencia",
    title: "Afluencia",
    options: [
      { value: "vacio", label: "Vacío" },
      { value: "normal", label: "Normal" },
      { value: "lleno", label: "Lleno" },
    ],
  },
  {
    key: "precio",
    title: "Precio",
    options: [
      { value: "barato", label: "Barato" },
      { value: "normal", label: "Normal" },
      { value: "caro", label: "Caro" },
    ],
  },
];

export function FeedbackDuring({ id }: { id: string }) {
  const router = useRouter();
  const trip = useTripInfo(id);
  const [answers, setAnswers] = useState<Partial<Record<keyof DuringSignal, string>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const complete = GROUPS.every((g) => answers[g.key]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!complete) return;
    setBusy(true);
    setError(false);
    try {
      await postFeedback({ destinationId: id.toUpperCase(), moment: "during", signal: answers as unknown as DuringSignal });
      markFeedback(id, "during");
      router.push("/guardados");
    } catch {
      setError(true);
      setBusy(false);
    }
  };

  return (
    <main className="flex flex-1 flex-col">
    <form onSubmit={submit} className="flex flex-1 flex-col">
      <div className="px-5 pt-[calc(env(safe-area-inset-top)+30px)]">
        <p className="text-[14px] text-mid">Estás en {trip.name}</p>
        <h1 className="cond mt-1 font-display text-[44px] font-extrabold leading-[0.95] tracking-[-0.8px]">¿Cómo está el lugar ahora?</h1>
        <p className="mt-2.5 text-[15px] leading-[1.5] text-fg2">Tres toques. Ayudas a otros viajeros con tu experiencia del viaje.</p>
      </div>

      <div className="mt-6 flex flex-col gap-3.5 px-5">
        {GROUPS.map((g) => (
          <fieldset key={g.key} className="m-0 min-w-0 shrink-0 rounded-2xl border-0 bg-surface px-4 py-3.5">
            <legend className="float-left w-full font-display text-[18px] font-extrabold">{g.title}</legend>
            <div className="clear-both flex gap-2 pt-2.5">
              {g.options.map((o) => (
                <label key={o.value} className="flex-1 cursor-pointer">
                  <input
                    type="radio"
                    name={g.key}
                    value={o.value}
                    checked={answers[g.key] === o.value}
                    onChange={() => setAnswers((a) => ({ ...a, [g.key]: o.value }))}
                    className="peer sr-only"
                  />
                  <span className="flex min-h-12 items-center justify-center rounded-xl border-2 border-border text-[14px] font-medium peer-checked:border-transparent peer-checked:bg-chip-on peer-checked:font-semibold peer-checked:text-chip-on-fg peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--c-focus)]">
                    {o.label}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>

      <p className="mx-6 mt-4 text-[12px] leading-[1.5] text-mid">
        Es opcional y voluntario. No usamos tu ubicación en segundo plano: tú eliges cuándo contestar.
      </p>
      {error ? (
        <p role="alert" className="mx-6 mt-3 text-[13px] font-semibold text-alert">
          No pudimos enviar tu respuesta. Inténtalo de nuevo.
        </p>
      ) : null}

      <FeedbackActions>
        <Button type="submit" disabled={!complete || busy}>
          {busy ? "Enviando…" : "Enviar"}
        </Button>
        <Link href="/guardados" className="flex min-h-11 items-center justify-center text-[14px] font-semibold underline">
          Ahora no
        </Link>
      </FeedbackActions>
    </form>
    </main>
  );
}
