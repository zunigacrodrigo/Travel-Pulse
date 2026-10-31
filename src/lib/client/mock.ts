/**
 * Datos de prueba para desarrollar la UI sin API. Solo se usa si
 * NEXT_PUBLIC_USE_MOCK === "1" (ver api.ts). Reproduce la historia del
 * prototipo: CUZ 84, SLA 79, OAX 74, MDE 71 y FLN con información limitada (34%).
 *
 * Atajos para probar estados con el formulario del Home:
 *  - presupuesto US$300      -> pantalla "Sin resultados"
 *  - presupuesto US$350      -> pantalla de error
 */
import {
  BASE_WEIGHTS,
  ENGINE_VERSION,
  FACTOR_KEYS,
  FACTOR_LABELS,
  GAP_CRITERIA,
  type ComparePriority,
  type CompareResponse,
  type ConfidenceBand,
  type Destination,
  type DestinationCard,
  type DestinationDetailResponse,
  type FactorKey,
  type FactorResult,
  type FeedbackRequest,
  type FeedbackResponse,
  type GapRatings,
  type GlobeResponse,
  type PosterPalette,
  type RecommendationsResponse,
  type ScoreResult,
  type Source,
  type SurpriseResponse,
  type TripRequest,
  type ClickResponse,
} from "@/lib/types";
import { ApiError } from "./api";
import { decodeRequest } from "./query";

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/* ---------------------------- Fuentes ---------------------------- */

const SOURCES: Source[] = [
  { id: "estimacion-tp", name: "Estimación experimental Travel Pulse", license: "Dataset sintético interno", maxAgeDays: 1, reliability: 0.25 },
  { id: "curaduria", name: "Curaduría Travel Pulse", license: "Propia", maxAgeDays: 120, reliability: 0.8 },
  { id: "openmeteo", name: "Open-Meteo", license: "CC BY 4.0", maxAgeDays: 7, reliability: 0.9, url: "https://open-meteo.com" },
  { id: "turismo", name: "Estadísticas de turismo", license: "Datos abiertos", maxAgeDays: 120, reliability: 0.7 },
  { id: "openflights", name: "OpenFlights", license: "ODbL", maxAgeDays: 180, reliability: 0.75, url: "https://openflights.org" },
  { id: "cancilleria", name: "Alerta oficial de cancillería", license: "Dominio público", maxAgeDays: 30, reliability: 0.95 },
  { id: "trends", name: "Tendencias de búsqueda", license: "Agregado", maxAgeDays: 14, reliability: 0.6 },
];

const SRC = {
  precio: ["Estimación experimental Travel Pulse", "2026-10-06"],
  experiencia: ["Curaduría Travel Pulse", "2026-09-15"],
  clima: ["Open-Meteo", "2026-10-06"],
  temporada: ["Curaduría Travel Pulse", "2026-09-15"],
  saturacion: ["Estadísticas de turismo", "2026-08-20"],
  conectividad: ["OpenFlights", "2026-09-12"],
  riesgo: ["Alerta oficial de cancillería", "2026-10-05"],
  tendencia: ["Tendencias de búsqueda", "2026-10-04"],
} as const satisfies Record<FactorKey, readonly [string, string]>;

/* --------------------------- Destinos ---------------------------- */

function dest(
  id: string,
  name: string,
  country: string,
  lat: number,
  lon: number,
  altitudeM: number,
  poster: PosterPalette,
  blurb: string,
  similar: string[],
): Destination {
  return {
    id,
    name,
    country,
    lat,
    lon,
    altitudeM,
    tags: { aventura: 3, comida: 3, cultura: 3, naturaleza: 3, playa: 1, romance: 2, desconocido: 2, lujo: 2 },
    riskLevel: { value: 2, sourceId: "cancilleria", observedAt: "2026-10-05" },
    riskReasons: ["Precaución en zonas rurales"],
    connectivity: { SCL: { value: { directFlights: false, flightHours: 5, weeklyFrequency: 14 }, sourceId: "openflights", observedAt: "2026-09-12" } },
    similar,
    blurb,
    poster,
  };
}

