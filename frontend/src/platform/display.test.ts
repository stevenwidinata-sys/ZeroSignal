import { describe, expect, it } from "vitest";
import { useSettings } from "../store/settings";
import { isTyping, shortcutFor, toggleMuteAll } from "./display";
import { KEYMAPS, keyLabel } from "./keymap";

const key = (code: string, extra: Partial<KeyboardEvent> = {}) =>
  ({ code, ctrlKey: false, metaKey: false, altKey: false, repeat: false, defaultPrevented: false, ...extra }) as KeyboardEvent;

describe("shortcut keys", () => {
  it("M mutes, F toggles fullscreen, unless a game used the key", () => {
    expect(shortcutFor(key("KeyM"))).toBe("mute");
    expect(shortcutFor(key("KeyF"))).toBe("fullscreen");
    expect(shortcutFor(key("KeyF", { defaultPrevented: true }))).toBeNull();
    expect(shortcutFor(key("KeyM", { ctrlKey: true }))).toBeNull();
    expect(shortcutFor(key("KeyQ"))).toBeNull();
  });

  it("never fire while typing", () => {
    expect(isTyping({ tagName: "INPUT" } as unknown as EventTarget)).toBe(true);
    expect(isTyping({ tagName: "DIV", isContentEditable: false } as unknown as EventTarget)).toBe(false);
  });

  it("mute all remembers what was on", () => {
    useSettings.getState().update({ sound: true, music: false });
    expect(toggleMuteAll()).toBe(true);
    expect([useSettings.getState().sound, useSettings.getState().music]).toEqual([false, false]);
    expect(toggleMuteAll()).toBe(false);
    expect([useSettings.getState().sound, useSettings.getState().music]).toEqual([true, false]);
  });
});

describe("key labels and keymaps", () => {
  it("labels physical keys", () => {
    expect(keyLabel("KeyA")).toBe("A");
    expect(keyLabel("Digit7")).toBe("7");
    expect(keyLabel("Numpad7")).toBe("Num 7");
    expect(keyLabel("ArrowUp")).toBe("↑");
    expect(keyLabel("Escape")).toBe("Esc");
  });

  it("action ids are unique within each game", () => {
    for (const m of KEYMAPS) {
      const ids = m.groups.flatMap((g) => g.actions.map((a) => a.id));
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});
