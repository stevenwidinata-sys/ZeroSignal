import { create } from "zustand";
import { findTheme, schemeOf, themeCss, type Scheme } from "../platform/themes";

/** A theme id from `THEMES` ("dark" = Neon Arcade, "light" = Daylight, ...). */
export type Theme = string;

const KEY = "arcade_theme";

function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem(KEY);
    if (findTheme(saved)) return saved as Theme;
  } catch {
    /* storage may be blocked */
  }
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

/** Add every theme's color rules to the page once. */
function injectThemes() {
  if (typeof document === "undefined" || document.getElementById("zs-themes")) return;
  const style = document.createElement("style");
  style.id = "zs-themes";
  style.textContent = themeCss();
  document.head.appendChild(style);
}

function apply(theme: Theme) {
  const scheme = schemeOf(theme);
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.scheme = scheme;
  document.documentElement.style.colorScheme = scheme;
}

interface ThemeState {
  theme: Theme;
  /** Light or dark family of the current theme. */
  scheme: Scheme;
  /** Flip to the same mood's light/dark partner. */
  toggle: () => void;
  set: (theme: Theme) => void;
}

export const useTheme = create<ThemeState>((set, get) => {
  injectThemes();
  const theme = initialTheme();
  apply(theme);
  return {
    theme,
    scheme: schemeOf(theme),
    toggle() {
      get().set(findTheme(get().theme)?.pair ?? "dark");
    },
    set(next) {
      if (!findTheme(next)) return;
      apply(next);
      try {
        localStorage.setItem(KEY, next);
      } catch {
        /* ignore */
      }
      set({ theme: next, scheme: schemeOf(next) });
    },
  };
});
