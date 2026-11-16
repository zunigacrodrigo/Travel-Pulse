/**
 * Consejos prácticos de la guía de Wikivoyage (texto de voluntarios, CC BY-SA 4.0). Se cita tal cual, con enlace y atribución:
 * Travel Pulse no lo verificó. Se guarda en memoria 24 h (la guía cambia poco y Wikivoyage limita el ritmo de peticiones).
 */
import { fetchJson, type FetchOptions } from "@/lib/sources/http";

export interface GuideTip { id: "movilidad" | "seguridad" | "comer" | "respetar"; title: string; text: string; /** Idioma del texto citado: si no hay en español se usa la guía en inglés y se avisa. */ lang: "es" | "en" }
export interface Guide { cityKey: string; pageTitle: string; pageUrl: string; license: string; tips: GuideTip[]; fetchedAt: string; stale: boolean }

const WANTED: { id: GuideTip["id"]; title: string; heading: RegExp }[] = [
  { id: "movilidad", title: "Cómo moverse", heading: /^(desplazarse|moverse|c[oó]mo desplazarse|get around)$/i },
  { id: "seguridad", title: "Seguridad", heading: /^(seguridad|stay safe)$/i },
  { id: "comer", title: "Comer", heading: /^(comer|eat)$/i },
  { id: "respetar", title: "Respetar las costumbres", heading: /^(respetar|respect)$/i },
];

export const WIKIVOYAGE_TITLES: Record<string, { es: string; en: string }> = {
  "sao-paulo-br": { es: "São Paulo", en: "São Paulo" },
  "santiago-cl": { es: "Santiago de Chile", en: "Santiago (Chile)" },
  "valparaiso-cl": { es: "Valparaíso", en: "Valparaíso" },
  "antofagasta-cl": { es: "Antofagasta", en: "Antofagasta" },
};

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Secciones de nivel 2 (`== Título ==`); el texto incluye las subsecciones sin sus encabezados. */
export function parseSections(extract: string): { heading: string; body: string }[] {
  const out: { heading: string; body: string }[] = [];
  let cur: { heading: string; lines: string[] } | null = null;
  for (const line of extract.split("\n")) {
    const m = /^(=+)\s*([^=]+?)\s*=+\s*$/.exec(line.trim());
    if (m && m[1]!.length === 2) { if (cur) out.push({ heading: cur.heading, body: cur.lines.join("\n") }); cur = { heading: m[2]!, lines: [] }; }
    else if (m) continue;
    else if (cur) cur.lines.push(line);
  }
  if (cur) out.push({ heading: cur.heading, body: cur.lines.join("\n") });
  return out;
}

/** Primeras frases completas hasta ~max caracteres, sin cortar a media palabra. */
export function excerpt(body: string, max = 600): string {
  const text = body.replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("; "), cut.lastIndexOf(": "));
  return (end > max * 0.4 ? cut.slice(0, end + 1) : cut.slice(0, cut.lastIndexOf(" "))).trim() + (end > max * 0.4 ? "" : "…");
}

export function extractTips(raw: unknown, lang: "es" | "en" = "es"): GuideTip[] {
  if (!isRecord(raw) || !isRecord(raw.query) || !isRecord(raw.query.pages)) return [];
  const page = Object.values(raw.query.pages)[0];
  if (!isRecord(page) || typeof page.extract !== "string" || page.missing !== undefined) return [];
  const sections = parseSections(page.extract);
  const tips: GuideTip[] = [];
  for (const w of WANTED) {
    const s = sections.find((x) => w.heading.test(x.heading));
    const text = s ? excerpt(s.body) : "";
    if (text.length >= 40) tips.push({ id: w.id, title: w.title, text, lang });
  }
  return tips;
}

const TTL_MS = 24 * 3_600_000;
const cache = new Map<string, Guide>();
export function _clearGuideCacheForTests() { cache.clear(); }

async function pageTips(base: string, lang: "es" | "en", title: string, rest: FetchOptions): Promise<GuideTip[]> {
  const q = new URLSearchParams({ action: "query", prop: "extracts", explaintext: "1", format: "json", redirects: "1", titles: title });
  return extractTips(await fetchJson(`${base}/w/api.php?${q}`, { timeoutMs: 8000, ...rest }), lang);
}

/** `base` permite apuntar a un espejo en pruebas; el idioma se antepone: `https://{lang}.wikivoyage.org`. */
export async function fetchGuide(cityKey: string, now: Date, opts: FetchOptions & { base?: (lang: "es" | "en") => string } = {}): Promise<Guide | null> {
  const t = WIKIVOYAGE_TITLES[cityKey];
  if (!t) return null;
  const hit = cache.get(cityKey);
  if (hit && now.getTime() - Date.parse(hit.fetchedAt) < TTL_MS) return { ...hit, stale: false };
  const { base = (l: "es" | "en") => `https://${l}.wikivoyage.org`, ...rest } = opts;
  try {
    const tips = await pageTips(base("es"), "es", t.es, rest);
    // Lo esencial (seguridad) a veces está vacío en la guía en español: se completa con la inglesa y se marca.
    if (!tips.some((x) => x.id === "seguridad")) {
      try { tips.push(...(await pageTips(base("en"), "en", t.en, rest)).filter((x) => x.id === "seguridad")); } catch { /* el respaldo es opcional */ }
    }
    const order = WANTED.map((w) => w.id);
    tips.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    const g: Guide = { cityKey, pageTitle: t.es, pageUrl: `https://es.wikivoyage.org/wiki/${encodeURIComponent(t.es.replace(/ /g, "_"))}`, license: "CC BY-SA 4.0", tips, fetchedAt: now.toISOString(), stale: false };
    if (tips.length) cache.set(cityKey, g);
    return g;
  } catch (e) {
    // Si la fuente nos limita o falla, servimos la última copia (marcada como vieja) antes que nada.
    if (hit) return { ...hit, stale: true };
    throw e;
  }
}
