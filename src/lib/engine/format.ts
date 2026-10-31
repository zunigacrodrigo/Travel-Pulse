/**
 * Formateadores compartidos en español (Chile neutro).
 * Sección 4, "Reglas de contenido": los números salen del motor y se muestran
 * con punto como separador de miles y coma decimal.
 */

const THOUSANDS_SEPARATOR = ".";
const DECIMAL_SEPARATOR = ",";
const USD_PREFIX = "US$";

/**
 * Número con separador de miles "." y decimales ",".
 * @example num(4.5, 1) === "4,5"; num(12345) === "12.345"
 */
export function num(value: number, decimals = 0): string {
  if (!Number.isFinite(value)) return "–";
  const fixed = Math.abs(value).toFixed(decimals);
  const [intPart, decPart] = fixed.split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, THOUSANDS_SEPARATOR);
  const sign = value < 0 && Number(fixed) !== 0 ? "-" : "";
  return decPart ? `${sign}${grouped}${DECIMAL_SEPARATOR}${decPart}` : `${sign}${grouped}`;
}

/**
 * Monto en dólares redondeado al entero.
 * @example usd(1180) === "US$1.180"
 */
export function usd(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? "-" : "";
  return `${sign}${USD_PREFIX}${num(Math.abs(rounded))}`;
}

/** Porcentaje entero. @example pct(55) === "55%" */
export function pct(value: number, decimals = 0): string {
  return `${num(value, decimals)}%`;
}

/** Porcentaje con signo explícito. @example signedPct(-8) === "-8%"; signedPct(15) === "+15%" */
export function signedPct(value: number): string {
  const rounded = Math.round(value);
  if (rounded > 0) return `+${num(rounded)}%`;
  return pct(rounded);
}

/** Altura en metros. @example meters(3400) === "3.400 m" */
export function meters(value: number): string {
  return `${num(Math.round(value))} m`;
}

/** Une una lista en español: "a", "a y b", "a, b y c". */
export function joinEs(items: readonly string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

/** Primera letra en mayúscula. */
export function capitalize(text: string): string {
  return text.length === 0 ? text : text[0].toLocaleUpperCase("es") + text.slice(1);
}

/** Primera letra en minúscula (para insertar etiquetas en una frase). */
export function lowerFirst(text: string): string {
  return text.length === 0 ? text : text[0].toLocaleLowerCase("es") + text.slice(1);
}
