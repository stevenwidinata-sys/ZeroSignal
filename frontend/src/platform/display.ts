import { useEffect, useState } from "react";
import { create } from "zustand";
import { useSettings } from "../store/settings";

// ---------------------------------------------------------------------------
// Fullscreen
// ---------------------------------------------------------------------------

export function isFullscreen(): boolean {
  return typeof document !== "undefined" && !!document.fullscreenElement;
}

export function canFullscreen(): boolean {
  return typeof document !== "undefined" && !!document.documentElement.requestFullscreen;
}

export async function toggleFullscreen(): Promise<void> {
  try {
    if (isFullscreen()) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    /* refused (e.g. not from a user action) */
  }
}

/** Live fullscreen state (also changes when the player presses Esc or F11). */
export function useFullscreen(): boolean {
  const [on, setOn] = useState(isFullscreen);
  useEffect(() => {
    const sync = () => setOn(isFullscreen());
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  return on;
}

// ---------------------------------------------------------------------------
// Mute all (M)
// ---------------------------------------------------------------------------

let before: { sound: boolean; music: boolean } | null = null;

/** Mute sound + music, or bring back what was on before. Returns muted. */
export function toggleMuteAll(): boolean {
  const s = useSettings.getState();
  if (s.sound || s.music) {
    before = { sound: s.sound, music: s.music };
    s.update({ sound: false, music: false });
    return true;
  }
  s.update(before ?? { sound: true, music: true });
  before = null;
  return false;
}

// ---------------------------------------------------------------------------
// Shortcut keys
// ---------------------------------------------------------------------------

/** Short message after a shortcut ("Muted"). */
export const useFlash = create<{ text: string | null; at: number; show: (t: string) => void }>((set) => ({
  text: null,
  at: 0,
  show: (text) => set({ text, at: Date.now() }),
}));

/** Typing in a form field never triggers shortcuts. */
export function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el?.tagName) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

type ShortcutEvent = Pick<KeyboardEvent, "code" | "ctrlKey" | "metaKey" | "altKey" | "repeat" | "defaultPrevented">;

/** What a key press does, if anything (checked after the game had its turn). */
export function shortcutFor(e: ShortcutEvent): "mute" | "fullscreen" | null {
  if (e.defaultPrevented || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return null;
  if (e.code === "KeyM") return "mute";
  if (e.code === "KeyF") return "fullscreen";
  return null;
}

/**
 * M = mute all, F = fullscreen. Games that use a key call preventDefault,
 * so the shortcut steps aside (e.g. F flags in Minefield).
 */
export function useShortcuts() {
  const enabled = useSettings((s) => s.shortcuts);
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      // Wait until every other listener (the game) has seen the key. The
      // browser still counts this as the key press, so fullscreen is allowed.
      window.setTimeout(() => {
        const action = shortcutFor(e);
        if (action === "mute") useFlash.getState().show(toggleMuteAll() ? "🔇 Muted (M)" : "🔊 Sound on (M)");
        if (action === "fullscreen" && canFullscreen()) void toggleFullscreen();
      }, 0);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}

// ---------------------------------------------------------------------------
// FPS
// ---------------------------------------------------------------------------

/** Frames per second, measured over half-second windows. */
export function useFps(active: boolean): number | null {
  const [fps, setFps] = useState<number | null>(null);
  useEffect(() => {
    if (!active) {
      setFps(null);
      return;
    }
    let frames = 0;
    let start = performance.now();
    let id = requestAnimationFrame(function tick(t) {
      frames += 1;
      if (t - start >= 500) {
        setFps(Math.round((frames * 1000) / (t - start)));
        frames = 0;
        start = t;
      }
      id = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(id);
  }, [active]);
  return fps;
}
