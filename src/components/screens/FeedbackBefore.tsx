"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { postFeedback } from "@/lib/client/api";
import { markFeedback } from "@/lib/client/feedback";
import type { GapRatings } from "@/lib/types";
import { BackButton } from "../ui/BackButton";
import { Button } from "../ui/Button";
import { FeedbackActions, GAP_CRITERIA, RangeRow, SHORT_LABELS, useTripInfo } from "./feedback-shared";

export function FeedbackBefore({ id }: { id: string }) {
  const router = useRouter();
  const trip = useTripInfo(id);
  const [ratings, setRatings] = useState<GapRatings>({ autenticidad: 5, saturacion: 5, costo: 5, seguridad: 5, comida: 5 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(false);
    markFeedback(id, "before", ratings);
    try {
      await postFeedback({ destinationId: id.toUpperCase(), moment: "before", ratings });
      router.push("/guardados");
    } catch {
      setError(true);
      setBusy(false);
    }
  };

  return (
    <main className="flex flex-1 flex-col">
    <form onSubmit={submit} className="flex flex-1 flex-col">
      <div className="px-5 pt-[calc(env(safe-area-inset-top)+20px)]">
        <BackButton href="/guardados" />
      </div>
      <div className="px-5 pt-5">
        <p className="text-[14px] text-mid">
          {trip.month ? `Guardaste ${trip.name} para ${trip.month}` : `Tu viaje a ${trip.name}`}
        </p>
        <h1 className="cond mt-1 font-display text-[44px] font-extrabold leading-[0.95] tracking-[-0.8px]">¿Qué esperas de este viaje?</h1>
        <p className="mt-2.5 text-[15px] leading-[1.5] text-fg2">
          Del 1 al 10. Después del viaje compararemos tus respuestas con lo que viviste.
        </p>
      </div>

      <div className="mx-5 mt-5 flex flex-col gap-1.5 rounded-[18px] bg-surface p-4">
        {GAP_CRITERIA.map((k) => (
          <RangeRow
            key={k}
            id={`before-${k}`}
            criterion={k}
            label={SHORT_LABELS[k]}
            value={ratings[k]}
            onChange={(v) => setRatings((r) => ({ ...r, [k]: v }))}
          />
        ))}
      </div>

      <p className="mx-6 mt-4 text-[12px] leading-[1.5] text-mid">Lo pedimos una vez por viaje guardado. Tus respuestas son anónimas.</p>
      {error ? (
        <p role="alert" className="mx-6 mt-3 text-[13px] font-semibold text-alert">
          No pudimos enviar tus respuestas. Quedaron guardadas en tu dispositivo; inténtalo de nuevo.
        </p>
      ) : null}

      <FeedbackActions>
        <Button type="submit" disabled={busy}>
          {busy ? "Guardando…" : error ? "Reintentar" : "Guardar mis expectativas"}
        </Button>
        <Link href="/guardados" className="flex min-h-11 items-center justify-center text-[14px] font-semibold underline">
          Ahora no
        </Link>
      </FeedbackActions>
    </form>
    </main>
  );
}
