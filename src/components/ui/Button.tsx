import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "outline" | "outlineBold" | "ink" | "panel" | "white" | "link";
export type ButtonSize = "lg" | "md" | "sm";

const BASE =
  "inline-flex select-none items-center justify-center gap-2 text-center transition-[transform,box-shadow,background-color] disabled:cursor-not-allowed disabled:opacity-50";

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    "bg-signal text-ink font-display font-extrabold shadow-[0_4px_0_var(--c-btn-shadow)] active:translate-y-[2px] active:shadow-[0_2px_0_var(--c-btn-shadow)]",
  outline: "border-2 border-outline bg-transparent text-fg font-semibold",
  outlineBold: "border-2 border-outline bg-page text-fg font-display font-extrabold",
  ink: "bg-ink text-signal font-display font-extrabold",
  panel: "panel bg-panel text-signal font-display font-extrabold",
  white: "bg-white text-ink border-2 border-ink font-display font-extrabold",
  link: "text-fg font-semibold underline underline-offset-2",
};

const SIZE: Record<ButtonSize, string> = {
  lg: "min-h-14 rounded-[14px] px-4 text-[17px]",
  md: "min-h-12 rounded-[14px] px-4 text-[15px]",
  sm: "min-h-11 rounded-xl px-3 text-[14px]",
};

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "lg", extra = ""): string {
  const sz = variant === "link" ? "min-h-11 text-[14px]" : SIZE[size];
  return `${BASE} ${VARIANT[variant]} ${sz} ${extra}`.trim();
}

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: ReactNode;
}

type LinkButtonProps = CommonProps & { href: string; download?: string; prefetch?: boolean } & Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    keyof CommonProps | "type"
  >;
type ActionButtonProps = CommonProps & { href?: undefined } & ButtonHTMLAttributes<HTMLButtonElement>;

export function Button(props: LinkButtonProps | ActionButtonProps) {
  const { variant = "primary", size = "lg", className = "", children } = props;
  const cls = buttonClass(variant, size, className);
  if (typeof props.href === "string") {
    const { href, download, prefetch } = props as LinkButtonProps;
    if (download !== undefined) {
      return (
        <a href={href} download={download} className={cls}>
          {children}
        </a>
      );
    }
    return (
      <Link href={href} prefetch={prefetch} className={cls}>
        {children}
      </Link>
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { variant: _v, size: _s, className: _c, children: _ch, href: _h, type = "button", ...rest } = props as ActionButtonProps;
  return (
    <button type={type} className={cls} {...rest}>
      {children}
    </button>
  );
}
