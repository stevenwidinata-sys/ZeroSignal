/**
 * Mood themes. Each theme sets the same color tokens the whole site uses
 * (`--bg`, `--surface`, `--ink`, ...), so every page and game follows. The
 * CSS rules are generated from this data (`themeCss`), which also lets the
 * tests check text contrast. Themes come in light/dark pairs of one mood, so
 * the quick 🌙/☀️ button flips to the partner.
 */

export type Scheme = "dark" | "light";

export interface ThemeTokens {
  bg: string;
  bg2: string;
  surface: string;
  surface2: string;
  ink: string;
  muted: string;
  line: string;
  grid: string;
  scan: string;
  onYellow: string;
  onBlue: string;
  onGreen: string;
  errorBg: string;
  /** Accents (default: the arcade yellow / green / blue / red). */
  yellow?: string;
  green?: string;
  blue?: string;
  red?: string;
}

export interface ThemeDef {
  id: string;
  name: string;
  mood: string;
  scheme: Scheme;
  /** The same mood's other scheme (for the 🌙/☀️ button). */
  pair: string;
  tokens: ThemeTokens;
}

export const DEFAULT_ACCENTS = { yellow: "#ffd23f", green: "#3bce7a", blue: "#3a86ff", red: "#ff5a5f" };

export const THEMES: ThemeDef[] = [
  {
    id: "dark",
    name: "Neon Arcade",
    mood: "Classic late-night arcade",
    scheme: "dark",
    pair: "light",
    tokens: {
      bg: "#0b0e1f",
      bg2: "#121735",
      surface: "#181e45",
      surface2: "#212a5c",
      ink: "#f5f7ff",
      muted: "#a9b1d6",
      line: "#03040c",
      grid: "rgba(58, 134, 255, 0.08)",
      scan: "rgba(0, 0, 0, 0.18)",
      onYellow: "#141936",
      onBlue: "#ffffff",
      onGreen: "#0b2416",
      errorBg: "#3a1020",
    },
  },
  {
    id: "light",
    name: "Daylight",
    mood: "Bright and cheerful",
    scheme: "light",
    pair: "dark",
    tokens: {
      bg: "#fff7e0",
      bg2: "#ffeec2",
      surface: "#ffffff",
      surface2: "#f3f6ff",
      ink: "#141936",
      muted: "#4b5279",
      line: "#141936",
      grid: "rgba(20, 25, 54, 0.07)",
      scan: "transparent",
      onYellow: "#141936",
      onBlue: "#ffffff",
      onGreen: "#0b2416",
      errorBg: "#ffe3e4",
    },
  },
  {
    id: "sunset",
    name: "Sunset Chill",
    mood: "Warm, slow evening",
    scheme: "dark",
    pair: "sakura",
    tokens: {
      bg: "#1f1029",
      bg2: "#2a1433",
      surface: "#34183d",
      surface2: "#452050",
      ink: "#fff4ea",
      muted: "#e5bfc9",
      line: "#0d0510",
      grid: "rgba(255, 140, 90, 0.08)",
      scan: "rgba(0, 0, 0, 0.18)",
      onYellow: "#2a1433",
      onBlue: "#1f1029",
      onGreen: "#1f1029",
      errorBg: "#4a1626",
      yellow: "#ffb347",
      blue: "#ff8fab",
      green: "#7ee0a1",
    },
  },
  {
    id: "sakura",
    name: "Sakura",
    mood: "Soft cherry blossom",
    scheme: "light",
    pair: "sunset",
    tokens: {
      bg: "#fff1f4",
      bg2: "#ffe1e8",
      surface: "#ffffff",
      surface2: "#fff5f7",
      ink: "#3a1f2b",
      muted: "#7a4a5c",
      line: "#3a1f2b",
      grid: "rgba(220, 90, 130, 0.08)",
      scan: "transparent",
      onYellow: "#3a1f2b",
      onBlue: "#ffffff",
      onGreen: "#163024",
      errorBg: "#ffe0e6",
      yellow: "#ffb3c7",
      blue: "#b8336a",
      green: "#6fcf97",
    },
  },
  {
    id: "ocean",
    name: "Ocean Calm",
    mood: "Cool, relaxed and breezy",
    scheme: "light",
    pair: "midnight",
    tokens: {
      bg: "#eaf6fb",
      bg2: "#d6eef7",
      surface: "#ffffff",
      surface2: "#f2f9fc",
      ink: "#0f2a3a",
      muted: "#3f6274",
      line: "#0f2a3a",
      grid: "rgba(30, 130, 180, 0.08)",
      scan: "transparent",
      onYellow: "#0f2a3a",
      onBlue: "#ffffff",
      onGreen: "#0b2a20",
      errorBg: "#ffe3e4",
      yellow: "#8fd9ee",
      blue: "#1d6fa5",
      green: "#3fc79a",
    },
  },
  {
    id: "midnight",
    name: "Midnight Focus",
    mood: "Calm and focused, easy on the eyes",
    scheme: "dark",
    pair: "ocean",
    tokens: {
      bg: "#070b16",
      bg2: "#0c1324",
      surface: "#111a30",
      surface2: "#18233f",
      ink: "#e8eefc",
      muted: "#a3b3d6",
      line: "#000000",
      grid: "rgba(120, 150, 255, 0.06)",
      scan: "rgba(0, 0, 0, 0.2)",
      onYellow: "#0c1324",
      onBlue: "#070b16",
      onGreen: "#07160f",
      errorBg: "#33121c",
      yellow: "#f2d76b",
      blue: "#7aa7ff",
    },
  },
  {
    id: "forest",
    name: "Forest",
    mood: "Quiet woods, grounded",
    scheme: "dark",
    pair: "gameboy",
    tokens: {
      bg: "#0d1a12",
      bg2: "#12241a",
      surface: "#173022",
      surface2: "#1f3d2c",
      ink: "#eef7ee",
      muted: "#a9c9b0",
      line: "#040a06",
      grid: "rgba(120, 220, 140, 0.07)",
      scan: "rgba(0, 0, 0, 0.18)",
      onYellow: "#12241a",
      onBlue: "#0d1a12",
      onGreen: "#0d1a12",
      errorBg: "#3a1a14",
      yellow: "#e9d66b",
      green: "#6fd28a",
      blue: "#7cc4ff",
    },
  },
  {
    id: "gameboy",
    name: "Game Boy Green",
    mood: "Pocket console nostalgia",
    scheme: "light",
    pair: "forest",
    tokens: {
      bg: "#cadc9f",
      bg2: "#bccf8a",
      surface: "#d9e8b0",
      surface2: "#c2d48c",
      ink: "#0f380f",
      muted: "#2b5329",
      line: "#0f380f",
      grid: "rgba(15, 56, 15, 0.08)",
      scan: "transparent",
      onYellow: "#0f380f",
      onBlue: "#e0f0c0",
      onGreen: "#e0f0c0",
      errorBg: "#e9c9b0",
      yellow: "#9bbc0f",
      green: "#306230",
      blue: "#306230",
      red: "#8b2e16",
    },
  },
  {
    id: "cyberpunk",
    name: "Cyberpunk",
    mood: "Loud neon city, full energy",
    scheme: "dark",
    pair: "candy",
    tokens: {
      bg: "#0a0614",
      bg2: "#120a24",
      surface: "#1a0f33",
      surface2: "#251548",
      ink: "#f4f0ff",
      muted: "#bba9e3",
      line: "#000000",
      grid: "rgba(255, 0, 170, 0.10)",
      scan: "rgba(0, 0, 0, 0.25)",
      onYellow: "#0a0614",
      onBlue: "#0a0614",
      onGreen: "#0a0614",
      errorBg: "#3d0a2a",
      yellow: "#f9f002",
      blue: "#00e5ff",
      green: "#05ffa1",
      red: "#ff2a6d",
    },
  },
  {
    id: "candy",
    name: "Candy Pop",
    mood: "Sweet, playful and happy",
    scheme: "light",
    pair: "cyberpunk",
    tokens: {
      bg: "#fff7fd",
      bg2: "#fde7f7",
      surface: "#ffffff",
      surface2: "#f7f0ff",
      ink: "#2d1b46",
      muted: "#64487f",
      line: "#2d1b46",
      grid: "rgba(180, 90, 255, 0.08)",
      scan: "transparent",
      onYellow: "#2d1b46",
      onBlue: "#ffffff",
      onGreen: "#12302a",
      errorBg: "#ffe0ec",
      yellow: "#ffe066",
      blue: "#6c3cf0",
      green: "#2bd9a6",
      red: "#f2386b",
    },
  },
];

