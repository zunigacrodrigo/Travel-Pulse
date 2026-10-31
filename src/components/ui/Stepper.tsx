"use client";

import { useId } from "react";
import { Minus, Plus } from "./Icons";

interface Props {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  /** Para los nombres accesibles de los botones: "Menos días", "Más días". */
  unit: string;
}

export function Stepper({ label, value, min, max, onChange, unit }: Props) {
  const labelId = useId();
  const btn =
    "grid size-11 place-items-center rounded-full text-fg disabled:opacity-35";
  const ring = "grid size-8 place-items-center rounded-full border-[1.5px] border-border";
  return (
    <div role="group" aria-labelledby={labelId} className="flex flex-col">
      <span id={labelId} className="text-[12px] text-mid">
        {label}
      </span>
      <div className="-ml-[6px] flex items-center">
        <button
          type="button"
          className={btn}
          aria-label={`Menos ${unit}`}
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - 1))}
        >
          <span className={ring}>
            <Minus size={14} />
          </span>
        </button>
        <output aria-live="polite" className="min-w-6 text-center font-display text-[20px] font-extrabold">
          {value}
        </output>
        <button
          type="button"
          className={btn}
          aria-label={`Más ${unit}`}
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + 1))}
        >
          <span className={ring}>
            <Plus size={14} />
          </span>
        </button>
      </div>
    </div>
  );
}
