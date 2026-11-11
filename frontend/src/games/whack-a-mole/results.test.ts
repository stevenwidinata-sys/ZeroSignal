import { describe, expect, it } from "vitest";
import { accuracy, heat } from "./Results";

describe("whack-a-mole results", () => {
  it("accuracy is hits out of all counted taps", () => {
    expect(accuracy(0, 0)).toBe(0);
    expect(accuracy(9, 1)).toBe(90);
    expect(accuracy(2, 1)).toBe(67);
  });

  it("heat levels go 0..4 relative to the busiest hole", () => {
    expect(heat(0, 10)).toBe(0);
    expect(heat(1, 10)).toBe(1);
    expect(heat(5, 10)).toBe(2);
    expect(heat(10, 10)).toBe(4);
    expect(heat(3, 0)).toBe(0);
  });
});
