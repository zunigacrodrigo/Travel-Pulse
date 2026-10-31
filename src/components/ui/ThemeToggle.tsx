"use client";

import { useEffect, useState } from "react";
import { applyTheme, currentTheme, type Theme } from "@/lib/client/theme";
import { Moon, Sun } from "./Icons";

/** Alterna claro/oscuro y lo guarda en localStorage ("tp-theme"). */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme(currentTheme());
  }, []);

  const next: Theme = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={() => {
        applyTheme(next);
        setTheme(next);
      }}
      aria-label={theme === null ? "Cambiar tema" : next === "dark" ? "Cambiar a modo oscuro" : "Cambiar a modo claro"}
      className="grid size-11 place-items-center rounded-full text-mid"
    >
      {theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
    </button>
  );
}
