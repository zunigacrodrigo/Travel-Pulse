"use client";

import type { PosterPalette, TripRequest } from "@/lib/types";
import { removeTrip, saveTrip, useIsSaved } from "@/lib/client/saved";
import { Bookmark } from "./ui/Icons";

interface Props {
  destinationId: string;
  name: string;
  country?: string;
  score: number | null;
  totalUsd: number | null;
  request: TripRequest;
  poster?: PosterPalette;
  /** "button": botón con texto (resultados); "circle": ícono en círculo (detalle). */
  variant?: "button" | "circle";
  className?: string;
}

export function SaveButton({ destinationId, name, country, score, totalUsd, request, poster, variant = "button", className = "" }: Props) {
  const saved = useIsSaved(destinationId);
  const toggle = () => {
    if (saved) removeTrip(destinationId);
    else
      saveTrip({
        destinationId,
        name,
        code: destinationId,
        score,
        totalUsd,
        savedAt: new Date().toISOString(),
        request,
        country,
        poster,
      });
  };

  if (variant === "circle") {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-pressed={saved}
        aria-label={saved ? `Quitar ${name} de guardados` : `Guardar ${name}`}
        className={`grid size-11 place-items-center rounded-full bg-surface text-fg ${className}`}
      >
        <Bookmark size={18} filled={saved} />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={toggle}
      className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border-2 border-outline text-[14px] font-semibold ${className}`}
    >
      <Bookmark size={16} filled={saved} />
      {saved ? "Guardado" : "Guardar"}
    </button>
  );
}