const DESTS: Record<string, Destination> = {
  CUZ: dest("CUZ", "Cusco", "Perú", -13.53, -71.97, 3400, { sky: "#F7B7A3", sun: "#E5412D", far: "#2C3E55", near: "#0B1626", accent: "#FFD400", motif: "mountains" }, "Capital inca entre montañas.", ["AQP"]),
  SLA: dest("SLA", "Salta", "Argentina", -24.78, -65.41, 1187, { sky: "#BFE3E8", sun: "#FFD400", far: "#E5412D", near: "#A32A1E", accent: "#FFD400", motif: "mountains" }, "Valles y quebradas del noroeste.", ["CUZ"]),
  OAX: dest("OAX", "Oaxaca", "México", 17.07, -96.72, 1555, { sky: "#FFD400", sun: "#FFFFFF", far: "#2E8B6F", near: "#E5412D", accent: "#0B1626", motif: "hills" }, "Mercados, mezcal y cocina de siete moles.", ["MDE"]),
  MDE: dest("MDE", "Medellín", "Colombia", 6.25, -75.56, 1495, { sky: "#CFE8D6", sun: "#FFD400", far: "#2E8B6F", near: "#0B1626", accent: "#FFD400", motif: "hills" }, "Ciudad de eterna primavera.", ["OAX"]),
  FLN: dest("FLN", "Florianópolis", "Brasil", -27.6, -48.55, 5, { sky: "#D9ECF7", sun: "#E5412D", far: "#2C6FA3", near: "#0B1626", accent: "#FFFFFF", motif: "sea" }, "Isla de playas y senderos.", ["MDE"]),
  AQP: dest("AQP", "Arequipa", "Perú", -16.4, -71.54, 2335, { sky: "#F5D9A8", sun: "#D23A26", far: "#C9783A", near: "#0B1626", accent: "#FFD400", motif: "desert" }, "Ciudad blanca al pie del volcán.", ["CUZ"]),
};

/* ---------------------------- Puntajes --------------------------- */

type FactorSpec = Partial<Record<FactorKey, number | null>>;

function factors(values: FactorSpec, details: Partial<Record<FactorKey, string>> = {}): FactorResult[] {
  const present = FACTOR_KEYS.filter((k) => values[k] != null);
  const totalW = present.reduce((s, k) => s + BASE_WEIGHTS[k], 0) || 1;
  return FACTOR_KEYS.map((key) => {
    const value = values[key] ?? null;
    const [sourceName, observedAt] = SRC[key];
    return {
      key,
      label: FACTOR_LABELS[key],
      value,
      weight: value == null ? 0 : BASE_WEIGHTS[key] / totalW,
      quality: value == null ? 0 : 0.9,
      sourceName,
      observedAt: value == null ? null : observedAt,
      detail: details[key] ?? "",
    };
  });
}

function score(p: {
  id: string;
  score: number | null;
  rawScore: number;
  confidence: number;
  band: ConfidenceBand;
  confidenceReason: string;
  missing?: string[];
  values: FactorSpec;
  details?: Partial<Record<FactorKey, string>>;
  flight: number | null;
  stay: number | null;
  reason: string;
  opportunity?: boolean;
}): ScoreResult {
  return {
    destinationId: p.id,
    score: p.score,
    rawScore: p.rawScore,
    confidence: p.confidence,
    confidenceBand: p.band,
    confidenceReason: p.confidenceReason,
    missing: p.missing ?? [],
    factors: factors(p.values, p.details),
    cost: { flightUsd: p.flight, stayUsd: p.stay, totalUsd: p.flight != null && p.stay != null ? p.flight + p.stay : null },
    opportunity: p.opportunity ?? false,
    reason: p.reason,
    engineVersion: ENGINE_VERSION,
  };
}

