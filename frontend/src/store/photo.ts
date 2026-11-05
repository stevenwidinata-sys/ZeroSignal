import { create } from "zustand";
import { photo } from "../api/client";

/**
 * Your private photo, fetched with your login and kept as an in-memory
 * object URL (never a public link). Cleared on sign-out.
 */
interface PhotoState {
  url: string | null;
  loaded: boolean;
  load: () => Promise<void>;
  save: (image: Blob) => Promise<void>;
  remove: () => Promise<void>;
  clear: () => void;
}

export const usePhoto = create<PhotoState>((set, get) => {
  function replace(blob: Blob | null) {
    const old = get().url;
    if (old) URL.revokeObjectURL(old);
    set({ url: blob ? URL.createObjectURL(blob) : null, loaded: true });
  }

  return {
    url: null,
    loaded: false,

    async load() {
      try {
        replace(await photo.get());
      } catch {
        set({ loaded: true });
      }
    },

    async save(image) {
      await photo.put(image);
      replace(image);
    },

    async remove() {
      await photo.remove();
      replace(null);
    },

    clear() {
      replace(null);
      set({ loaded: false });
    },
  };
});
