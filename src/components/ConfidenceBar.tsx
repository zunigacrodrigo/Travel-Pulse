import type { ConfidenceBand } from "@/lib/types";

interface Props {
  value: number;
  band: ConfidenceBand;
  /** "panel": sobre fondo Ink; "plain": sobre papel. */
  tone?: "panel" | "plain";
  /** Texto previo al porcentaje, p. ej. "Confianza". */
  label?: string;
  /** "block": barra de 8 px con porcentaje grande aparte (detalle). */
  size?: "sm" | "md";
  className?: string;
  /** Oculta el porcentaje en texto (cuando ya se muestra aparte). */
  hideText?: boolean;
}

const BAND_WORD: Record<ConfidenceBand, string> = {
  normal: "",
  warning: "media",
  limited: "baja",
};

/** Barra de confianza + porcentaje + palabra: el color nunca es la única señal. */
export function ConfidenceBar({ value, band, tone = "plain", label, size = "sm", className = "", hideText = false }: Props) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const fill =
    band === "limited"
      ? "var(--c-stamp-fill)"
      : band === "warning"
        ? tone === "panel"
          ? "#FFC857"
          : "var(--c-warn-fill)"
        : tone === "panel"
          ? "#46d4f2"
          : "var(--c-fill)";
  const track = tone === "panel" ? "bg-track-panel" : "bg-track";
  const textCls =
    band === "limited"
      ? tone === "panel"
        ? "font-semibold text-coral"
        : "font-semibold text-alert"
      : tone === "panel"
        ? "text-panel-fg2"
        : "text-mid";
  const word = BAND_WORD[band];
  return (
    <div className={`flex items-center gap-2.5 ${size === "sm" ? "text-[12px]" : "text-[13px]"} ${className}`}>
      <div className={`${size === "sm" ? "h-[6px]" : "h-2"} flex-1 overflow-hidden rounded-[2px] ${track}`} aria-hidden="true">
        <div className="h-full rounded-[2px]" style={{ width: `${pct}%`, background: fill }} />
      </div>
      <span className={`shrink-0 ${textCls} ${hideText ? "sr-only" : ""}`}>
        {label ? `${label} ` : ""}
        {pct}%{word ? `, ${word}` : ""}
      </span>
    </div>
  );
}
