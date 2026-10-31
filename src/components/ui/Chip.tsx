import type { ButtonHTMLAttributes, ReactNode } from "react";

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
  selected: boolean;
  children: ReactNode;
  /** sm: chip del formulario (36 px + zona táctil de 44); md: 44 px. */
  size?: "sm" | "md";
  /** Para grupos de selección única (role="radio"). */
  radio?: boolean;
}

export function Chip({ selected, children, size = "sm", radio = false, className = "", ...rest }: Props) {
  const dims =
    size === "sm"
      ? "min-h-11 px-3.5 text-[13px]"
      : "min-h-11 px-4 text-[14px]";
  const tone = selected
    ? "bg-chip-on text-chip-on-fg font-semibold border-[1.5px] border-transparent"
    : "border-[1.5px] border-border text-fg font-medium";
  const aria = radio ? { role: "radio" as const, "aria-checked": selected } : { "aria-pressed": selected };
  return (
    <button
      type="button"
      {...aria}
      className={`relative inline-flex items-center justify-center rounded-full ${dims} ${tone} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
