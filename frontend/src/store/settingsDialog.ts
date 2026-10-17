import { create } from "zustand";

/** Global open/close state so any screen (nav, hub, games) can open settings. */
export const useSettingsDialog = create<{ open: boolean; setOpen: (o: boolean) => void }>(
  (set) => ({ open: false, setOpen: (open) => set({ open }) }),
);
