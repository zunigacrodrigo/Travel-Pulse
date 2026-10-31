"use client";

import Link from "next/link";
import { useId, useRef, useState } from "react";
import { clearDna, saveDna, useDna } from "@/lib/client/dna";
import {
  defaultDna,
  exportDna,
  PACE_LABELS,
  PACES,
  suggestInterests,
  validateDna,
  type Pace,
  type TravelDna,
} from "@/lib/client/dna-core";
import { formatUsd, ORIGIN_NAMES } from "@/lib/client/format";
import { useSavedTrips } from "@/lib/client/saved";
import { INTEREST_LABELS, INTERESTS, type Interest } from "@/lib/types";
import { Button } from "../ui/Button";
import { Chip } from "../ui/Chip";
import { Download } from "../ui/Icons";
import { Stepper } from "../ui/Stepper";
import { ThemeToggle } from "../ui/ThemeToggle";
import { Toggle } from "../ui/Toggle";

type Notice = { kind: "ok" | "error"; text: string } | null;

function Skeleton() {
  return (
    <main aria-busy="true" className="flex flex-1 flex-col gap-3 px-5 pt-[calc(env(safe-area-inset-top)+20px)]">
      <p role="status" className="sr-only">
        Cargando tu perfil
      </p>
      <div className="tp-pulse h-10 w-48 rounded-xl bg-surface" />
      <div className="tp-pulse h-72 rounded-2xl bg-surface" />
    </main>
  );
}

