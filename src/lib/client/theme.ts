export type Theme = "light" | "dark";
export const THEME_KEY = "tp-theme";

export function currentTheme(): Theme {
  const attr = document.documentElement.dataset.theme;
  if (attr === "light" || attr === "dark") return attr;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* ignorar */
  }
  // La barra del navegador debe coincidir con la elección manual.
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    m.removeAttribute("media");
    m.setAttribute("content", theme === "dark" ? "#0B1626" : "#E8EDF1");
  });
}
