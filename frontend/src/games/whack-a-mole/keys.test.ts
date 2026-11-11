import { describe, expect, it } from "vitest";
import { holeForKey, keyLabel } from "./keys";

describe("whack-a-mole keys", () => {
  it("3x3 uses numpad layout on digits and numpad, plus QWE/ASD/ZXC", () => {
    expect(holeForKey("Numpad7", 3)).toBe(0);
    expect(holeForKey("Digit5", 3)).toBe(4);
    expect(holeForKey("Numpad3", 3)).toBe(8);
    expect(holeForKey("KeyQ", 3)).toBe(0);
    expect(holeForKey("KeyC", 3)).toBe(8);
    expect(holeForKey("KeyR", 3)).toBeNull();
  });

  it("4x4 uses 1234/QWER/ASDF/ZXCV", () => {
    expect(holeForKey("Digit1", 4)).toBe(0);
    expect(holeForKey("KeyR", 4)).toBe(7);
    expect(holeForKey("KeyV", 4)).toBe(15);
    expect(holeForKey("Digit9", 4)).toBeNull();
  });

  it("every hole has exactly one label and key", () => {
    for (const grid of [3, 4] as const) {
      const holes = Array.from({ length: grid * grid }, (_, h) => h);
      expect(new Set(holes.map((h) => keyLabel(h, grid))).size).toBe(grid * grid);
      for (const h of holes) {
        const label = keyLabel(h, grid);
        const code = /\d/.test(label) ? `Digit${label}` : `Key${label}`;
        expect(holeForKey(code, grid)).toBe(h);
      }
    }
  });
});
