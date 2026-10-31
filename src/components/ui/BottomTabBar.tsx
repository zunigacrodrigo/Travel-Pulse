import Link from "next/link";
import { Bookmark, Compass, Sparkle, UserIcon, WifiOff } from "./Icons";

export type TabKey = "buscar" | "live" | "sorpresa" | "guardados" | "perfil";

const TABS: Array<{ key: TabKey; label: string; href: string; Icon: typeof Compass }> = [
  { key: "buscar", label: "Buscar", href: "/", Icon: Compass },
  { key: "live", label: "Pulso", href: "/live", Icon: WifiOff },
  { key: "sorpresa", label: "Sorpresa", href: "/sorpresa", Icon: Sparkle },
  { key: "guardados", label: "Guardados", href: "/guardados", Icon: Bookmark },
  { key: "perfil", label: "Mi DNA", href: "/perfil", Icon: UserIcon },
];

export function BottomTabBar({ active }: { active: TabKey }) {
  return (
    <nav
      aria-label="Principal"
      className="tabbar sticky bottom-0 z-30 mt-auto flex min-h-[72px] items-center justify-around bg-tabbar px-2 pb-[calc(env(safe-area-inset-bottom)+8px)] [border-top:1px_solid_var(--c-line)] dark:[border-top-color:transparent]"
    >
      {TABS.map(({ key, label, href, Icon }) => {
        const on = key === active;
        return (
          <Link
            key={key}
            href={href}
            aria-current={on ? "page" : undefined}
            className={`flex min-h-11 min-w-[64px] flex-col items-center justify-center gap-[3px] text-[12px] ${
              on ? "font-semibold text-signal" : "text-tab-idle"
            }`}
          >
            <Icon size={22} strokeWidth={2} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
