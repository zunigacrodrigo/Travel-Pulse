export const SIGNAL_TYPES = ["Transporte", "Seguridad", "Afluencia", "Lugar nuevo", "Clima", "Accesibilidad", "Precio", "Otro"] as const;
export type SignalType = (typeof SIGNAL_TYPES)[number];
export type SignalStatus = "reciente" | "por confirmar" | "caducada";
export type TravelSignal = {
  id: string;
  title: string;
  detail: string;
  place: string;
  city: string;
  type: SignalType;
  createdAt: string;
  expiresAt: string;
  source: "comunidad" | "demo";
  evidence: "observación directa" | "foto" | "enlace";
  confirmations: number;
  reporter: string;
};
export type CreateSignalInput = Pick<TravelSignal, "title" | "detail" | "place" | "city" | "type" | "evidence">;
