import { useEffect } from "react";
import { create } from "zustand";
import { api } from "../api/client";
import type { Privacy } from "../api/types";
import { pick, useSettings } from "../store/settings";
import { useTheme, type Theme } from "../store/theme";
import { findTheme } from "./themes";

/**
 * Settings follow a registered player to every device: on login the
 * account's saved settings replace the browser's (or, the first time, the
 * browser's are uploaded), and later changes are saved after a short pause.
 * Guests keep settings in the browser only.
 */
const SAVE_DELAY_MS = 800;

/** What gets saved: every setting plus the theme. */
export function snapshot(): Record<string, unknown> {
  return { ...pick(useSettings.getState()), theme: useTheme.getState().theme };
}

/** Apply settings loaded from the account. */
export function applyRemote(remote: Record<string, unknown>) {
  useSettings.getState().replace(remote);
  const theme = remote.theme;
  if (findTheme(theme)) useTheme.getState().set(theme as Theme);
}

interface SyncState {
  status: "off" | "loading" | "synced" | "saving" | "error";
  privacy: Privacy | null;
  setPrivacy: (p: Privacy) => void;
}

export const useSync = create<SyncState>((set) => ({
  status: "off",
  privacy: null,
  setPrivacy: (privacy) => set({ privacy }),
}));

/** Keep settings in sync while `member` is signed in. */
export function useSettingsSync(member: boolean) {
  useEffect(() => {
    if (!member) {
      useSync.setState({ status: "off", privacy: null });
      return;
    }
    let cancelled = false;
    let ready = false;
    let timer: number | undefined;
    useSync.setState({ status: "loading" });

    const save = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        useSync.setState({ status: "saving" });
        api
          .saveSettings(snapshot())
          .then(() => !cancelled && useSync.setState({ status: "synced" }))
          .catch(() => !cancelled && useSync.setState({ status: "error" }));
      }, SAVE_DELAY_MS);
    };

    api
      .prefs()
      .then((p) => {
        if (cancelled) return;
        if (p.settings) applyRemote(p.settings);
        else save(); // first time on this account: upload this browser's settings
        useSync.setState({ status: "synced", privacy: p.privacy });
        ready = true;
      })
      .catch(() => !cancelled && useSync.setState({ status: "error" }));

    const unsubSettings = useSettings.subscribe(() => ready && save());
    const unsubTheme = useTheme.subscribe(() => ready && save());
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      unsubSettings();
      unsubTheme();
    };
  }, [member]);
}