export function findTheme(id: unknown): ThemeDef | undefined {
  return THEMES.find((t) => t.id === id);
}

export function schemeOf(id: string): Scheme {
  return findTheme(id)?.scheme ?? "dark";
}

/** The CSS custom properties for one theme. */
export function themeVars(t: ThemeDef): Record<string, string> {
  const k = t.tokens;
  const accents = { ...DEFAULT_ACCENTS, ...Object.fromEntries(Object.entries({ yellow: k.yellow, green: k.green, blue: k.blue, red: k.red }).filter(([, v]) => v)) };
  return {
    "--bg": k.bg,
    "--bg-2": k.bg2,
    "--surface": k.surface,
    "--surface-2": k.surface2,
    "--ink": k.ink,
    "--muted": k.muted,
    "--line": k.line,
    "--grid": k.grid,
    "--scan": k.scan,
    "--on-yellow": k.onYellow,
    "--on-blue": k.onBlue,
    "--on-green": k.onGreen,
    "--error-bg": k.errorBg,
    "--yellow": accents.yellow,
    "--green": accents.green,
    "--blue": accents.blue,
    "--red": accents.red,
  };
}

/** One `[data-theme="id"] { ... }` rule per theme. */
export function themeCss(themes: ThemeDef[] = THEMES): string {
  return themes
    .map((t) => {
      const body = Object.entries(themeVars(t))
        .map(([k, v]) => `  ${k}: ${v};`)
        .join("\n");
      return `[data-theme="${t.id}"] {\n${body}\n}`;
    })
    .join("\n");
}

// ---------------------------------------------------------------------------
// Contrast (WCAG), used by tests and the picker.
// ---------------------------------------------------------------------------

function luminance(hex: string): number {
  const n = parseInt(hex.replace("#", ""), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/** Contrast ratio between two #rrggbb colors (1–21). */
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
