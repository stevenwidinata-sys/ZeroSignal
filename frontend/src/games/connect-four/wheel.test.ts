import { describe, expect, it } from "vitest";
import { WHEEL_SKINS, rotationFor, segmentAt } from "./wheel";

describe("spin wheel geometry", () => {
  it("holds every winnable skin, none of the free ones", () => {
    expect(WHEEL_SKINS).toHaveLength(8);
    expect(WHEEL_SKINS.some((s) => s.free)).toBe(false);
  });

  it("lands each skin under the pointer, always spinning forward", () => {
    let rot = 0;
    for (const id of ["golden", "pig", "pig", "tnt", "green", "egg"]) {
      const next = rotationFor(id, rot);
      expect(next).toBeGreaterThanOrEqual(rot + 4 * 360);
      expect(next).toBeLessThan(rot + 5 * 360);
      expect(segmentAt(next)).toBe(id);
      rot = next;
    }
  });

  it("ignores unknown skins", () => {
    expect(rotationFor("nope", 90)).toBe(90);
  });
});
