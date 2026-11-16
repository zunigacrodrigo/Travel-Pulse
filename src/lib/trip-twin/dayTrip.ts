import { CITIES } from "@/lib/day/cities";

/** El viaje armado en Mi día guarda su ciudad y su fecha en el id: `dia-<ciudad>-<AAAA-MM-DD>`. Otro formato → null. */
export function parseDayTripId(id: string): { city: string; date: string } | null {
  const m = /^dia-([a-z0-9-]+)-(\d{4}-\d{2}-\d{2})$/.exec(id);
  return m && m[1]! in CITIES ? { city: m[1]!, date: m[2]! } : null;
}
