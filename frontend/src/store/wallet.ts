import { create } from "zustand";
import { api } from "../api/client";
import type { Granted, Wallet } from "../api/types";
import { playSfx } from "../platform/sound";
import { useSettings } from "./settings";

interface WalletState {
  wallet: Wallet | null;
  /** Latest reward to show in the pop-up (null = hidden). */
  toast: Granted | null;
  refresh: () => Promise<void>;
  /** Show a server-paid reward and refresh balances. */
  celebrate: (g: Granted | null | undefined) => void;
  dismiss: () => void;
  clear: () => void;
}

/**
 * What the reward pop-up should show, given the pop-up settings: level-ups
 * follow "level-up pop-up", everything else "reward toasts". Null = nothing.
 */
export function toastFor(
  g: Granted,
  s: { levelUpPopup: boolean; rewardToasts: boolean },
): Granted | null {
  const leveled = g.level_after > g.level_before;
  if (leveled && s.levelUpPopup) return g;
  if (!s.rewardToasts) return null;
  // Level-up pop-up off: show it as a plain reward toast.
  return leveled ? { ...g, level_after: g.level_before } : g;
}

/** True when a grant paid or withheld anything worth showing. */
export function isWorthShowing(g: Granted | null | undefined): g is Granted {
  return !!g && (g.coins > 0 || g.tokens > 0 || g.xp > 0 || g.coins_capped > 0);
}

export const useWallet = create<WalletState>((set, get) => ({
  wallet: null,
  toast: null,

  async refresh() {
    try {
      set({ wallet: await api.wallet() });
    } catch {
      /* logged out or offline: keep the last known value */
    }
  },

  celebrate(g) {
    if (!isWorthShowing(g)) return;
    void get().refresh();
    const shown = toastFor(g, useSettings.getState());
    if (!shown) return;
    set({ toast: shown });
    window.setTimeout(() => playSfx(shown.level_after > shown.level_before ? "reward" : "click"), 250);
  },

  dismiss() {
    set({ toast: null });
  },

  clear() {
    set({ wallet: null, toast: null });
  },
}));
