import { create } from "zustand";
import { api } from "../api/client";
import type { Granted, Wallet } from "../api/types";
import { playSfx } from "../platform/sound";

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
    set({ toast: g });
    window.setTimeout(() => playSfx(g.level_after > g.level_before ? "reward" : "click"), 250);
    void get().refresh();
  },

  dismiss() {
    set({ toast: null });
  },

  clear() {
    set({ wallet: null, toast: null });
  },
}));
