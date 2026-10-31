/**
 * Reglas de sincronización local ⇄ nube. Puras (sin red ni DOM) para poder probarlas.
 *
 * Criterio: gana la versión con la fecha más reciente, usando la fecha que viaja dentro del
 * propio dato (p. ej. `dna.updatedAt`), no la hora del servidor, para que un reloj desfasado
 * no sobrescriba cambios recientes. Si no se puede decidir, no se toca nada.
 */

export type SyncDecision = "push" | "pull" | "none";

const ts = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const n = Date.parse(iso);
  return Number.isNaN(n) ? null : n;
};

/** Decide qué lado debe copiarse al otro. Fechas inválidas cuentan como ausentes. */
export function decideByTimestamp(localAt: string | null | undefined, cloudAt: string | null | undefined): SyncDecision {
  const l = ts(localAt);
  const c = ts(cloudAt);
  if (l === null && c === null) return "none";
  if (c === null) return "push";
  if (l === null) return "pull";
  if (l === c) return "none";
  return l > c ? "push" : "pull";
}

export interface Dated {
  destinationId: string;
  savedAt: string;
}

export interface SavedMerge<T extends Dated> {
  /** Lista resultante, la más reciente primero. */
  merged: T[];
  /** Elementos que hay que subir (nuevos o más recientes que los de la nube). */
  toPush: T[];
  /** Cuántos elementos de la nube se incorporaron o reemplazaron localmente. */
  pulled: number;
}

/**
 * Une guardados por destino. Para el mismo destino gana el más reciente.
 * Es una unión: una eliminación local no se propaga sola; la app borra en la nube
 * en el momento de eliminar, cuando hay sesión.
 */
export function mergeSaved<T extends Dated>(local: T[], cloud: T[]): SavedMerge<T> {
  const byId = new Map<string, T>();
  const cloudById = new Map(cloud.map((c) => [c.destinationId, c]));
  let pulled = 0;
  const toPush: T[] = [];

  for (const item of local) byId.set(item.destinationId, item);
  for (const item of cloud) {
    const mine = byId.get(item.destinationId);
    if (!mine) {
      byId.set(item.destinationId, item);
      pulled += 1;
    } else if (decideByTimestamp(mine.savedAt, item.savedAt) === "pull") {
      byId.set(item.destinationId, item);
      pulled += 1;
    }
  }
  for (const item of local) {
    const theirs = cloudById.get(item.destinationId);
    if (!theirs || decideByTimestamp(item.savedAt, theirs.savedAt) === "push") toPush.push(item);
  }
  const merged = [...byId.values()].sort((a, b) => (ts(b.savedAt) ?? 0) - (ts(a.savedAt) ?? 0));
  return { merged, toPush, pulled };
}

/** La nube solo guarda destinos del catálogo (clave foránea a `destinations`: tres letras). */
export const isCloudDestinationId = (id: string): boolean => /^[A-Z]{3}$/.test(id);
