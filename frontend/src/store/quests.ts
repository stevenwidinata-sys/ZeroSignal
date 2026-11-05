import { create } from "zustand";
import { api } from "../api/client";
import type { QuestsView } from "../api/types";
import { useWallet } from "./wallet";

interface QuestsState {
  view: QuestsView | null;
  /** Slot with a request in flight (disables its buttons). */
  busy: number | null;
  error: string | null;
  load: () => Promise<void>;
  claim: (slot: number) => Promise<void>;
  reroll: (slot: number) => Promise<void>;
  clear: () => void;
}

/** Finished quests waiting for the Claim button (nav badge count). */
export function readyCount(view: QuestsView | null): number {
  return view ? view.quests.filter((q) => q.done && !q.claimed).length : 0;
}

/** A quest can be rerolled once per day, only while still unfinished. */
export function canReroll(view: QuestsView, slot: number): boolean {
  const q = view.quests.find((x) => x.slot === slot);
  return !!q && view.reroll_available && !q.done && !q.claimed;
}

const message = (e: unknown) => (e instanceof Error ? e.message : "something went wrong");

export const useQuests = create<QuestsState>((set) => ({
  view: null,
  busy: null,
  error: null,

  async load() {
    try {
      set({ view: await api.quests() });
    } catch {
      /* logged out or offline: keep the last known value */
    }
  },

  async claim(slot) {
    set({ busy: slot, error: null });
    try {
      const r = await api.claimQuest(slot);
      set({ view: r.quests, busy: null });
      useWallet.getState().celebrate(r.granted);
    } catch (e) {
      set({ busy: null, error: message(e) });
    }
  },

  async reroll(slot) {
    set({ busy: slot, error: null });
    try {
      set({ view: await api.rerollQuest(slot), busy: null });
    } catch (e) {
      set({ busy: null, error: message(e) });
    }
  },

  clear() {
    set({ view: null, busy: null, error: null });
  },
}));
