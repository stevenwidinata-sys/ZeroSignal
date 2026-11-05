/**
 * Colorblind-friendly mode: one switch (Settings) that swaps to the
 * Okabe-Ito palette, which people with any common color vision deficiency
 * can tell apart, and adds shapes so no game relies on color alone.
 */
import { useSettings } from "../store/settings";

/** Okabe-Ito colors (body + darker rim). */
export const SAFE = {
  vermillion: { color: "#D55E00", rim: "#8a3c00" },
  blue: { color: "#0072B2", rim: "#004a75" },
  bluishGreen: { color: "#009E73", rim: "#006b4e" },
  reddishPurple: { color: "#CC79A7", rim: "#8e4f73" },
  yellow: { color: "#F0E442", rim: "#a89d1e" },
} as const;

/** Plain-color Connect Four skins get a safe color; themed skins keep their art. */
const SKIN_SAFE: Record<string, { color: string; rim: string }> = {
  red: SAFE.vermillion,
  blue: SAFE.blue,
  green: SAFE.bluishGreen,
  purple: SAFE.reddishPurple,
  golden: SAFE.yellow,
};

export function safeSkin(id: string): { color: string; rim: string } | null {
  return SKIN_SAFE[id] ?? null;
}

/** Tic-Tac-Toe X / O colors in colorblind mode. */
export const SAFE_X = SAFE.vermillion.color;
export const SAFE_O = SAFE.blue.color;

/** Shape shown on each player's pieces: player 1 = circle, player 2 = cross. */
export type Mark = 1 | 2;
export const MARK_LABEL: Record<Mark, string> = { 1: "circle", 2: "cross" };

export function useColorblind(): boolean {
  return useSettings((s) => s.colorblind);
}
