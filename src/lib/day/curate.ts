/**
 * Curador: decide en qué orden se le ofrecen los lugares al armador del día. Reemplaza el orden por «ficha completa».
 * Función pura y explicable: cada lugar sale con su puntaje y sus razones en palabras.
 *
 * Señales (todas reales; lo desconocido se trata como desconocido):
 *  - interés: lecturas de Wikipedia de los últimos 30 días (personas reales; mide atención, no calidad).
 *  - evidencia: horario interpretable, sitio web, artículo o ficha en Wikidata (qué tanto podemos responder por el dato).
 * Ánimo del día:
 *  - «clasico»: lo que más gente busca, primero.
 *  - «descubrir»: lo menos buscado primero, siempre que tenga evidencia suficiente para no mandarte a ciegas.
 * Variedad: los lugares en «empate técnico» con el mejor rotan con `variant` (botón «Otra propuesta»).
 */
import type { Place } from "./places";

export const MOODS = ["clasico", "descubrir"] as const;
export type Mood = (typeof MOODS)[number];
export const MOOD_LABELS: Record<Mood, string> = { clasico: "Lo imperdible", descubrir: "Descubrir lo menos conocido" };

export interface Curated { place: Place; score: number; why: string[]; views30: number | null }

/** Pesos escritos, no aprendidos. Cambiarlos cambia el producto: están cubiertos por pruebas. */
export const WEIGHTS = { interest: 0.55, evidence: 0.45 } as const;
/** Diferencia de puntaje dentro de la cual dos lugares se consideran equivalentes y rotan. */
export const TIE_BAND = 0.12;

export function evidenceOf(p: Place): number {
  return (p.hours ? 0.5 : 0) + (p.website ? 0.2 : 0) + (p.wikipedia || p.wikidata ? 0.3 : 0);
}

const fmt = (n: number) => n.toLocaleString("es-CL");

export function curate(places: readonly Place[], views: ReadonlyMap<string, number | null>, mood: Mood, variant = 0): Curated[] {
  const known = places.map((p) => views.get(p.id)).filter((v): v is number => typeof v === "number");
  const maxLog = known.length ? Math.log1p(Math.max(...known)) : 0;
  const rows = places.map((place): Curated => {
    const v = views.get(place.id) ?? null;
    const pop = v === null || maxLog === 0 ? null : Math.log1p(v) / maxLog; // 0..1 relativo a los lugares comparados
    const ev = evidenceOf(place);
    const interest = mood === "clasico" ? (pop ?? 0.15) : (pop === null ? 0.45 : 1 - pop);
    const score = WEIGHTS.interest * interest + WEIGHTS.evidence * ev;
    const why: string[] = [];
    if (v === null) why.push("Sin dato de interés: no tiene artículo en Wikipedia que podamos medir.");
    else if (mood === "clasico") why.push(pop! >= 0.75 ? `De lo más buscado: unas ${fmt(v)} lecturas en Wikipedia el último mes.` : `Unas ${fmt(v)} lecturas en Wikipedia el último mes.`);
    else why.push(pop! <= 0.5 ? `Poco buscado (unas ${fmt(v)} lecturas en Wikipedia el último mes): menos conocido que otros de la zona.` : `Conocido (unas ${fmt(v)} lecturas en Wikipedia el último mes); va detrás de opciones menos vistas.`);
    if (!place.hours) why.push("Su horario no está confirmado: pesa menos en la elección.");
    return { place, score, why, views30: v };
  });
  rows.sort((a, b) => b.score - a.score || a.place.name.localeCompare(b.place.name, "es"));
  // Variedad: rota el grupo de cabeza (empate técnico) sin tocar el resto.
  const best = rows[0]?.score ?? 0;
  const band = rows.filter((r) => best - r.score <= TIE_BAND);
  if (band.length > 1 && variant > 0) {
    const k = variant % band.length;
    const rotated = [...band.slice(k), ...band.slice(0, k)];
    return [...rotated, ...rows.slice(band.length)];
  }
  return rows;
}
