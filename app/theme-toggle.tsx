"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { getResolvedTheme, setThemeChoice, subscribeTheme } from "../lib/theme";

// Botón del encabezado para pasar de claro a oscuro y al revés (la opción «automático» está en el panel de accesibilidad).
export default function ThemeToggle() {
  const theme = useSyncExternalStore(subscribeTheme, getResolvedTheme, () => "light");
  const dark = theme === "dark";
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={() => setThemeChoice(dark ? "light" : "dark")}
      aria-label={dark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      title={dark ? "Modo claro" : "Modo oscuro"}
    >
      {dark ? <Sun aria-hidden="true" size={20} /> : <Moon aria-hidden="true" size={20} />}
    </button>
  );
}
