import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Aviso de afiliado bajo los botones. */
  note?: ReactNode;
}

/** Barra fija inferior (sticky) con la acción principal y la etiqueta de enlace de afiliado. */
export function AffiliateBar({ children, note }: Props) {
  return (
    <div className="sticky bottom-0 z-20 mt-auto bg-[linear-gradient(180deg,transparent,var(--c-page)_32%)] px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-10">
      <div className="flex gap-2.5">{children}</div>
      {note ? <p className="mt-2 text-center text-[11px] leading-[1.4] text-mid">{note}</p> : null}
    </div>
  );
}
