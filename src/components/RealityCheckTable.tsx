import type { RealityRow } from "@/lib/types";
import { Check, Warning } from "./ui/Icons";

interface Props {
  chosenName: string;
  alternativeName: string;
  rows: RealityRow[];
  conclusion: string;
  /** Texto bajo la conclusión (p. ej. aviso del revisor). */
  note?: string | null;
}

function Cell({ better, children }: { better: boolean; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex h-7 w-[92px] items-center justify-center gap-1 rounded-md font-display text-[14px] font-extrabold ${
        better ? "bg-signal text-ink" : ""
      }`}
    >
      {better ? (
        <>
          <Check size={11} />
          <span className="sr-only">Mejor: </span>
        </>
      ) : null}
      {children}
    </span>
  );
}

/** Reality Check: destino elegido frente a una alternativa similar, con el mejor valor resaltado. */
export function RealityCheckTable({ chosenName, alternativeName, rows, conclusion, note }: Props) {
  return (
    <section aria-labelledby="reality-title" className="overflow-hidden rounded-2xl bg-surface">
      <div className="bg-stamp px-4 py-3 text-white">
        <h2 id="reality-title" className="flex items-center gap-2.5 font-display text-[18px] font-extrabold">
          <Warning size={20} />
          Reality Check
        </h2>
        <p className="mt-0.5 text-[13px]">
          {chosenName} frente a una alternativa similar: {alternativeName}
        </p>
      </div>
      <div className="px-4 py-1.5">
        <table className="w-full border-collapse text-[14px]">
          <thead>
            <tr className="text-[12px] text-mid">
              <th scope="col" className="py-1.5 text-left font-normal">
                <span className="sr-only">Factor</span>
              </th>
              <th scope="col" className="w-[92px] py-1.5 text-center font-semibold">
                {chosenName}
              </th>
              <th scope="col" className="w-[92px] py-1.5 text-center font-semibold">
                {alternativeName}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.label} className={i < rows.length - 1 ? "border-b border-line" : ""}>
                <th scope="row" className="h-[42px] text-left font-normal">
                  {row.label}
                </th>
                <td className="text-center">
                  <Cell better={row.better === "chosen"}>{row.chosen}</Cell>
                </td>
                <td className="text-center">
                  <Cell better={row.better === "alternative"}>{row.alternative}</Cell>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-4 pb-4 pt-1.5 text-[14px] leading-[1.55]">{conclusion}</p>
      {note ? <p className="px-4 pb-4 text-[12px] text-mid">{note}</p> : null}
    </section>
  );
}