const SCORES: Record<string, ScoreResult> = {
  CUZ: score({
    id: "CUZ", score: 84, rawScore: 84, confidence: 86, band: "normal",
    confidenceReason: "Alta porque los 8 factores tienen datos de los últimos 30 días. El precio del vuelo puede cambiar antes de comprar.",
    values: { precio: 88, experiencia: 92, clima: 78, temporada: 81, saturacion: 64, conectividad: 85, riesgo: 72, tendencia: 47 },
    details: { precio: "US$1.180 de US$1.500", clima: "Mayormente seco, 17 °C" },
    flight: 610, stay: 570, opportunity: true,
    reason: "Temporada seca, vuelo barato y ruinas sin filas antes de diciembre.",
  }),
  SLA: score({
    id: "SLA", score: 79, rawScore: 79, confidence: 78, band: "normal",
    confidenceReason: "Buena: casi todos los datos son recientes. Faltan cifras de tendencia más finas.",
    values: { precio: 94, experiencia: 81, clima: 86, temporada: 77, saturacion: 83, conectividad: 58, riesgo: 80, tendencia: 69 },
    flight: 420, stay: 470,
    reason: "Clima templado y paisajes de montaña; la más económica.",
  }),
  OAX: score({
    id: "OAX", score: 74, rawScore: 74, confidence: 70, band: "normal",
    confidenceReason: "Buena: los datos de precio y clima son de esta semana.",
    values: { precio: 61, experiencia: 90, clima: 80, temporada: 84, saturacion: 72, conectividad: 66, riesgo: 70, tendencia: 74 },
    flight: 780, stay: 640,
    reason: "Gran ajuste cultural y de comida; el vuelo pesa en el gasto.",
  }),
  MDE: score({
    id: "MDE", score: 71, rawScore: 71, confidence: 82, band: "normal",
    confidenceReason: "Alta: los 8 factores tienen datos recientes.",
    values: { precio: 68, experiencia: 76, clima: 88, temporada: 70, saturacion: 66, conectividad: 84, riesgo: 62, tendencia: 55 },
    flight: 640, stay: 610,
    reason: "Clima estable y buena conexión; los precios van al alza.",
  }),
  FLN: score({
    id: "FLN", score: null, rawScore: 66, confidence: 34, band: "limited",
    confidenceReason: "Baja: faltan los datos de precio y saturación para este mes.",
    missing: ["Precio de vuelos desde SCL", "Saturación turística"],
    values: { precio: null, experiencia: 82, clima: 74, temporada: 79, saturacion: null, conectividad: 70, riesgo: 68, tendencia: null },
    flight: null, stay: null,
    reason: "Faltan datos de precio y clima para este mes.",
  }),
  AQP: score({
    id: "AQP", score: 72, rawScore: 72, confidence: 76, band: "normal",
    confidenceReason: "Buena: datos recientes en la mayoría de los factores.",
    values: { precio: 92, experiencia: 78, clima: 84, temporada: 80, saturacion: 80, conectividad: 72, riesgo: 74, tendencia: 60 },
    flight: 560, stay: 480,
    reason: "Menos altitud y menos gente que Cusco.",
  }),
};

function verdictFor(id: string): DestinationCard["verdict"] {
  const texts: Record<string, string> = {
    CUZ: "Buen momento para ir. Noviembre cae antes de la temporada alta: clima mayormente seco, vuelos bajo el promedio y sitios clave sin filas largas.",
    SLA: "Una opción sólida y barata. Clima templado, paisajes de montaña y poca gente; la conexión aérea es menos frecuente.",
    OAX: "Excelente para cultura y comida. El vuelo es lo más caro del viaje, así que conviene reservar con fechas flexibles.",
    MDE: "Clima estable y buena conexión. Los precios van al alza, mejor decidir pronto.",
    FLN: "Todavía no hay datos suficientes para recomendarla este mes.",
    AQP: "Alternativa tranquila y de menor altitud.",
  };
  return {
    text: texts[id] ?? "Resumen generado desde el desglose.",
    aiGenerated: id === "CUZ" || id === "SLA",
    warning: id === "OAX" ? "El vuelo es el 55% del gasto." : null,
    model: id === "CUZ" || id === "SLA" ? "claude-sonnet-5-5" : null,
  };
}

function card(id: string): DestinationCard {
  const destination = DESTS[id];
  const result = SCORES[id];
  if (!destination || !result) throw new ApiError("DESTINO_NO_ENCONTRADO", `No existe el destino ${id}.`, 404);
  return { destination, result, verdict: verdictFor(id) };
}

/* ----------------------------- API mock -------------------------- */

export async function mockRecommendations(req: TripRequest): Promise<RecommendationsResponse> {
  await wait(1400);
  if (req.budgetUsd === 350) throw new ApiError("PRECIOS_TIMEOUT", "Tiempo de espera agotado.", 504);
  const requestId = `mock-${Date.now().toString(36)}`;
  const computedAt = new Date().toISOString();
  if (req.budgetUsd < 700) {
    return {
      requestId,
      request: req,
      top: [],
      computedAt,
      emptyHelp: {
        cheapest: { destinationId: "MDZ", name: "Mendoza", totalUsd: 780 } as never,
        suggestions: [
          { kind: "raise_budget", label: "Subir a US$900", request: { ...req, budgetUsd: 900 }, resultCount: 3 },
          { kind: "fewer_days", label: `Viajar 5 días en vez de ${req.days}`, request: { ...req, days: 5 }, resultCount: 2 },
          { kind: "flexible_dates", label: "Activar fechas flexibles", request: { ...req, flexibleDates: true }, resultCount: 1 },
        ],
      },
    };
  }
  return { requestId, request: req, top: ["CUZ", "SLA", "OAX", "MDE", "FLN"].map(card), emptyHelp: null, computedAt };
}

