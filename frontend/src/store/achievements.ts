import { create } from "zustand";
import { api } from "../api/client";
import type { Achievement, AchievementsView } from "../api/types";
import { useCharacter } from "./character";
import { useWallet } from "./wallet";

interface AchievementsState {
  view: AchievementsView | null;
  /** Achievement id with a claim in flight. */
  busy: string | null;
  error: string | null;
  load: () => Promise<void>;
  claim: (id: string) => Promise<void>;
  clear: () => void;
}

export type AchievementFilter = "all" | "ready" | "locked" | "claimed";

/** Ready to claim first, then closest to done, then claimed. */
export function sortAchievements(list: Achievement[]): Achievement[] {
  const rank = (a: Achievement) => (a.claimed_at ? 2 : a.unlocked ? 0 : 1);
  return [...list].sort(
    (a, b) => rank(a) - rank(b) || b.progress / b.target - a.progress / a.target,
  );
}

export function filterAchievements(list: Achievement[], f: AchievementFilter): Achievement[] {
  switch (f) {
    case "ready":
      return list.filter((a) => a.unlocked && !a.claimed_at);
    case "locked":
      return list.filter((a) => !a.unlocked);
    case "claimed":
      return list.filter((a) => !!a.claimed_at);
    default:
      return list;
  }
}

export const useAchievements = create<AchievementsState>((set) => ({
  view: null,
  busy: null,
  error: null,

  async load() {
    try {
      set({ view: await api.achievements() });
    } catch {
      /* logged out or offline: keep the last known value */
    }
  },

  async claim(id) {
    set({ busy: id, error: null });
    try {
      const r = await api.claimAchievement(id);
      set({ view: r.achievements, busy: null });
      useWallet.getState().celebrate(r.granted);
      // The new title is now owned: refresh the wardrobe's copy.
      void useCharacter.getState().load();
    } catch (e) {
      set({ busy: null, error: e instanceof Error ? e.message : "claim failed" });
    }
  },

  clear() {
    set({ view: null, busy: null, error: null });
  },
}));
