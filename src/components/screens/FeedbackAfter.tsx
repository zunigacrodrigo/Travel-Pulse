"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { postFeedback } from "@/lib/client/api";
import { markFeedback, useFeedbackProgress } from "@/lib/client/feedback";
import { formatGap } from "@/lib/client/format";
import { GAP_LABELS, type FeedbackResponse, type GapCriterion, type GapRatings } from "@/lib/types";
import { BackButton } from "../ui/BackButton";
import { Button } from "../ui/Button";
import { FeedbackActions, GAP_CRITERIA, RangeRow, useTripInfo } from "./feedback-shared";

const NAMES: Record<GapCriterion, string> = {
  autenticidad: "la autenticidad",
  saturacion: "la saturación",
  costo: "el costo",
  seguridad: "la seguridad",
  comida: "la comida",
};

function joinNames(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Intensidad según la distancia en puntos: hasta 1 "algo", 2 a 3 "bastante", 4 o más "muy". */
function degree(d: number): "algo" | "bastante" | "muy" {
  const a = Math.abs(d);
  return a <= 1 ? "algo" : a <= 3 ? "bastante" : "muy";
}

function gapExplanation(gap: number, per: Record<GapCriterion, number>): string {
  const up = GAP_CRITERIA.filter((k) => per[k] > 0);
  const down = GAP_CRITERIA.filter((k) => per[k] < 0);
  const mag = Math.abs(gap);

  let head: string;
  if (mag < 0.5) head = "Casi como esperabas.";
  else if (gap < 0) head = `Quedó ${mag < 1.5 ? "algo" : mag < 3 ? "bastante" : "muy"} por debajo de lo que esperabas.`;
  else head = mag < 1.5 ? "Superó un poco lo que esperabas." : mag < 3 ? "Superó bastante lo que esperabas." : "Superó con creces lo que esperabas.";

  const parts: string[] = [];
  if (up.length) {
    const maxUp = Math.max(...up.map((k) => per[k]));
    const better = degree(maxUp) === "algo" ? "mejor" : degree(maxUp) === "bastante" ? "bastante mejor" : "mucho mejor";
    parts.push(`${cap(joinNames(up.map((k) => NAMES[k])))} ${up.length > 1 ? "salieron" : "salió"} ${better}`);
  }
  if (down.length) {
    const maxDown = Math.max(...down.map((k) => -per[k]));
    parts.push(
      `${joinNames(down.map((k) => NAMES[k]))} ${down.length > 1 ? "quedaron" : "quedó"} ${degree(maxDown)} por debajo de lo previsto`,
    );
  }
  if (!parts.length) return head;
  const first = parts[0];
  const rest = parts.slice(1);
  return `${head} ${[first, ...rest].map((p, i) => (i === 0 ? cap(p) : p)).join("; ")}.`;
}

export function FeedbackAfter({ id }: { id: string }) {
  const trip = useTripInfo(id);
  const progress = useFeedbackProgress(id);
  const expected: GapRatings | undefined = progress?.before?.ratings;
  const [ratings, setRatings] = useState<GapRatings>({ autenticidad: 5, saturacion: 5, costo: 5, seguridad: 5, comida: 5 });
  const [touched, setTouched] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [response, setResponse] = useState<FeedbackResponse | null>(null);

  // Si hay expectativas guardadas, las usamos como punto de partida hasta que el usuario toque un slider.
  useEffect(() => {
    if (expected && !touched) setRatings(expected);
  }, [expected, touched]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(false);
    try {
      const res = await postFeedback({
        destinationId: id.toUpperCase(),
        moment: "after",
        ratings,
        ...(expected ? { expected } : {}),
        ...(phrase.trim() ? { phrase: phrase.trim() } : {}),
      });
      markFeedback(id, "after");
      setResponse(res);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  const done = response !== null;

  return (
    <main className="flex flex-1 flex-col">
    <form onSubmit={submit} className="flex flex-1 flex-col">
      <div className="px-5 pt-[calc(env(safe-area-inset-top)+20px)]">
        <BackButton href="/guardados" />
      </div>
      <div className="px-5 pt-5">
        <p className="text-[14px] text-mid">Tu viaje a {trip.name} ya pasó</p>
        <h1 className="cond mt-1 font-display text-[44px] font-extrabold leading-[0.95] tracking-[-0.8px]">¿Fue como esperabas?</h1>
      </div>

      <div className="mt-5 flex flex-col gap-4 px-5">
        <fieldset disabled={done} className="m-0 flex min-w-0 shrink-0 flex-col gap-1 rounded-[18px] border-0 bg-surface p-4">
          <legend className="sr-only">Cómo fue tu viaje, de 1 a 10</legend>
          {expected ? (
            <>
              <div className="mb-1.5 flex flex-wrap gap-x-[18px] gap-y-1 text-[13px]">
                <span className="flex items-center gap-2">
                  <span aria-hidden="true" className="size-3.5 rounded-full border-[2.5px] border-fg" />
                  Lo que esperaba
                </span>
                <span className="flex items-center gap-2">
                  <span aria-hidden="true" className="size-3.5 rounded-full border-[2.5px] border-[var(--c-thumb-border)] bg-signal" />
                  Lo que viví
                </span>
              </div>
              <p className="mb-1.5 text-[12px] text-mid">El número de cada fila va en el orden: viví frente a esperaba.</p>
            </>
          ) : (
            <p className="mb-1.5 text-[12px] text-mid">Del 1 al 10. No encontramos tus expectativas de antes en este dispositivo.</p>
          )}

          {GAP_CRITERIA.map((k) => {
            const lived = ratings[k];
            const exp = expected?.[k];
            const diff = exp == null ? 0 : lived - exp;
            const summary =
              exp == null ? undefined : (
                <span className={`text-[15px] ${diff < 0 ? "font-semibold text-alert" : diff > 0 ? "font-semibold text-good" : "font-medium text-mid"}`}>
                  {lived} vs {exp}
                  {diff === 0 ? ", igual" : ""}
                  <span className="sr-only">{diff < 0 ? ", por debajo de lo esperado" : diff > 0 ? ", por encima de lo esperado" : ""}</span>
                </span>
              );
            return (
              <RangeRow
                key={k}
                id={`after-${k}`}
                criterion={k}
                label={GAP_LABELS[k]}
                value={lived}
                expected={exp}
                summary={summary}
                onChange={(v) => {
                  setTouched(true);
                  setRatings((r) => ({ ...r, [k]: v }));
                }}
              />
            );
          })}
          <div className="flex justify-between text-[12px] text-mid">
            <span>1, muy mal</span>
            <span>10, excelente</span>
          </div>
        </fieldset>

        <div>
          <label htmlFor="frase" className="text-[13px] font-semibold">
            Una frase sobre el viaje (opcional)
          </label>
          <textarea
            id="frase"
            value={phrase}
            maxLength={140}
            disabled={done}
            onChange={(e) => setPhrase(e.target.value)}
            placeholder="Las ruinas sin filas, pero llovió dos tardes."
            rows={2}
            className="mt-1.5 min-h-16 w-full resize-none rounded-xl border-2 border-border bg-surface px-3.5 py-3 text-[14px] text-fg placeholder:text-mid"
          />
        </div>

        {response?.gap ? (
          <section aria-live="polite" className="panel flex items-center gap-4 rounded-[18px] bg-panel px-[18px] py-4 text-panel-fg">
            <div className="shrink-0 font-display text-[52px] font-black leading-[0.9] tracking-[-1px] text-signal" aria-label={`Brecha de ${formatGap(response.gap.gap)}`}>
              {formatGap(response.gap.gap)}
            </div>
            <div>
              <h2 className="font-display text-[18px] font-extrabold">Tu Expectation Gap</h2>
              <p className="mt-1 text-[13px] leading-[1.45] text-panel-fg2">{gapExplanation(response.gap.gap, response.gap.perCriterion)}</p>
            </div>
          </section>
        ) : done ? (
          <p aria-live="polite" className="rounded-2xl bg-surface px-4 py-3 text-[14px] leading-[1.5]">
            Gracias. Guardamos tu opinión. Como no tenemos tus expectativas de antes, no podemos calcular tu brecha.
          </p>
        ) : null}

        {response?.destinationGap ? (
          <p className="px-1 text-[13px] leading-[1.5] text-fg2">
            Promedio de otros viajeros a {trip.name}: <b>{formatGap(response.destinationGap.gap)}</b> ({response.destinationGap.n} respuestas).
          </p>
        ) : null}

        <p className="px-1 text-[12px] leading-[1.5] text-mid">
          Tu respuesta es anónima. Solo se publica el promedio cuando un destino tiene al menos 10 respuestas.
        </p>
        {error ? (
          <p role="alert" className="px-1 text-[13px] font-semibold text-alert">
            No pudimos enviar tu opinión. Inténtalo de nuevo.
          </p>
        ) : null}
      </div>

      <FeedbackActions>
        {done ? (
          <Button href="/guardados">Volver a guardados</Button>
        ) : (
          <>
            <Button type="submit" disabled={busy}>
              {busy ? "Enviando…" : "Enviar mi opinión"}
            </Button>
            <Link href="/guardados" className="flex min-h-11 items-center justify-center text-[14px] font-semibold underline">
              Ahora no
            </Link>
          </>
        )}
      </FeedbackActions>
    </form>
    </main>
  );
}
