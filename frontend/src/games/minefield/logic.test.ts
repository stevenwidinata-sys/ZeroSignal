import { describe, expect, it } from "vitest";
import {
  HIDDEN,
  bvPerSecond,
  canChord,
  efficiency,
  flagsAround,
  formatTime,
  minesLeft,
  moveCursor,
  neighbors,
  nextMark,
  pruneMarks,
  type Mark,
} from "./logic";

describe("minefield logic", () => {
  it("marks cycle flag → ? → none", () => {
    expect(nextMark(undefined)).toBe("flag");
    expect(nextMark("flag")).toBe("question");
    expect(nextMark("question")).toBeUndefined();
  });

  it("neighbors stay on the board", () => {
    expect(neighbors(0, 3, 3).sort()).toEqual([1, 3, 4]);
    expect(neighbors(4, 3, 3)).toHaveLength(8);
    expect(neighbors(8, 3, 3).sort()).toEqual([4, 5, 7]);
  });

  it("chording needs a number whose flags match and a hidden cell left", () => {
    // 3x3, middle shows 1, top-left flagged.
    const cells = [HIDDEN, HIDDEN, HIDDEN, HIDDEN, 1, HIDDEN, HIDDEN, HIDDEN, HIDDEN];
    const marks = new Map<number, Mark>([[0, "flag"]]);
    expect(canChord(4, cells, 3, 3, marks)).toBe(true);
    expect(flagsAround(4, 3, 3, marks)).toEqual([0]);
    expect(canChord(4, cells, 3, 3, new Map())).toBe(false);
    marks.set(1, "flag");
    expect(canChord(4, cells, 3, 3, marks)).toBe(false);
    expect(canChord(0, cells, 3, 3, marks)).toBe(false);
  });

  it("cursor moves with arrows and stops at edges", () => {
    expect(moveCursor(0, "ArrowLeft", 3, 4)).toBe(0);
    expect(moveCursor(0, "ArrowRight", 3, 4)).toBe(1);
    expect(moveCursor(0, "ArrowDown", 3, 4)).toBe(4);
    expect(moveCursor(11, "ArrowDown", 3, 4)).toBe(11);
    expect(moveCursor(5, "ArrowUp", 3, 4)).toBe(1);
  });

  it("mine counter and pruning", () => {
    const marks = new Map<number, Mark>([
      [0, "flag"],
      [1, "question"],
      [2, "flag"],
    ]);
    expect(minesLeft(10, marks)).toBe(8);
    const pruned = pruneMarks(marks, [HIDDEN, HIDDEN, 3]);
    expect([...pruned.keys()]).toEqual([0, 1]);
  });

  it("stats", () => {
    expect(bvPerSecond(30, 10_000)).toBe(3);
    expect(bvPerSecond(10, 0)).toBe(0);
    expect(efficiency(15, 20)).toBe(75);
    expect(efficiency(15, 0)).toBe(0);
    expect(formatTime(12_345)).toBe("12.3s");
    expect(formatTime(83_456)).toBe("1:23.4");
  });
});
