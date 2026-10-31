import Link from "next/link";
import type { ReactNode } from "react";
import type { ConfidenceBand, PosterPalette } from "@/lib/types";
import { ConfidenceBar } from "./ConfidenceBar";
import { DestinationPoster, NEUTRAL_POSTER } from "./DestinationPoster";
import { FlapScore } from "./FlapScore";

interface Props {
  href: string;
  code: string;
  name: string;
  poster?: PosterPalette;
  /** Línea(s) bajo el nombre. */
  body: ReactNode;
  /** Score publicado; null = información limitada. */
  score: number | null;
  confidence?: { value: number; band: ConfidenceBand };
  /** "compact": fila de Guardados (84 px). */
  compact?: boolean;
}

/** Fila tipo pase de abordar: afiche, código + nombre, descripción, confianza y marcador. */
export function BoardingPassRow({ href, code, name, poster, body, score, confidence, compact = false }: Props) {
  const limited = score == null;
  return (
    <Link
      href={href}
      className={`flex overflow-hidden rounded-2xl bg-surface ${compact ? "min-h-[84px]" : "min-h-[98px]"}`}
    >
      <div className="relative w-[84px] shrink-0 self-stretch" aria-hidden="true">
        <div className="absolute inset-0">
          <DestinationPoster poster={poster ?? NEUTRAL_POSTER} variant="thumb" />
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 py-2.5 pl-3.5 pr-2.5">
        <div className={`font-display font-extrabold leading-[1.1] ${compact ? "text-[22px]" : "text-[20px]"}`}>
          {code}{" "}
          <span className={`font-sans font-medium ${compact ? "text-[15px]" : "text-[14px]"}`}>{name}</span>
        </div>
        <div className={`leading-[1.35] ${compact ? "text-[12px] text-mid" : "text-[12px] text-fg2"}`}>{body}</div>
        {confidence ? <ConfidenceBar value={confidence.value} band={confidence.band} size="sm" /> : null}
      </div>
      {limited ? (
        <div className="flex w-[72px] shrink-0 items-center justify-center pr-3 text-center text-[12px] font-bold leading-[1.2] text-alert">
          Información limitada
        </div>
      ) : (
        <div className="flex shrink-0 items-center pr-3.5">
          <FlapScore value={score} size="sm" />
        </div>
      )}
    </Link>
  );
}
