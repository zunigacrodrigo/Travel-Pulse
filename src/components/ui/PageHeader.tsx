import type { ReactNode } from "react";
import { BackButton } from "./BackButton";

interface Props {
  backHref: string;
  title: string;
  subtitle?: string;
  right?: ReactNode;
}

/** Cabecera de pantalla: botón volver + título (h1) + subtítulo con los datos de la búsqueda. */
export function PageHeader({ backHref, title, subtitle, right }: Props) {
  return (
    <header className="flex items-center gap-3 px-5 pt-[calc(env(safe-area-inset-top)+20px)] pb-4">
      <BackButton href={backHref} />
      <div className="min-w-0 flex-1">
        <h1 className="font-display text-[19px] font-extrabold leading-[1.1]">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-[12px] text-mid">{subtitle}</p> : null}
      </div>
      {right}
    </header>
  );
}
