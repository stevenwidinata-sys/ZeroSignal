import { create } from "zustand";

/** Seconds per turn; 0 = timer off. */
export type TurnTimer = 0 | 10 | 20 | 30;
export const TIMER_OPTIONS: TurnTimer[] = [0, 10, 20, 30];

/** Base text size: small, medium (default), large, extra large. */
export type TextSize = "s" | "m" | "l" | "xl";
export const TEXT_SIZES: TextSize[] = ["s", "m", "l", "xl"];

export interface Settings {
  sound: boolean;
  /** 0..1 */
  volume: number;
  /** Background music (separate from sound effects). */
  music: boolean;
  /** 0..1 */
  musicVolume: number;
  /** Fewer animations/effects for slow devices. */
  lightGraphics: boolean;
  /** Color-safe palette + shapes so players never rely on color alone. */
  colorblind: boolean;
  turnTimer: TurnTimer;
  /** Board shakes on bombs and other big hits. */
  screenShake: boolean;
  /** Turn off animations (also follows the device's own setting). */
  reducedMotion: boolean;
  textSize: TextSize;
  /** Ask before leaving a page while a round is in progress. */
  confirmLeave: boolean;
  /** Short vibrations on phones (hits, flags). */
  vibration: boolean;
  /** 0..1: menu clicks, separate from game sound effects. */
  uiVolume: number;
  /** Pop-ups: daily login reward, level-up celebration, reward toasts. */
  dailyLoginPopup: boolean;
  levelUpPopup: boolean;
  rewardToasts: boolean;
  /** Stronger contrast: plain black/white surfaces and bright borders. */
  highContrast: boolean;
  /** Replace the pixel font with a plain, easy-to-read one. */
  readableFont: boolean;
  /** Frames-per-second counter in the corner. */
  showFps: boolean;
  /** Global shortcut keys: M mute, F fullscreen. */
  shortcuts: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  sound: true,
  volume: 0.6,
  music: true,
  musicVolume: 0.4,
  lightGraphics: false,
  colorblind: false,
  turnTimer: 0,
  screenShake: true,
  reducedMotion: false,
  textSize: "m",
  confirmLeave: true,
  vibration: true,
  uiVolume: 0.5,
  dailyLoginPopup: true,
  levelUpPopup: true,
  rewardToasts: true,
  highContrast: false,
  readableFont: false,
  showFps: false,
  shortcuts: true,
};

const KEY = "zerosignal_settings";

const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);

const unit = (v: unknown, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;

/** Parse stored JSON defensively: unknown/invalid fields fall back to defaults. */
export function parseSettings(raw: string | null): Settings {
  if (!raw) return { ...DEFAULT_SETTINGS };
  try {
    const v = JSON.parse(raw) as Partial<Settings>;
    return {
      sound: typeof v.sound === "boolean" ? v.sound : DEFAULT_SETTINGS.sound,
      volume: unit(v.volume, DEFAULT_SETTINGS.volume),
      music: typeof v.music === "boolean" ? v.music : DEFAULT_SETTINGS.music,
      musicVolume: unit(v.musicVolume, DEFAULT_SETTINGS.musicVolume),
      lightGraphics:
        typeof v.lightGraphics === "boolean" ? v.lightGraphics : DEFAULT_SETTINGS.lightGraphics,
      colorblind: typeof v.colorblind === "boolean" ? v.colorblind : DEFAULT_SETTINGS.colorblind,
      turnTimer: TIMER_OPTIONS.includes(v.turnTimer as TurnTimer)
        ? (v.turnTimer as TurnTimer)
        : DEFAULT_SETTINGS.turnTimer,
      screenShake: bool(v.screenShake, DEFAULT_SETTINGS.screenShake),
      reducedMotion: bool(v.reducedMotion, DEFAULT_SETTINGS.reducedMotion),
      textSize: TEXT_SIZES.includes(v.textSize as TextSize) ? (v.textSize as TextSize) : DEFAULT_SETTINGS.textSize,
      confirmLeave: bool(v.confirmLeave, DEFAULT_SETTINGS.confirmLeave),
      vibration: bool(v.vibration, DEFAULT_SETTINGS.vibration),
      uiVolume: unit(v.uiVolume, DEFAULT_SETTINGS.uiVolume),
      dailyLoginPopup: bool(v.dailyLoginPopup, DEFAULT_SETTINGS.dailyLoginPopup),
      levelUpPopup: bool(v.levelUpPopup, DEFAULT_SETTINGS.levelUpPopup),
      rewardToasts: bool(v.rewardToasts, DEFAULT_SETTINGS.rewardToasts),
      highContrast: bool(v.highContrast, DEFAULT_SETTINGS.highContrast),
      readableFont: bool(v.readableFont, DEFAULT_SETTINGS.readableFont),
      showFps: bool(v.showFps, DEFAULT_SETTINGS.showFps),
      shortcuts: bool(v.shortcuts, DEFAULT_SETTINGS.shortcuts),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** Only the saved fields, in a fixed order (drops the store's functions). */
export function pick(s: Settings): Settings {
  const out = {} as Record<keyof Settings, unknown>;
  for (const k of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) out[k] = s[k];
  return out as unknown as Settings;
}

function load(): Settings {
  try {
    return parseSettings(localStorage.getItem(KEY));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function applyGraphics(s: Settings) {
  if (typeof document !== "undefined") {
    document.documentElement.dataset.graphics = s.lightGraphics ? "light" : "full";
    document.documentElement.dataset.colorblind = s.colorblind ? "on" : "off";
    document.documentElement.dataset.shake = s.screenShake ? "on" : "off";
    document.documentElement.dataset.motion = s.reducedMotion ? "reduced" : "full";
    document.documentElement.dataset.text = s.textSize;
    document.documentElement.dataset.contrast = s.highContrast ? "high" : "normal";
    document.documentElement.dataset.font = s.readableFont ? "readable" : "pixel";
  }
}

interface SettingsState extends Settings {
  update: (patch: Partial<Settings>) => void;
  reset: () => void;
  /** Replace everything (settings loaded from your account). */
  replace: (raw: unknown) => void;
}

export const useSettings = create<SettingsState>((set, get) => {
  const initial = load();
  applyGraphics(initial);

  function persist(next: Settings) {
    applyGraphics(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* storage may be blocked */
    }
  }

  return {
    ...initial,
    update(patch) {
      // Re-validate the merged settings (drops the store's functions too).
      const merged = { ...get(), ...patch };
      const next = parseSettings(JSON.stringify(pick(merged)));
      persist(next);
      set(next);
    },
    reset() {
      persist(DEFAULT_SETTINGS);
      set({ ...DEFAULT_SETTINGS });
    },
    replace(raw) {
      const next = parseSettings(JSON.stringify(raw ?? {}));
      persist(next);
      set(next);
    },
  };
});

/** A short buzz on phones, if the player allows it. */
export function vibrate(ms: number | number[]): void {
  if (!useSettings.getState().vibration) return;
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* not supported */
  }
}
