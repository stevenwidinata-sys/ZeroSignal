import { describe, expect, it } from "vitest";
import { LEVELS, LEVEL_ONE, WORLDS, findLevel, starsFor } from "./levels";

describe("angry bird levels", () => {
  it("has 12 levels in 3 worlds, read from the shared file", () => {
    expect(LEVELS).toHaveLength(12);
    expect(WORLDS.map((w) => w.name)).toEqual(["Meadow", "Desert", "Ice Castle"]);
    expect(LEVELS.map((l) => l.id)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
    for (const l of LEVELS) {
      expect(l.pigs.length).toBeGreaterThan(0);
      expect(l.stars[0]).toBe(l.pigs.length * 1000);
      for (const b of l.blocks) expect(["wood", "stone", "ice"]).toContain(b.m);
    }
  });

  it("level 1 is the original layout", () => {
    expect(LEVEL_ONE.blocks).toHaveLength(7);
    expect(LEVEL_ONE.pigs[2]).toMatchObject({ x: 86, y: 15 });
    expect(findLevel(999).id).toBe(1);
  });

  it("stars need every pig gone, then a high enough score", () => {
    const l = findLevel(2);
    expect(starsFor(l, 99_999, false)).toBe(0);
    expect(starsFor(l, l.stars[0], true)).toBe(1);
    expect(starsFor(l, l.stars[2], true)).toBe(3);
  });
});
