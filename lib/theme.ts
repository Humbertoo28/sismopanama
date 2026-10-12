// Modo claro u oscuro. La persona elige «automático» (lo que pida su teléfono o computadora), «claro» u «oscuro»; la elección se
// guarda en el navegador. El tema resuelto va en <html data-theme="light|dark"> y el CSS (app/theme.css) hace el resto. El script
// de app/layout.tsx lo aplica antes de pintar, para que no haya un destello blanco al abrir de noche.

export type ThemeChoice = "auto" | "light" | "dark";
export const THEME_KEY = "sismo_panama_theme_v1";
const EVENT = "sismo-panama-theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

export function readThemeChoice(): ThemeChoice {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === "light" || value === "dark" ? value : "auto";
  } catch {
    return "auto";
  }
}

const resolve = (choice: ThemeChoice) => (choice === "auto" ? (window.matchMedia(DARK_QUERY).matches ? "dark" : "light") : choice);

export function applyTheme(choice: ThemeChoice = readThemeChoice()) {
  const root = document.documentElement;
  root.dataset.theme = resolve(choice);
  root.dataset.themeChoice = choice;
  // La barra del navegador del celular acompaña al tema.
  document.querySelectorAll('meta[name="theme-color"]').forEach(meta => meta.setAttribute("content", root.dataset.theme === "dark" ? "#0b1220" : "#ffffff"));
}

export function setThemeChoice(choice: ThemeChoice) {
  try {
    if (choice === "auto") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, choice);
  } catch {
    // Sin almacenamiento vale solo para esta visita.
  }
  applyTheme(choice);
  window.dispatchEvent(new Event(EVENT));
}

// Para useSyncExternalStore: avisa al cambiar la elección o, en «automático», el tema del sistema.
export function subscribeTheme(changed: () => void) {
  const media = window.matchMedia(DARK_QUERY);
  const onSystem = () => {
    if (readThemeChoice() === "auto") applyTheme("auto");
    changed();
  };
  window.addEventListener(EVENT, changed);
  media.addEventListener("change", onSystem);
  return () => {
    window.removeEventListener(EVENT, changed);
    media.removeEventListener("change", onSystem);
  };
}

export const getResolvedTheme = () => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");
export const getThemeChoice = () => (document.documentElement.dataset.themeChoice as ThemeChoice | undefined) ?? "auto";
