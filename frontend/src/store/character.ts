import { create } from "zustand";
import { api } from "../api/client";
import type { CharacterView } from "../api/types";
import { useWallet } from "./wallet";

interface CharacterState {
  view: CharacterView | null;
  loading: boolean;
  load: () => Promise<void>;
  /** Store a fresh server view (and sync the wallet chip). */
  set: (v: CharacterView) => void;
  clear: () => void;
}

export const useCharacter = create<CharacterState>((set, get) => ({
  view: null,
  loading: false,

  async load() {
    if (get().loading) return;
    set({ loading: true });
    try {
      get().set(await api.character());
    } catch {
      /* logged out or offline */
    } finally {
      set({ loading: false });
    }
  },

  set(v) {
    set({ view: v });
    useWallet.setState({ wallet: v.wallet });
  },

  clear() {
    set({ view: null });
  },
}));
