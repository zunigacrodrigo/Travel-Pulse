/**
 * Puente entre el Travel DNA (intereses declarados por el viajero) y los tipos de lugar de «Mi día».
 *
 * Reglas:
 *  - Solo usa lo que el viajero declaró. No infiere nada personal.
 *  - Un interés sin equivalente real en los datos (p. ej. «romance», «lujo») NO se traduce: no se adivina.
 *  - Sin preferencias declaradas, el orden es el de siempre: no se cambia nada en silencio.
 */
import type { Interest } from "@/lib/types";
import type { Pace } from "@/lib/client/dna-core";
import { KINDS, KIND_META, type Kind } from "./places";

/** Qué tipos de lugar sirven a cada interés, solo cuando la relación es directa. */
export const INTEREST_TO_KINDS: Partial<Record<Interest, readonly Kind[]>> = {
  cultura: ["museo", "galeria"],
  comida: ["restaurante"],
  naturaleza: ["parque"],
};

/**
 * Ordena los tipos de lugar según los intereses declarados. Los tipos que sirven a un interés van primero,
 * en el orden en que el viajero los declaró. El resto conserva el orden original.
 */
export function orderKindsByInterests(interests: readonly Interest[], kinds: readonly Kind[] = KINDS): Kind[] {
  const rank = new Map<Kind, number>();
  interests.forEach((interest, i) => {
    for (const k of INTEREST_TO_KINDS[interest] ?? []) if (!rank.has(k)) rank.set(k, i);
  });
  const NONE = Number.MAX_SAFE_INTEGER;
  return [...kinds].sort((a, b) => (rank.get(a) ?? NONE) - (rank.get(b) ?? NONE));
}

/** Intereses que no tienen equivalente en los datos de Mi día. Se muestran al viajero, no se ocultan. */
export function unmappedInterests(interests: readonly Interest[]): Interest[] {
  return interests.filter((i) => !(INTEREST_TO_KINDS[i]?.length));
}

/**
 * Ritmo declarado → factor sobre la duración de cada visita. Las duraciones por tipo ya son SUPUESTOS
 * (museo 90 min, etc.); el ritmo las ajusta y el plan lo declara. No es un dato de ningún lugar.
 */
export const PACE_FACTOR: Record<Pace, number> = { tranquilo: 1.25, equilibrado: 1, intenso: 0.8 };

export const paceFactor = (pace: Pace | null | undefined): number => (pace ? PACE_FACTOR[pace] : 1);

/** Minutos de visita para un tipo de lugar según el ritmo, redondeados a 5 min. */
export function visitMinutes(kind: Kind, pace: Pace | null | undefined): number {
  const base = KIND_META[kind].durationMin;
  return pace ? Math.round((base * paceFactor(pace)) / 5) * 5 : base;
}
