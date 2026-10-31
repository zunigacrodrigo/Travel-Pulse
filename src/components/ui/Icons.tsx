import type { ReactNode } from "react";

interface IconProps {
  size?: number;
  strokeWidth?: number;
  className?: string;
  filled?: boolean;
}

function Svg({
  size = 18,
  strokeWidth = 2.2,
  className,
  children,
  fill = "none",
}: IconProps & { children: ReactNode; fill?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {children}
    </svg>
  );
}

export const ChevronLeft = (p: IconProps) => (
  <Svg {...p}>
    <path d="M15 6l-6 6 6 6" />
  </Svg>
);
export const ChevronDown = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 9l6 6 6-6" />
  </Svg>
);
export const Bookmark = (p: IconProps) => (
  <Svg {...p} fill={p.filled ? "currentColor" : "none"}>
    <path d="M6 3h12v18l-6-4-6 4z" />
  </Svg>
);
export const Compass = (p: IconProps) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 2}>
    <circle cx="12" cy="12" r="9" />
    <path d="M15.5 8.5l-2 5-5 2 2-5z" />
  </Svg>
);
export const Sparkle = (p: IconProps) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 2}>
    <path d="M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2z" />
  </Svg>
);
export const Share = (p: IconProps) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 2.4}>
    <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v14" />
  </Svg>
);
export const Warning = (p: IconProps) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 2.4}>
    <path d="M12 3l10 18H2z" />
    <path d="M12 10v5M12 18h.01" />
  </Svg>
);
export const WifiOff = (p: IconProps) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 2.4}>
    <path d="M2 8.5a15 15 0 0 1 20 0M5 12a10 10 0 0 1 14 0M8.5 15.5a5 5 0 0 1 7 0M12 19h.01M3 3l18 18" />
  </Svg>
);
export const Refresh = (p: IconProps) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 2.6}>
    <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />
  </Svg>
);
export const Check = (p: IconProps) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 3}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Svg>
);
export const Plus = (p: IconProps) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 2.4}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);
export const Minus = (p: IconProps) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 2.4}>
    <path d="M5 12h14" />
  </Svg>
);
export const Download = (p: IconProps) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 2.2}>
    <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
  </Svg>
);
export const LinkIcon = (p: IconProps) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 2.2}>
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
  </Svg>
);
export const Sun = (p: IconProps) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 2}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Svg>
);
export const Moon = (p: IconProps) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 2}>
    <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
  </Svg>
);
