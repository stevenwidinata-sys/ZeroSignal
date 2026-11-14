import { describe, expect, it } from "vitest";
import { Game } from "./engine";
import { digitsClass, formatPlayTime, freshTiles, keyToMove, swipeDir, tileClass, tilesAfter } from "./tiles";

describe("2048 tiles", () => {
  it("fresh tiles match the board", () => {
    const g = new Game(42, "classic");
    const tiles = freshTiles(g.cells);
    expect(tiles.map((t) => [t.pos, t.exp])).toEqual([
      [9, 1],
      [12, 2],
    ]);
    expect(new Set(tiles.map((t) => t.id)).size).toBe(2);
  });

  it("tiles follow a slide, merges pop in and old halves become ghosts", () => {
    const g = new Game(1, "classic");
    g.cells = new Array<number>(16).fill(0);
    g.cells[0] = 1;
    g.cells[3] = 1;
    const before = freshTiles(g.cells);
    const res = g.step("L");
    const after = tilesAfter(before, res, g.cells);
    const ghosts = after.filter((t) => t.state === "ghost");
    expect(ghosts.map((t) => t.pos)).toEqual([0, 0]);
    expect(ghosts.map((t) => t.id).sort()).toEqual(before.map((t) => t.id).sort());
    const merged = after.find((t) => t.state === "merged")!;
    expect([merged.pos, merged.exp]).toEqual([0, 2]);
    expect(after.filter((t) => t.state === "new")).toHaveLength(1);
    // The board shown (without ghosts) matches the engine.
    const shown = new Array<number>(16).fill(0);
    after.filter((t) => t.state !== "ghost").forEach((t) => (shown[t.pos] = t.exp));
    expect(shown).toEqual(g.cells);
    // Ghosts are gone after the next move.
    const d = (["L", "R", "U", "D"] as const).find((x) => g.canSlide(x))!;
    const next = tilesAfter(after, g.step(d), g.cells);
    expect(next.some((t) => ghosts.some((gh) => gh.id === t.id))).toBe(false);
  });

  it("keys and swipes map to moves", () => {
    expect(keyToMove("ArrowUp")).toBe("U");
    expect(keyToMove("KeyA")).toBe("L");
    expect(keyToMove("KeyD")).toBe("R");
    expect(keyToMove("KeyZ")).toBe("Z");
    expect(keyToMove("Enter")).toBeNull();
    // A changed key replaces the default.
    expect(keyToMove("KeyI", { "2048.up": ["KeyI"] })).toBe("U");
    expect(keyToMove("KeyW", { "2048.up": ["KeyI"] })).toBeNull();
    expect(swipeDir(40, 5)).toBe("R");
    expect(swipeDir(-3, -60)).toBe("U");
    expect(swipeDir(10, 10)).toBeNull();
  });

  it("text and color classes", () => {
    expect(digitsClass(2)).toBe("g2048-d2");
    expect(digitsClass(1024)).toBe("g2048-d4");
    expect(digitsClass(1048576)).toBe("g2048-d6");
    expect(tileClass(11)).toBe("g2048-t11");
    expect(tileClass(12)).toBe("g2048-t-super");
    expect(formatPlayTime(65_000)).toBe("1:05");
    expect(formatPlayTime(3_723_000)).toBe("1:02:03");
  });
});
