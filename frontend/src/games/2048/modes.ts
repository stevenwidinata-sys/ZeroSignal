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
