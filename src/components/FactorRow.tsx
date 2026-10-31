import type { FactorResult } from "@/lib/types";
import { formatDate } from "@/lib/client/format";

/** Una fila del desglose: factor, barra 0-100, valor, y debajo fuente y fecha del dato. */
export function FactorRow({ factor }: { factor: FactorResult }) {
  const { label, value, sourceName, observedAt, detail } = factor;
  const missing = value == null;
  const low = !missing && value < 50;
  const rounded = missing ? 0 : Math.round(value);
  return (
    <li>
      <div className="flex items-center gap-2.5 text-[14px]">
        <span className="flex-1">{label}</span>
        <div className="h-2.5 w-[120px] shrink-0 overflow-hidden rounded-[2px] bg-track" aria-hidden="true">
          <div
            className="h-full rounded-[2px]"
            style={{ width: `${rounded}%`, background: low ? "var(--c-stamp-fill)" : "var(--c-fill)" }}
          />
        </div>
        {missing ? (
          <b className="w-[58px] text-right text-[13px] font-semibold text-alert">Sin datos</b>
        ) : (
          <b
            className={`w-[26px] text-right font-display text-[16px] ${low ? "text-alert" : ""}`}
            aria-label={`${rounded} de 100${low ? ", bajo" : ""}`}
          >
            {rounded}
          </b>
        )}
      </div>
      <p className="mt-0.5 text-[11px] leading-[1.35] text-mid">
        {missing ? `${sourceName}: dato no disponible` : `${sourceName}, ${formatDate(observedAt)}`}
        {!missing && detail ? ` · ${detail}` : ""}
      </p>
    </li>
  );
}
