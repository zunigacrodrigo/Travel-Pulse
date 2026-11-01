/**
 * PulseMesh: modelo, validación y textos de los reportes de viajeros. Puro (sin red ni DOM).
 * Las reglas de seguridad (independencia, vigencia, límites) las impone la base de datos
 * (supabase/migrations/0005_pulsemesh.sql); aquí se valida antes para dar mensajes claros.
 */
import { z } from "zod";

export const CATEGORIES = ["condiciones", "precios", "afluencia", "descubrimientos"] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  condiciones: "Condiciones del lugar",
  precios: "Precios",
  afluencia: "Afluencia",
  descubrimientos: "Descubrimientos",
};

/** Tipos de reporte por categoría. La seguridad queda fuera del piloto hasta contar con moderación. */
export const KINDS: Record<Category, ReadonlyArray<{ kind: string; label: string }>> = {
  condiciones: [
    { kind: "mal_clima", label: "Mal clima" },
    { kind: "via_cortada", label: "Ruta o acceso cortado" },
    { kind: "cerrado", label: "Lugar cerrado" },
    { kind: "obras", label: "Obras o molestias" },
    { kind: "buen_estado", label: "En muy buen estado" },
  ],
  precios: [{ kind: "precio_observado", label: "Precio que pagué o vi" }],
  afluencia: [
    { kind: "fila_larga", label: "Fila larga" },
    { kind: "muy_lleno", label: "Muy lleno" },
    { kind: "tranquilo", label: "Tranquilo" },
  ],
  descubrimientos: [
    { kind: "lugar_nuevo", label: "Lugar nuevo" },
    { kind: "experiencia", label: "Experiencia que vale la pena" },
    { kind: "mejor_alternativa", label: "Mejor alternativa cercana" },
  ],
};

/** Vigencia que fija el servidor, solo para informar en pantalla. */
export const TTL_HOURS: Record<Category, number> = { afluencia: 6, condiciones: 24, precios: 14 * 24, descubrimientos: 30 * 24 };

export interface PilotCity {
  key: string;
  name: string;
  country: string;
  currency: "CLP" | "BRL" | "USD";
  /** Escrituras aceptadas del nombre y del país (sin tildes ni mayúsculas). */
  names: readonly string[];
  countries: readonly string[];
}

/** Ciudades donde el piloto de reportes está abierto. */
export const PILOT_CITIES: readonly PilotCity[] = [
  { key: "santiago-cl", name: "Santiago", country: "Chile", currency: "CLP", names: ["santiago", "santiago de chile"], countries: ["chile"] },
  { key: "sao-paulo-br", name: "São Paulo", country: "Brasil", currency: "BRL", names: ["sao paulo"], countries: ["brasil", "brazil"] },
  { key: "valparaiso-cl", name: "Valparaíso", country: "Chile", currency: "CLP", names: ["valparaiso"], countries: ["chile"] },
];

const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/**
 * Ciudad del piloto a la que corresponde un nombre ("Santiago", "Santiago de Chile", "São Paulo, Brasil"…).
 * Si el texto trae país, debe coincidir: «Santiago, España» no es Santiago de Chile.
 */
export function pilotCity(name: string): PilotCity | null {
  const [head = "", country] = name.split(",").map((p) => fold(p));
  const city = PILOT_CITIES.find((c) => c.names.includes(head));
  if (!city) return null;
  if (country && !city.countries.includes(country)) return null;
  return city;
}

/** La base guarda ~1 km; se redondea también aquí para no enviar más precisión de la necesaria. */
export const roundCoord = (n: number) => Math.round(n * 100) / 100;

export const reportInputSchema = z
  .object({
    category: z.enum(CATEGORIES),
    kind: z.string(),
    title: z.string().trim().min(3, "El título necesita al menos 3 caracteres.").max(120, "El título admite hasta 120 caracteres."),
    detail: z.string().trim().max(500, "El detalle admite hasta 500 caracteres.").optional(),
    priceAmount: z.number().finite().min(0).max(1e9).optional(),
    priceCurrency: z.enum(["CLP", "BRL", "USD"]).optional(),
    lat: z.number().min(-90).max(90).optional(),
    lon: z.number().min(-180).max(180).optional(),
  })
  .superRefine((v, ctx) => {
    if (!KINDS[v.category].some((k) => k.kind === v.kind)) ctx.addIssue({ code: "custom", path: ["kind"], message: "Elige un tipo de reporte válido." });
    if (v.category === "precios" && v.priceAmount === undefined) ctx.addIssue({ code: "custom", path: ["priceAmount"], message: "Indica el precio observado." });
    if (v.category !== "precios" && v.priceAmount !== undefined) ctx.addIssue({ code: "custom", path: ["priceAmount"], message: "Solo los reportes de precios llevan monto." });
    if ((v.priceAmount === undefined) !== (v.priceCurrency === undefined)) ctx.addIssue({ code: "custom", path: ["priceCurrency"], message: "Indica la moneda del precio." });
    if ((v.lat === undefined) !== (v.lon === undefined)) ctx.addIssue({ code: "custom", path: ["lat"], message: "La ubicación necesita latitud y longitud." });
  });
