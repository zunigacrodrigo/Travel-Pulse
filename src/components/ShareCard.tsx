import type { SavedTrip } from "@/lib/client/saved";
import { formatUsd, monthName, capitalize } from "@/lib/client/format";
import { DestinationPoster, NEUTRAL_POSTER } from "./DestinationPoster";
import { FlapScore } from "./FlapScore";

/** Vista previa 9:16 de la imagen compartible (la imagen final la genera el servidor). */
export function ShareCard({ trip }: { trip: SavedTrip }) {
  return (
    <div
      className="relative aspect-[9/16] w-[176px] shrink-0 overflow-hidden rounded-[18px] bg-ink text-panel-fg"
      role="img"
      aria-label={`Vista previa de la tarjeta para compartir: ${trip.name}${trip.score != null ? `, puntaje ${trip.score}` : ""}`}
    >
      <div className="h-[92px]">
        <DestinationPoster poster={trip.poster ?? NEUTRAL_POSTER} variant="card" />
      </div>
      <div className="flex flex-col px-3.5 py-2.5" aria-hidden="true">
        <div className="text-[11px] text-[#8FA3BA]">Mi próximo viaje</div>
        <div className="mt-1 font-display text-[48px] font-black leading-[0.85] tracking-[1px] text-signal">{trip.code}</div>
        <div className="mt-1 truncate text-[13px]">{trip.country ? `${trip.name}, ${trip.country}` : trip.name}</div>
        <div className="mt-1.5">
          <FlapScore value={trip.score} size="card" variant="panel" />
        </div>
        <div className="mt-1.5 text-[11px] text-[#8FA3BA]">
          {capitalize(monthName(trip.request.month))}
          {trip.totalUsd != null ? `, ${formatUsd(trip.totalUsd)}` : ""}
        </div>
        <div className="mt-1.5 font-display text-[12px] font-extrabold">Travel Pulse</div>
      </div>
    </div>
  );
}
