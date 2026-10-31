import type { CreateSignalInput, SignalStatus, TravelSignal } from "./types";

const TTL_HOURS: Record<string, number> = {
  Transporte: 4, Seguridad: 3, Afluencia: 3, "Lugar nuevo": 24 * 30,
  Clima: 3, Accesibilidad: 24 * 7, Precio: 24, Otro: 12,
};

function cityWords(value: string): string[] {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().match(/[a-z0-9]+/g)?.filter((word) => !["de", "del", "la", "el", "the", "of"].includes(word)) ?? [];
}

/** Compara nombres escritos y canónicos de geocodificación sin confundir ciudades con prefijos comunes. */
export function sameCity(a: string, b: string): boolean {
  const left = cityWords(a), right = cityWords(b);
  return left.length > 0 && right.length > 0 && (left.every((word) => right.includes(word)) || right.every((word) => left.includes(word)));
}

export function signalStatus(signal: Pick<TravelSignal, "createdAt" | "expiresAt">, now = Date.now()): SignalStatus {
  const created = Date.parse(signal.createdAt);
  const expires = Date.parse(signal.expiresAt);
  if (!Number.isFinite(created) || !Number.isFinite(expires) || expires <= now) return "caducada";
  if (now - created > 60 * 60 * 1000) return "por confirmar";
  return "reciente";
}

export function signalConfidence(signal: Pick<TravelSignal, "confirmations" | "evidence" | "source">): number {
  // Indicador explicable del prototipo, no una probabilidad estadística validada.
  // Una foto elegida en el formulario no se adjunta ni verifica en esta versión.
  return Math.min(95, 35 + Math.min(signal.confirmations, 4) * 10 + (signal.evidence === "enlace" ? 8 : 0) + (signal.source === "comunidad" ? 8 : 0));
}

export function createSignal(input: CreateSignalInput, now = new Date()): TravelSignal {
  const title = input.title.trim();
  const detail = input.detail.trim();
  const place = input.place.trim();
  const city = input.city.trim();
  if (title.length < 5 || title.length > 90) throw new Error("El título debe tener entre 5 y 90 caracteres.");
  if (detail.length < 10 || detail.length > 500) throw new Error("Describe lo observado en 10–500 caracteres.");
  if (place.length < 2 || place.length > 100 || city.length < 2 || city.length > 80) throw new Error("Indica un lugar y una ciudad válidos.");
  const hours = TTL_HOURS[input.type] ?? 12;
  return {
    id: `sig_${now.getTime().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    title, detail, place, city, type: input.type, evidence: input.evidence,
    createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + hours * 3600_000).toISOString(),
    source: "comunidad", confirmations: 0, reporter: "Tú",
  };
}
