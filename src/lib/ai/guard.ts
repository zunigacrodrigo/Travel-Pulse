/**
 * Guardas deterministas para texto generado por IA (corren antes del revisor crítico y también
 * cuando éste no está disponible):
 *  - toda cifra del texto debe aparecer en los hechos (tolera 1180 / 1.180 / US$1.180, %, km, m…)
 *  - lenguaje de seguridad absoluta o discriminatorio
 *  - límite de palabras
 */

/** Convierte un token numérico ("1.180", "1,180", "12,5", "3.5", "1.180,50") en número. */
export function parseNumberToken(tok: string): number | null {
  if (!/^\d+(?:[.,]\d+)*$/.test(tok)) return null;
  if (!/[.,]/.test(tok)) return Number(tok);

  const hasDot = tok.includes(".");
  const hasComma = tok.includes(",");
  if (hasDot && hasComma) {
    // El último separador es el decimal; el otro agrupa miles.
    const dec = tok.lastIndexOf(".") > tok.lastIndexOf(",") ? "." : ",";
    const grp = dec === "." ? "," : ".";
    const n = Number(tok.split(grp).join("").replace(dec, "."));
    return Number.isFinite(n) ? n : null;
  }

  const sep = hasDot ? "." : ",";
  const parts = tok.split(sep);
  if (parts.length > 2) {
    // 1.180.000 -> miles; si algún grupo no tiene 3 dígitos no es un número bien formado.
    const ok = parts.slice(1).every((p) => p.length === 3) && parts[0].length <= 3;
    return ok ? Number(parts.join("")) : null;
  }
  const [intPart, frac] = parts;
  if (frac.length === 3 && intPart.length >= 1 && intPart.length <= 3 && intPart !== "0") {
    return Number(intPart + frac); // 1.180 -> 1180
  }
  return Number(`${intPart}.${frac}`); // 12,5 -> 12.5
}

const NUMBER_RE = /\d+(?:[.,]\d+)*/g;

export interface ExtractedNumber {
  raw: string;
  value: number | null;
}

export function extractNumbers(text: string): ExtractedNumber[] {
  const out: ExtractedNumber[] = [];
  for (const m of text.matchAll(NUMBER_RE)) {
    out.push({ raw: m[0], value: parseNumberToken(m[0]) });
  }
  return out;
}

export interface NumberCheck {
  ok: boolean;
  /** Cifras del texto que no aparecen en los hechos. */
  unmatched: string[];
}

/** Verifica que cada cifra de `text` aparezca (en cualquier formato) en `facts`. */
export function checkNumbers(text: string, facts: readonly string[]): NumberCheck {
  const allowed: number[] = [];
  for (const f of facts) for (const n of extractNumbers(f)) if (n.value !== null) allowed.push(n.value);
  const unmatched: string[] = [];
  for (const n of extractNumbers(text)) {
    const hit = n.value !== null && allowed.some((a) => Math.abs(a - (n.value as number)) < 1e-9);
    if (!hit) unmatched.push(n.raw);
  }
  return { ok: unmatched.length === 0, unmatched };
}

/* ---- Lenguaje inseguro ---- */

export function normalizeEs(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

const UNSAFE_PATTERNS: RegExp[] = [
  /\b(?:100\s*%|cien por ciento)\s+(?:seguro|safe)/,
  /\b(?:totalmente|completamente|absolutamente|enteramente|plenamente)\s+(?:seguro|segura|tranquilo|tranquila)\b/,
  /\b(?:sin|cero)\s+(?:ningun\s+)?(?:riesgo|peligro)s?\b/,
  /\briesgo\s+cero\b/,
  /\blibre\s+de\s+(?:riesgo|peligro)s?\b/,
  /\bgarantiza(?:do|da|dos|das|mos|n)?\b/,
  /\bno\s+(?:hay|existe|existen)\s+(?:ningun\s+)?(?:riesgo|peligro)s?\b/,
  /\bnada\s+(?:puede|va\s+a)\s+(?:salir\s+mal|pasar)/,
  /\bno\s+te\s+va\s+a\s+pasar\s+nada\b/,
  /\bzonas?\s+rojas?\b/,
  /\bbarrios?\s+(?:peligros\w*|malos?|bajos?|marginales?|conflictiv\w*|pobres?)\b/,
  /\bgente\s+(?:peligrosa|de\s+mal|sospechosa|conflictiva)\b/,
  /\b(?:los|las)\s+\w+\s+son\s+(?:ladrones|ladronas|peligros\w*|violent\w*|flojos|flojas|sucios|sucias|agresiv\w*)\b/,
];

export function hasUnsafeLanguage(text: string): boolean {
  const t = normalizeEs(text);
  return UNSAFE_PATTERNS.some((re) => re.test(t));
}

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Limpia comillas/espacios que los modelos suelen añadir. */
export function cleanText(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["“”«»']+|["“”«»']+$/g, "")
    .trim();
}

export interface GuardResult {
  ok: boolean;
  reason: "ok" | "number_mismatch" | "unsafe_language" | "empty";
  unmatched: string[];
}

/** Pre-chequeo determinista completo (cifras + lenguaje inseguro). */
export function guardText(text: string, facts: readonly string[]): GuardResult {
  if (!text.trim()) return { ok: false, reason: "empty", unmatched: [] };
  if (hasUnsafeLanguage(text)) return { ok: false, reason: "unsafe_language", unmatched: [] };
  const nums = checkNumbers(text, facts);
  if (!nums.ok) return { ok: false, reason: "number_mismatch", unmatched: nums.unmatched };
  return { ok: true, reason: "ok", unmatched: [] };
}
