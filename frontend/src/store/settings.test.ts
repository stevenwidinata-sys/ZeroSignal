import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, parseSettings } from "./settings";

describe("parseSettings", () => {
  it("returns defaults for missing or corrupt data", () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("not json")).toEqual(DEFAULT_SETTINGS);
  });

  it("keeps valid values", () => {
    const s = parseSettings(
      JSON.stringify({ sound: false, volume: 0.2, lightGraphics: true, turnTimer: 20 }),
    );
    expect(s).toEqual({ sound: false, volume: 0.2, lightGraphics: true, turnTimer: 20 });
  });

  it("clamps volume and rejects unknown timer values", () => {
    const s = parseSettings(JSON.stringify({ volume: 5, turnTimer: 7, sound: "yes" }));
    expect(s.volume).toBe(1);
    expect(s.turnTimer).toBe(DEFAULT_SETTINGS.turnTimer);
    expect(s.sound).toBe(DEFAULT_SETTINGS.sound);
  });
});
