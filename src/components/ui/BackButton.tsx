import Link from "next/link";
import { ChevronLeft } from "./Icons";

interface Props {
  href: string;
  label?: string;
  /** "signal": círculo Ink con flecha Signal (pantalla de sorpresa). */
  tone?: "surface" | "ink" | "glass";
}

export function BackButton({ href, label = "Volver", tone = "surface" }: Props) {
  const toneCls =
    tone === "ink" ? "bg-ink text-signal" : "bg-surface text-fg";
  return (
    <Link
      href={href}
      aria-label={label}
      className={`grid size-11 shrink-0 place-items-center rounded-full ${toneCls}`}
    >
      <ChevronLeft size={18} />
    </Link>
  );
}
