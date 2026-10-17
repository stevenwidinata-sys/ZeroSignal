import { describe, expect, it } from "vitest";
import { useSettings } from "../store/settings";
import { RECIPES, playSfx, type Sfx } from "./sound";

describe("sound effects", () => {
  it("every recipe has playable notes", () => {
    for (const [name, notes] of Object.entries(RECIPES)) {
      expect(notes.length, name).toBeGreaterThan(0);
      for (const n of notes) {
        expect(n.freq).toBeGreaterThan(0);
        expect(n.dur).toBeGreaterThan(0);
        expect(n.gain).toBeGreaterThan(0);
        expect(n.gain).toBeLessThanOrEqual(1);
      }
    }
  });

  it("is a safe no-op without Web Audio or when muted", () => {
    useSettings.getState().update({ sound: false });
    expect(() => playSfx("win")).not.toThrow();
    useSettings.getState().update({ sound: true });
    for (const name of Object.keys(RECIPES) as Sfx[]) {
      expect(() => playSfx(name)).not.toThrow();
    }
  });
});
