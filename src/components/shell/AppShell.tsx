"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Calendar, Compass, UserIcon, WifiOff } from "../ui/Icons";
import { activeNav, NAV, type NavKey } from "./nav";

const ICON: Record<NavKey, typeof Compass> = { inicio: Compass, viaje: Calendar, pulso: WifiOff, yo: UserIcon };

/**
 * Única carcasa de la app: riel lateral desde 1024 px y barra inferior debajo. Ninguna pantalla trae su propia
 * navegación. El contenido ocupa el ancho disponible (sin marco de teléfono en escritorio).
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const active = activeNav(usePathname() ?? "/");
  return (
    <div className="min-h-dvh bg-page text-fg lg:grid lg:grid-cols-[216px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-surface/40 p-5 lg:flex" aria-label="Principal">
        <Link href="/" className="font-display text-lg font-extrabold">Travel <span className="text-signal">Pulse</span></Link>
        <nav className="mt-8 flex flex-col gap-1" aria-label="Principal">
          {NAV.map((n) => {
            const Icon = ICON[n.key];
            const on = n.key === active;
            return (
              <Link key={n.key} href={n.href} aria-current={on ? "page" : undefined} className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-[14px] ${on ? "bg-signal/15 font-bold text-signal" : "text-fg2 hover:bg-surface"}`}>
                <Icon size={20} strokeWidth={2} />{n.label}
              </Link>
            );
          })}
        </nav>
        <p className="mt-auto text-[12px] leading-4 text-mid">Datos reales de OpenStreetMap, Open-Meteo y fuentes oficiales. Lo que no se sabe, se dice.</p>
      </aside>
      <div className="flex min-h-dvh min-w-0 flex-col">
        <div className="flex flex-1 flex-col">{children}</div>
        <nav aria-label="Principal" className="tabbar sticky bottom-0 z-30 flex min-h-[64px] items-center justify-around border-t border-line bg-tabbar px-2 pb-[calc(env(safe-area-inset-bottom)+6px)] lg:hidden">
          {NAV.map((n) => {
            const Icon = ICON[n.key];
            const on = n.key === active;
            return (
              <Link key={n.key} href={n.href} aria-current={on ? "page" : undefined} className={`flex min-h-12 min-w-[64px] flex-col items-center justify-center gap-[3px] text-[12px] ${on ? "font-semibold text-signal" : "text-tab-idle"}`}>
                <Icon size={22} strokeWidth={2} />{n.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
