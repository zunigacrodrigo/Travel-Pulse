/** Un dato de contexto sobre el día del viajero, siempre con su fuente y su fecha de consulta. */
export interface ContextItem {
  id: string;
  kind: "feriado" | "aire" | "uv";
  /** `aviso` pide atención al planificar; `info` solo informa. */
  severity: "info" | "aviso";
  title: string;
  detail: string;
  source: { name: string; url: string };
  /** `confirmado`: dato publicado por la fuente para ese día. `pronostico`: modelo, puede variar. */
  certainty: "confirmado" | "pronostico";
}

/** Una fuente que no pudo consultarse: se muestra, no se oculta. */
export interface SourceGap { source: string; reason: string }

export interface DayContext {
  cityKey: string;
  date: string;
  items: ContextItem[];
  gaps: SourceGap[];
  fetchedAt: string;
}
