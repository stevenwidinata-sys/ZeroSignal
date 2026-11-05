import { create } from "zustand";
import { api } from "../api/client";
import type { LoginStatus } from "../api/types";
import { useWallet } from "./wallet";

interface DailyLoginState {
  status: LoginStatus | null;
  /** Closed without claiming: stay hidden until the next page load. */
  dismissed: boolean;
  claiming: boolean;
  error: string | null;
  load: () => Promise<void>;
  claim: () => Promise<void>;
  dismiss: () => void;
  clear: () => void;
}

/** Show the claim pop-up only when today's reward is still waiting. */
export function shouldPrompt(status: LoginStatus | null, dismissed: boolean): boolean {
  return !!status && !status.claimed_today && !dismissed;
}

export const useDailyLogin = create<DailyLoginState>((set) => ({
  status: null,
  dismissed: false,
  claiming: false,
  error: null,

  async load() {
    try {
      set({ status: await api.dailyLogin() });
    } catch {
      /* logged out or offline: no pop-up */
    }
  },

  async claim() {
    set({ claiming: true, error: null });
    try {
      const r = await api.claimDailyLogin();
      set({ status: r.status, claiming: false });
      useWallet.getState().celebrate(r.granted);
    } catch (e) {
      set({ claiming: false, error: e instanceof Error ? e.message : "claim failed" });
      // Maybe claimed in another tab: resync.
      try {
        set({ status: await api.dailyLogin() });
      } catch {
        /* ignore */
      }
    }
  },

  dismiss() {
    set({ dismissed: true });
  },

  clear() {
    set({ status: null, dismissed: false, claiming: false, error: null });
  },
}));
