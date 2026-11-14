import type { G2048Mode } from "../../api/types";

export const MODE_INFO: Record<G2048Mode, { icon: string; name: string; blurb: string }> = {
  classic: { icon: "🔢", name: "Classic", blurb: "The original 4×4 board." },
  big: { icon: "🟦", name: "Big", blurb: "5×5: more room, longer games. Points ×0.8." },
  tiny: { icon: "🔸", name: "Tiny", blurb: "3×3: every move counts. Points ×2." },
  daily: { icon: "📅", name: "Daily", blurb: "Same tiles for everyone today. One try, no undo." },
};

const PREFS_KEY = "zerosignal_2048_mode";

export function loadMode(): G2048Mode {
  try {
    const v = localStorage.getItem(PREFS_KEY);
    return v && v in MODE_INFO ? (v as G2048Mode) : "classic";
  } catch {
    return "classic";
  }
}

export function saveMode(m: G2048Mode) {
  try {
    localStorage.setItem(PREFS_KEY, m);
  } catch {
    /* storage may be blocked */
  }
}

const TIME_KEY = (runId: string) => `zerosignal_2048_time_${runId}`;

/** Time played on a run in this browser (survives reloads). */
export function loadPlayTime(runId: string): number {
  try {
    return Number(localStorage.getItem(TIME_KEY(runId))) || 0;
  } catch {
    return 0;
  }
}

export function savePlayTime(runId: string, ms: number) {
  try {
    localStorage.setItem(TIME_KEY(runId), String(Math.round(ms)));
  } catch {
    /* ignore */
  }
}

export function clearPlayTime(runId: string) {
  try {
    localStorage.removeItem(TIME_KEY(runId));
  } catch {
    /* ignore */
  }
}

/** Tile looks (all free, cosmetic only). */
export const TILE_STYLES = [
  { id: "classic", name: "Classic", swatch: ["#eee4da", "#f59563", "#edc22e"] },
  { id: "pastel", name: "Pastel", swatch: ["#e3f2fd", "#f8bbd0", "#c5e1a5"] },
  { id: "neon", name: "Neon", swatch: ["#00e5ff", "#ff2a6d", "#f9f002"] },
  { id: "mono", name: "Mono", swatch: ["#f2f2f2", "#8a8a8a", "#1a1a1a"] },
] as const;
export type TileStyle = (typeof TILE_STYLES)[number]["id"];

const STYLE_KEY = "zerosignal_2048_tiles";

export function loadTileStyle(): TileStyle {
  try {
    const v = localStorage.getItem(STYLE_KEY);
    return TILE_STYLES.some((t) => t.id === v) ? (v as TileStyle) : "classic";
  } catch {
    return "classic";
  }
}

export function saveTileStyle(id: TileStyle) {
  try {
    localStorage.setItem(STYLE_KEY, id);
  } catch {
    /* storage may be blocked */
  }
}