export async function mockDestination(id: string, q?: string): Promise<DestinationDetailResponse> {
  await wait(500);
  void decodeRequest(q);
  const c = card(id.toUpperCase());
  let reality: DestinationDetailResponse["reality"] = null;
  if (c.destination.id === "CUZ") {
    const alt = card("AQP");
    reality = {
      chosen: c.result,
      alternative: alt.result,
      alternativeDestination: alt.destination,
      facts: [],
      conclusion: "Arequipa cuesta US$140 menos.",
      rows: [
        { label: "Costo total", chosen: "US$1.180", alternative: "US$1.040", better: "alternative" },
        { label: "Altitud", chosen: "3.400 m", alternative: "2.335 m", better: "alternative" },
        { label: "Saturación", chosen: "64", alternative: "80", better: "alternative" },
        { label: "Experiencia", chosen: "92", alternative: "78", better: "chosen" },
      ],
      conclusionVerdict: {
        text: "Arequipa cuesta US$140 menos, tiene menos altitud y menos gente, pero no tiene Machu Picchu. Cusco gana si ese es el objetivo; si no, Arequipa es la opción más cómoda.",
        aiGenerated: true,
        warning: null,
        model: "claude-sonnet-5-5",
      },
    };
  }
  return { card: c, reality, sources: SOURCES };
}

export async function mockCompare(a: string, b: string, priority: ComparePriority, q?: string): Promise<CompareResponse> {
  await wait(450);
  void q;
  const ca = card(a.toUpperCase());
  const cb = card(b.toUpperCase());
  const rows = FACTOR_KEYS.filter((k) => ["precio", "experiencia", "clima", "saturacion", "conectividad", "tendencia"].includes(k)).map((key) => {
    const va = ca.result.factors.find((f) => f.key === key)?.value ?? null;
    const vb = cb.result.factors.find((f) => f.key === key)?.value ?? null;
    const winner: "a" | "b" | "tie" = va == null || vb == null || va === vb ? "tie" : va > vb ? "a" : "b";
    return { key, label: FACTOR_LABELS[key], a: va, b: vb, winner };
  });
  const focus = priority === "precio" ? "precio" : priority === "experiencia" ? "experiencia" : "saturacion";
  const fr = rows.find((r) => r.key === focus);
  const winner: "a" | "b" = fr && fr.winner === "b" ? "b" : "a";
  const w = winner === "a" ? ca : cb;
  const l = winner === "a" ? cb : ca;
  const label = priority === "precio" ? "precio" : priority === "experiencia" ? "experiencia" : "menos gente";
  const diff = Math.abs((ca.result.cost.totalUsd ?? 0) - (cb.result.cost.totalUsd ?? 0));
  return {
    a: ca.destination,
    b: cb.destination,
    compare: {
      a: ca.result,
      b: cb.result,
      rows,
      priority,
      winner,
      verdict: `Con prioridad en ${label} gana ${w.destination.name}: cuesta US$${diff} menos en total. ${l.destination.name} gana en otros factores, como se ve en la tabla.`,
    },
  };
}

export async function mockSurprise(req: TripRequest, exclude: string[]): Promise<SurpriseResponse> {
  await wait(900);
  void req;
  const pool = ["OAX", "MDE", "SLA", "AQP"].filter((id) => !exclude.includes(id));
  const id = pool[0];
  if (!id) return { card: null, warning: null };
  return {
    card: card(id),
    warning: id === "OAX" ? "Ojo con el vuelo. Es el 55% del gasto. Con fechas flexibles podrías bajar hasta US$150." : null,
  };
}

export async function mockGlobe(month: number): Promise<GlobeResponse> {
  await wait(300);
  const pts = (["CUZ", "SLA", "OAX", "MDE", "FLN"] as const).map((id) => {
    const d = DESTS[id];
    const s = SCORES[id];
    return {
      id,
      name: d.name,
      lat: d.lat,
      lon: d.lon,
      score: id === "FLN" ? 66 : s.score,
      band: (id === "FLN" ? "warning" : "normal") as ConfidenceBand,
    };
  });
  return { month, points: pts };
}

export async function mockClick(destinationId: string): Promise<ClickResponse> {
  await wait(200);
  return { url: `https://www.google.com/travel/flights?q=${encodeURIComponent(`vuelos a ${destinationId}`)}` };
}

export async function mockFeedback(body: FeedbackRequest): Promise<FeedbackResponse> {
  await wait(400);
  if (body.moment === "after" && body.expected) {
    const perCriterion = {} as Record<(typeof GAP_CRITERIA)[number], number>;
    let sum = 0;
    for (const k of GAP_CRITERIA) {
      perCriterion[k] = (body.ratings as GapRatings)[k] - body.expected[k];
      sum += perCriterion[k];
    }
    return { ok: true, gap: { gap: sum / GAP_CRITERIA.length, perCriterion }, destinationGap: null };
  }
  return { ok: true, gap: null, destinationGap: null };
}