function Editor({ initial, exists }: { initial: TravelDna; exists: boolean }) {
  const ids = useId();
  const saved = useSavedTrips();
  const [draft, setDraft] = useState<TravelDna>(initial);
  const [hasProfile, setHasProfile] = useState(exists);
  const [notice, setNotice] = useState<Notice>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const patch = (p: Partial<TravelDna>) => {
    setDraft((d) => ({ ...d, ...p }));
    setNotice(null);
  };
  const toggleInterest = (i: Interest) =>
    patch({ interests: draft.interests.includes(i) ? draft.interests.filter((x) => x !== i) : [...draft.interests, i] });

  const suggestions = suggestInterests(saved ?? [], draft);

  const onSave = () => {
    const next = saveDna(draft);
    setDraft(next);
    setHasProfile(true);
    setNotice({ kind: "ok", text: "Perfil guardado en este dispositivo." });
  };

  const onDelete = () => {
    clearDna();
    setDraft(defaultDna(new Date()));
    setHasProfile(false);
    setConfirmingDelete(false);
    setNotice({ kind: "ok", text: "Tu perfil se borró de este dispositivo." });
  };

  const onExport = () => {
    const url = URL.createObjectURL(new Blob([exportDna(draft)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "travel-dna.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const onImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      const parsed = validateDna(JSON.parse(await file.text()));
      if (!parsed) throw new Error("formato");
      setDraft(parsed);
      setNotice({ kind: "ok", text: "Perfil cargado. Revísalo y pulsa «Guardar perfil» para conservarlo." });
    } catch {
      setNotice({ kind: "error", text: "Ese archivo no es un perfil de Travel DNA válido." });
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <main className="flex flex-1 flex-col gap-5 px-5 pb-8 pt-[calc(env(safe-area-inset-top)+20px)]">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[.2em] text-signal">Memoria del viajero</p>
          <h1 className="mt-1 font-display text-[30px] font-extrabold leading-[1.05]">Mi Travel DNA</h1>
          <p className="mt-2 max-w-xl text-[14px] leading-[1.5] text-fg2">
            Lo que me dices sobre cómo viajas. Lo uso para precargar tus búsquedas; no deduzco nada más sobre ti.
          </p>
        </div>
        <ThemeToggle />
      </header>

      <section className="flex flex-col gap-5 rounded-2xl bg-surface p-4" aria-labelledby={`${ids}-prefs`}>
        <h2 id={`${ids}-prefs`} className="font-display text-[20px] font-extrabold">
          Tus preferencias
        </h2>

        <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
          <label className="text-[12px] text-mid" htmlFor={`${ids}-origin`}>
            Salgo desde
            <select
              id={`${ids}-origin`}
              value={draft.origin}
              onChange={(e) => patch({ origin: e.target.value })}
              className="mt-1 block min-h-11 rounded-xl border border-line bg-page px-3 font-display text-[16px] font-bold text-fg"
            >
              {Object.entries(ORIGIN_NAMES).map(([code, name]) => (
                <option key={code} value={code}>
                  {code} · {name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[12px] text-mid" htmlFor={`${ids}-budget`}>
            Presupuesto habitual (USD)
            <input
              id={`${ids}-budget`}
              type="number"
              inputMode="numeric"
              min={100}
              max={100000}
              step={50}
              value={draft.budgetUsd}
              onChange={(e) => {
                const n = Math.round(Number(e.target.value));
                if (Number.isFinite(n)) patch({ budgetUsd: Math.min(100000, Math.max(100, n)) });
              }}
              className="mt-1 block min-h-11 w-36 rounded-xl border border-line bg-page px-3 font-display text-[16px] font-bold text-fg"
            />
          </label>
          <Stepper label="Días por viaje" unit="días" value={draft.days} min={1} max={30} onChange={(v) => patch({ days: v })} />
          <Stepper label="Viajeros" unit="viajeros" value={draft.travelers} min={1} max={12} onChange={(v) => patch({ travelers: v })} />
          <Toggle label="Fechas flexibles" checked={draft.flexibleDates} onChange={(v) => patch({ flexibleDates: v })} />
        </div>

        <fieldset className="border-0 p-0">
          <legend className="mb-2 text-[12px] font-semibold">Qué disfruto</legend>
          <div className="flex flex-wrap gap-2">
            {INTERESTS.map((i) => (
              <Chip key={i} selected={draft.interests.includes(i)} onClick={() => toggleInterest(i)}>
                {INTEREST_LABELS[i]}
              </Chip>
            ))}
          </div>
        </fieldset>

        <div role="radiogroup" aria-label="Ritmo de viaje">
          <p className="mb-2 text-[12px] font-semibold">Ritmo de viaje</p>
          <div className="flex flex-wrap gap-2">
            <Chip radio selected={draft.pace === null} onClick={() => patch({ pace: null })}>
              Sin preferencia
            </Chip>
            {PACES.map((p: Pace) => (
              <Chip key={p} radio selected={draft.pace === p} onClick={() => patch({ pace: p })}>
                {PACE_LABELS[p]}
              </Chip>
            ))}
          </div>
          <p className="mt-2 text-[11px] leading-4 text-mid">
            El ritmo todavía no cambia las recomendaciones; lo guardamos para el planificador de viajes.
          </p>
        </div>
      </section>

      {suggestions.length > 0 ? (
        <section className="rounded-2xl border border-line bg-surface p-4" aria-labelledby={`${ids}-sug`}>
          <h2 id={`${ids}-sug`} className="font-display text-[17px] font-extrabold">
            Sugerencias desde tus guardados
          </h2>
          <p className="mt-1 text-[13px] leading-[1.5] text-fg2">
            Estos intereses se repiten en tus viajes guardados. Tú decides si los agregas.
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <li key={s.interest}>
                <button
                  type="button"
                  onClick={() => toggleInterest(s.interest)}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border-[1.5px] border-dashed border-border px-3.5 text-[13px] font-semibold"
                  aria-label={`Agregar ${INTEREST_LABELS[s.interest]}, aparece en ${s.trips} viajes guardados`}
                >
                  + {INTEREST_LABELS[s.interest]} <span className="font-normal text-mid">({s.trips} viajes)</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div aria-live="polite" className="min-h-5">
        {notice ? (
          <p role={notice.kind === "error" ? "alert" : "status"} className={`text-[13px] font-semibold ${notice.kind === "error" ? "text-alert" : "text-fg"}`}>
            {notice.text}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="md" onClick={onSave}>
          Guardar perfil
        </Button>
        {hasProfile ? (
          <Button size="md" variant="outlineBold" href="/">
            Usarlo en una búsqueda
          </Button>
        ) : null}
      </div>
      {hasProfile ? (
        <p className="-mt-2 text-[12px] text-mid">
          En el inicio verás el botón «Usar mi Travel DNA» para precargar el formulario con {formatUsd(draft.budgetUsd)}, {draft.days} días
          y tus intereses.
        </p>
      ) : null}

      <section className="rounded-2xl bg-surface p-4" aria-labelledby={`${ids}-data`}>
        <h2 id={`${ids}-data`} className="font-display text-[17px] font-extrabold">
          Tus datos
        </h2>
        <p className="mt-1 text-[13px] leading-[1.5] text-fg2">
          Este perfil se guarda solo en este dispositivo: no se envía a ningún servidor ni se comparte. Puedes llevártelo o borrarlo cuando quieras.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={onExport}>
            <Download size={16} /> Exportar
          </Button>
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
            Importar
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            aria-label="Importar perfil de Travel DNA"
            onChange={(e) => void onImport(e.target.files?.[0])}
          />
          {hasProfile && !confirmingDelete ? (
            <Button size="sm" variant="outline" onClick={() => setConfirmingDelete(true)}>
              Borrar mi perfil
            </Button>
          ) : null}
        </div>
        {confirmingDelete ? (
          <div role="alertdialog" aria-label="Confirmar borrado" className="mt-3 rounded-xl border border-line p-3">
            <p className="text-[13px] font-semibold">¿Borrar tu Travel DNA de este dispositivo? No se puede deshacer.</p>
            <div className="mt-2 flex gap-2">
              <Button size="sm" onClick={onDelete}>
                Sí, borrar
              </Button>
              <Button size="sm" variant="outline" onClick={() => setConfirmingDelete(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : null}
        {hasProfile ? (
          <p className="mt-3 text-[11px] text-mid">
            Última edición: {new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(draft.updatedAt))}.
          </p>
        ) : (
          <p className="mt-3 text-[11px] text-mid">Aún no has guardado un perfil.</p>
        )}
      </section>

      <Link href="/cuenta" className="text-[13px] font-semibold underline underline-offset-2">
        Respaldar en mi cuenta (opcional)
      </Link>
      <Link href="/" className="text-[13px] font-semibold underline underline-offset-2">
        Volver al inicio
      </Link>
    </main>
  );
}

export function DnaView() {
  const dna = useDna();
  if (dna === undefined) return <Skeleton />;
  return <Editor initial={dna ?? defaultDna(new Date())} exists={dna !== null} />;
}
