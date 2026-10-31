import { scoreColor, scoreTone, TONE_COLOR } from "@/lib/client/score";

export type FlapSize = "sm" | "card" | "md" | "lg" | "xl";

const DIMS: Record<FlapSize, { w: number; h: number; font: number; gap: number; radius: number }> = {
  sm: { w: 26, h: 38, font: 26, gap: 3, radius: 5 },
  card: { w: 30, h: 44, font: 32, gap: 3, radius: 5 },
  md: { w: 38, h: 54, font: 40, gap: 4, radius: 6 },
  lg: { w: 46, h: 68, font: 52, gap: 4, radius: 7 },
  xl: { w: 58, h: 84, font: 66, gap: 6, radius: 7 },
};

interface TileProps {
  char: string;
  size?: FlapSize;
  /** "panel": fichas sobre un panel Ink; "plain": sobre papel. */
  variant?: "panel" | "plain";
  color?: string;
  /** Anima el giro de la ficha cuando cambia el carácter. */
  flip?: boolean;
  width?: number;
}

/** Una ficha del tablero: fondo Ink, carácter Signal, línea fina de bisagra a media altura. */
export function FlapTile({ char, size = "md", variant = "plain", color = "#46d4f2", flip = false, width }: TileProps) {
  const d = DIMS[size];
  return (
    <span
      aria-hidden="true"
      className="relative inline-flex select-none items-center justify-center overflow-hidden font-display font-extrabold leading-none"
      style={{
        width: width ?? d.w,
        height: d.h,
        borderRadius: d.radius,
        fontSize: d.font,
        color,
        background: variant === "panel" ? "var(--c-tile-panel)" : "var(--c-tile)",
      }}
    >
      <span key={flip ? char : undefined} className={flip ? "tp-flip" : undefined}>
        {char}
      </span>
      <span
        className="pointer-events-none absolute inset-x-0 top-1/2 h-[1.5px] -translate-y-1/2"
        style={{ background: "rgba(232,237,241,.55)" }}
      />
    </span>
  );
}

interface Props {
  /** Puntaje 0..100; null muestra fichas con guion. */
  value: number | null;
  size?: FlapSize;
  variant?: "panel" | "plain";
  className?: string;
}

/** Marcador de score tipo tablero de salidas: dos fichas Ink con dígitos Signal. */
export function FlapScore({ value, size = "md", variant = "plain", className = "" }: Props) {
  const d = DIMS[size];
  const rounded = value == null ? null : Math.max(0, Math.round(value));
  const chars = rounded == null ? ["–", "–"] : String(rounded).padStart(2, "0").split("");
  const color = rounded == null ? TONE_COLOR.none : scoreColor(rounded);
  const label =
    rounded == null
      ? "Sin puntaje: información limitada"
      : `Puntaje ${rounded} de 100${scoreTone(rounded) === "low" ? ", bajo" : scoreTone(rounded) === "mid" ? ", medio" : ""}`;
  return (
    <span role="img" aria-label={label} className={`inline-flex shrink-0 ${className}`} style={{ gap: d.gap }}>
      {chars.map((c, i) => (
        <FlapTile key={i} char={c} size={size} variant={variant} color={color} />
      ))}
    </span>
  );
}
