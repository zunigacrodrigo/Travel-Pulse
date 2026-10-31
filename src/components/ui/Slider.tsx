"use client";

import type { CSSProperties } from "react";

interface Props {
  id: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  ariaLabelledBy?: string;
  ariaLabel?: string;
  ariaValueText?: string;
  /** Si se pasa, dibuja un marcador hueco (p. ej. "lo que esperaba") y el tramo hasta el valor. */
  marker?: number;
  /** Con marcador: tono del tramo entre expectativa y realidad. */
  deltaTone?: "good" | "bad" | "none";
  /** Sin relleno oscuro hasta el valor (para la pantalla "después"). */
  plain?: boolean;
}

const POS = (ratio: number) => `calc(10px + (100% - 20px) * ${ratio})`;

/** Slider accesible: un <input type="range"> real, con pista dibujada detrás. */
export function Slider({
  id,
  value,
  min,
  max,
  step = 1,
  onChange,
  ariaLabelledBy,
  ariaLabel,
  ariaValueText,
  marker,
  deltaTone = "none",
  plain = false,
}: Props) {
  const ratio = (value - min) / (max - min);
  const mRatio = marker == null ? null : (marker - min) / (max - min);
  const deltaColor = deltaTone === "bad" ? "var(--c-stamp-fill)" : deltaTone === "good" ? "var(--verde)" : "transparent";

  return (
    <div className="relative h-11">
      <div aria-hidden="true" className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-track" />
      {!plain && (
        <div
          aria-hidden="true"
          className="absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-fill"
          style={{ width: POS(ratio) }}
        />
      )}
      {mRatio !== null && (
        <>
          <div
            aria-hidden="true"
            className="absolute top-1/2 h-1.5 -translate-y-1/2"
            style={{
              left: POS(Math.min(ratio, mRatio)),
              width: `calc((100% - 20px) * ${Math.abs(ratio - mRatio)})`,
              background: deltaColor,
            }}
          />
          <div
            aria-hidden="true"
            className="absolute top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[2.5px] border-fg bg-surface"
            style={{ left: POS(mRatio) }}
          />
        </>
      )}
      <input
        id={id}
        type="range"
        className="tp-range absolute inset-0"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-labelledby={ariaLabelledBy}
        aria-label={ariaLabel}
        aria-valuetext={ariaValueText}
        style={{ "--ratio": ratio } as CSSProperties}
      />
    </div>
  );
}
