import { create } from "zustand";

export type Theme = "light" | "dark";

const KEY = "arcade_theme";

function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* storage may be blocked */
  }
  return window.matchMedia?.("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

function apply(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

interface ThemeState {
  theme: Theme;
  toggle: () => void;
  set: (theme: Theme) => void;
}

export const useTheme = create<ThemeState>((set, get) => {
  const theme = initialTheme();
  apply(theme);
  return {
    theme,
    toggle() {
      get().set(get().theme === "dark" ? "light" : "dark");
    },
    set(next) {
      if (next !== "light" && next !== "dark") return;
      apply(next);
      try {
        localStorage.setItem(KEY, next);
      } catch {
        /* ignore */
      }
      set({ theme: next });
    },
  };
});