export type ReportInput = z.infer<typeof reportInputSchema>;

export interface InsertRow {
  user_id: string;
  city_key: string;
  category: Category;
  kind: string;
  title: string;
  detail: string | null;
  price_amount: number | null;
  price_currency: string | null;
  lat_approx: number | null;
  lon_approx: number | null;
}

/** Fila para insertar. Las columnas que decide el servidor (vigencia, marcas, ocultamiento) no se envían. */
export function toInsertRow(input: ReportInput, userId: string, cityKey: string): InsertRow {
  return {
    user_id: userId,
    city_key: cityKey,
    category: input.category,
    kind: input.kind,
    title: input.title,
    detail: input.detail ? input.detail : null,
    price_amount: input.priceAmount ?? null,
    price_currency: input.priceCurrency ?? null,
    lat_approx: input.lat === undefined ? null : roundCoord(input.lat),
    lon_approx: input.lon === undefined ? null : roundCoord(input.lon),
  };
}

export type SignalState = "por_confirmar" | "corroborada" | "en_disputa";

const publicSignalSchema = z.object({
  id: z.string().min(1),
  city_key: z.string(),
  category: z.enum(CATEGORIES),
  kind: z.string(),
  title: z.string(),
  detail: z.string().nullable().optional(),
  price_amount: z.union([z.number(), z.string()]).nullable().optional(),
  price_currency: z.string().nullable().optional(),
  observed_at: z.string(),
  expires_at: z.string(),
  independent_count: z.number().int().min(1),
  contradicted_count: z.number().int().min(0),
  state: z.enum(["por_confirmar", "corroborada", "en_disputa"]),
  is_mine: z.boolean().nullable().optional(),
});

export interface PublicSignal {
  id: string;
  cityKey: string;
  category: Category;
  kind: string;
  title: string;
  detail: string | null;
  priceAmount: number | null;
  priceCurrency: string | null;
  observedAt: string;
  expiresAt: string;
  independentCount: number;
  contradictedCount: number;
  state: SignalState;
  isMine: boolean;
}

/** Interpreta las filas de la vista pública. Descarta lo que no cumple el contrato: nunca se confía en la red. */
export function parsePublicSignals(raw: unknown): PublicSignal[] {
  if (!Array.isArray(raw)) return [];
  const out: PublicSignal[] = [];
  for (const row of raw) {
    const p = publicSignalSchema.safeParse(row);
    if (!p.success) continue;
    const r = p.data;
    const amount = r.price_amount == null ? null : Number(r.price_amount);
    out.push({
      id: r.id, cityKey: r.city_key, category: r.category, kind: r.kind, title: r.title,
      detail: r.detail ?? null,
      priceAmount: amount !== null && Number.isFinite(amount) ? amount : null,
      priceCurrency: r.price_currency ?? null,
      observedAt: r.observed_at, expiresAt: r.expires_at,
      independentCount: r.independent_count, contradictedCount: r.contradicted_count,
      state: r.state, isMine: r.is_mine === true,
    });
  }
  return out.sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt));
}

export function kindLabel(category: Category, kind: string): string {
  return KINDS[category].find((k) => k.kind === kind)?.label ?? kind;
}

/** Texto honesto del estado: nunca presenta un reporte de viajero como un hecho oficial. */
export function stateText(s: Pick<PublicSignal, "state" | "independentCount" | "contradictedCount">): string {
  if (s.state === "en_disputa") return `En disputa: ${s.contradictedCount} personas lo contradicen. No lo tomes como cierto.`;
  if (s.state === "corroborada") return `Reportado por ${s.independentCount} personas distintas. Sigue siendo una observación de viajeros, no una fuente oficial.`;
  return "Lo reportó 1 persona. Falta que otras lo confirmen.";
}

/** «vigente por 5 h», «vigente por 2 d». */
export function validity(expiresAt: string, now: Date): string {
  const ms = Date.parse(expiresAt) - now.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return "caducado";
  const h = Math.ceil(ms / 3_600_000);
  return h < 48 ? `vigente por ${h} h` : `vigente por ${Math.ceil(h / 24)} d`;
}

const CODES: Record<string, string> = {
  "23505": "Ya habías respondido este reporte.",
  "42501": "Inicia sesión para participar.",
  "23514": "No se pudo enviar el reporte: revisa los datos.",
  "23503": "El reporte ya no existe.",
};

/** Mensaje claro para el viajero a partir de un error de la base de datos. */
export function friendlyError(e: { code?: string; message?: string } | null | undefined): string {
  const m = e?.message ?? "";
  if (m.includes("Límite diario de reportes")) return "Llegaste al límite de 20 reportes por día. Vuelve mañana.";
  if (m.includes("Límite diario de confirmaciones")) return "Llegaste al límite de confirmaciones de hoy.";
  if (m.includes("propio reporte")) return "No puedes confirmar tu propio reporte.";
  if (m.includes("ya no está vigente")) return "Este reporte ya caducó o fue ocultado.";
  return (e?.code && CODES[e.code]) || "No se pudo completar la acción. Inténtalo de nuevo.";
}
