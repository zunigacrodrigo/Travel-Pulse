"use client";

import type { ReactNode } from "react";
import { GAP_CRITERIA, type GapCriterion } from "@/lib/types";
import { useSavedTrips } from "@/lib/client/saved";
import { CITY_NAMES, monthName } from "@/lib/client/format";
import { Slider } from "../ui/Slider";

export const SHORT_LABELS: Record<GapCriterion, string> = {
  autenticidad: "Autenticidad",
  saturacion: "Saturación",
  costo: "Costo",
  seguridad: "Seguridad percibida",
  comida: "Comida",
};

export const END_LABELS: Record<GapCriterion, [string, string]> = {
  autenticidad: ["Turístico", "Auténtico"],
  saturacion: ["Llena", "Tranquila"],
  costo: ["Caro", "Barato"],
  seguridad: ["Insegura", "Segura"],
  comida: ["Floja", "Excelente"],
};

export { GAP_CRITERIA };

/** Nombre y mes del viaje guardado (si existe en este dispositivo). */
export function useTripInfo(id: string): { name: string; month: string | null } {
  const trips = useSavedTrips();
  const trip = trips?.find((t) => t.destinationId === id.toUpperCase());
  return {
    name: trip?.name ?? CITY_NAMES[id.toUpperCase()] ?? id.toUpperCase(),
    month: trip ? monthName(trip.request.month) : null,
  };
}

/** Barra inferior fija con la acción principal y el enlace "Ahora no". */
export function FeedbackActions({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-20 mt-auto flex flex-col gap-0.5 bg-[linear-gradient(180deg,transparent,var(--c-page)_30%)] px-5 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-8">
      {children}
    </div>
  );
}

interface RangeProps {
  id: string;
  criterion: GapCriterion;
  label: string;
  value: number;
  onChange: (v: number) => void;
  /** Valor esperado (solo "después"): dibuja el marcador hueco. */
  expected?: number;
  /** Texto a la derecha del título en lugar del valor grande. */
  summary?: ReactNode;
}

/** Fila de 1 a 10 con etiquetas en los extremos. */
export function RangeRow({ id, criterion, label, value, onChange, expected, summary }: RangeProps) {
  const [lo, hi] = END_LABELS[criterion];
  const labelId = `${id}-label`;
  const tone = expected == null || value === expected ? "none" : value > expected ? "good" : "bad";
  return (
    <div className="min-h-[74px]">
      <div className="flex items-baseline justify-between gap-3">
        <label id={labelId} htmlFor={id} className="text-[15px] font-semibold">
          {label}
        </label>
        {summary ?? <span className="font-display text-[22px] font-extrabold">{value}</span>}
      </div>
      <Slider
        id={id}
        value={value}
        min={1}
        max={10}
        step={1}
        onChange={onChange}
        ariaLabelledBy={labelId}
        ariaValueText={`${value} de 10. ${value === 1 ? lo : value === 10 ? hi : `Entre ${lo.toLowerCase()} y ${hi.toLowerCase()}`}`}
        marker={expected}
        deltaTone={tone}
        plain={expected != null}
      />
      <div className="-mt-1.5 flex justify-between text-[11px] text-mid">
        <span>{lo}</span>
        <span>{hi}</span>
      </div>
    </div>
  );
}
