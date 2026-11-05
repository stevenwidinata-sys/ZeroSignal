import { describe, expect, it } from "vitest";
import { GAMES } from "./registry";
import { parseSeen } from "./tutorial";

describe("tutorials", () => {
  it("every live game has a 3-4 step tutorial", () => {
    for (const g of GAMES.filter((x) => x.meta.status === "live")) {
      const steps = g.meta.tutorial ?? [];
      expect(steps.length, g.meta.id).toBeGreaterThanOrEqual(3);
      expect(steps.length, g.meta.id).toBeLessThanOrEqual(4);
      for (const s of steps) {
        expect(s.icon && s.title && s.text, `${g.meta.id}: ${s.title}`).toBeTruthy();
      }
      expect(new Set(steps.map((s) => s.title)).size, g.meta.id).toBe(steps.length);
    }
  });

  it("reads the seen list defensively", () => {
    expect(parseSeen(null)).toEqual([]);
    expect(parseSeen("oops")).toEqual([]);
    expect(parseSeen('{"a":1}')).toEqual([]);
    expect(parseSeen('["connect-four", 3, "angry-bird"]')).toEqual(["connect-four", "angry-bird"]);
  });
});
