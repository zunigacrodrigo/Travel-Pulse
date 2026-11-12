/** Navegación única de la app: los mismos 4 destinos en móvil y escritorio (docs/DISENO_PRODUCTO.md §3.3). */
export type NavKey = "inicio" | "viaje" | "pulso" | "yo";

export interface NavItem { key: NavKey; label: string; href: string; /** Prefijos de ruta que pertenecen a este destino. */ owns: readonly string[] }

export const NAV: readonly NavItem[] = [
  { key: "inicio", label: "Inicio", href: "/", owns: ["/resultados", "/sorpresa", "/destino", "/comparar", "/ciudad"] },
  { key: "viaje", label: "Mi viaje", href: "/dia", owns: ["/dia", "/trip-twin", "/importar", "/verificar"] },
  { key: "pulso", label: "Pulso", href: "/radar", owns: ["/radar", "/live"] },
  { key: "yo", label: "Yo", href: "/perfil", owns: ["/perfil", "/guardados", "/cuenta"] },
];

/** Qué destino está activo para una ruta. `/` es solo Inicio; el resto se decide por prefijo. */
export function activeNav(pathname: string): NavKey {
  if (pathname === "/") return "inicio";
  const hit = NAV.find((n) => n.owns.some((p) => pathname === p || pathname.startsWith(`${p}/`)));
  return hit?.key ?? "inicio";
}
