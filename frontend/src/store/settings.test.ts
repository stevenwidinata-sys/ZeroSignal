import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, parseSettings } from "./settings";

describe("parseSettings", () => {
  it("returns defaults for missing or corrupt data", () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("not json")).toEqual(DEFAULT_SETTINGS);
  });

  it("keeps valid values", () => {
    const stored = { sound: false, volume: 0.2, music: false, musicVolume: 0.7, lightGraphics: true, turnTimer: 20 };
    expect(parseSettings(JSON.stringify(stored))).toEqual(stored);
  });

  it("clamps volume and rejects unknown timer values", () => {
    const s = parseSettings(JSON.stringify({ volume: 5, musicVolume: -1, turnTimer: 7, sound: "yes" }));
    expect(s.volume).toBe(1);
    expect(s.musicVolume).toBe(0);
    expect(s.turnTimer).toBe(DEFAULT_SETTINGS.turnTimer);
    expect(s.sound).toBe(DEFAULT_SETTINGS.sound);
  });

  it("turns music on at 40% by default, also for settings saved before music existed", () => {
    expect(DEFAULT_SETTINGS.music).toBe(true);
    expect(DEFAULT_SETTINGS.musicVolume).toBe(0.4);
    const old = parseSettings(JSON.stringify({ sound: true, volume: 0.6, lightGraphics: false, turnTimer: 0 }));
    expect(old.music).toBe(true);
    expect(old.musicVolume).toBe(0.4);
  });
});
