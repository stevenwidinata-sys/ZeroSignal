import { create } from "zustand";

/** Seconds per turn; 0 = timer off. */
export type TurnTimer = 0 | 10 | 20 | 30;
export const TIMER_OPTIONS: TurnTimer[] = [0, 10, 20, 30];

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
  turnTimer: TurnTimer;
}

export const DEFAULT_SETTINGS: Settings = {
  sound: true,
  volume: 0.6,
  music: true,
  musicVolume: 0.4,
  lightGraphics: false,
  turnTimer: 0,
};

const KEY = "zerosignal_settings";

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
      turnTimer: TIMER_OPTIONS.includes(v.turnTimer as TurnTimer)
        ? (v.turnTimer as TurnTimer)
        : DEFAULT_SETTINGS.turnTimer,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function load(): Settings {
  try {
    return parseSettings(localStorage.getItem(KEY));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function applyGraphics(light: boolean) {
  if (typeof document !== "undefined") {
    document.documentElement.dataset.graphics = light ? "light" : "full";
  }
}

interface SettingsState extends Settings {
  update: (patch: Partial<Settings>) => void;
  reset: () => void;
}

export const useSettings = create<SettingsState>((set, get) => {
  const initial = load();
  applyGraphics(initial.lightGraphics);

  function persist(next: Settings) {
    applyGraphics(next.lightGraphics);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* storage may be blocked */
    }
  }

  return {
    ...initial,
    update(patch) {
      const { sound, volume, music, musicVolume, lightGraphics, turnTimer } = { ...get(), ...patch };
      const next = parseSettings(
        JSON.stringify({ sound, volume, music, musicVolume, lightGraphics, turnTimer }),
      );
      persist(next);
      set(next);
    },
    reset() {
      persist(DEFAULT_SETTINGS);
      set({ ...DEFAULT_SETTINGS });
    },
  };
});
