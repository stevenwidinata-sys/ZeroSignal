import { describe, expect, it } from "vitest";
import { DIRS, Game, MODES, Rng, TENTHS, UNDO, dailySeed, replay, slide, type Dir, type Mode } from "./engine";

/** Plays the first move of L, D, R, U that changes the board until none does. */
function greedy(seed: number, mode: Mode, max: number): string {
  const g = new Game(seed, mode);
  let out = "";
  while (out.length < max) {
    const c = (["L", "D", "R", "U"] as Dir[]).find((d) => g.canSlide(d));
    if (!c) break;
    g.step(c);
    out += c;
  }
  return out;
}

function fingerprint(seed: number, mode: Mode): number[] {
  const g = replay(seed, mode, greedy(seed, mode, 5_000));
  return [g.score, g.points(), g.maxTile(), g.moves, g.canMove() ? 0 : 1];
}

/** Slide one row: pad it to a 4×4 board and read the first row back. */
function row(vals: number[], dir: Dir): [number[], number] {
  const b = new Array<number>(16).fill(0);
  vals.forEach((v, i) => (b[i] = v));
  const p = slide(b, 4, dir);
  return [p.cells.slice(0, 4), p.gained];
}

describe("shared test vectors (must match backend engine.rs)", () => {
  it("rng", () => {
    const r = new Rng(12345);
    expect([r.nextU32(), r.nextU32(), r.nextU32(), r.nextU32()]).toEqual([
      4207900869, 1317490944, 2079646450, 3513001552,
    ]);
  });

  it("start boards", () => {
    expect(new Game(42, "classic").cells).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 2, 0, 0, 0]);
    expect(new Game(7, "tiny").cells).toEqual([0, 0, 0, 0, 0, 0, 2, 2, 0]);
  });

  it("daily seed", () => {
    expect(dailySeed(2026, 11, 13)).toBe(2397828775);
  });

  it("replays", () => {
    expect([
      fingerprint(42, "classic"),
      fingerprint(5, "big"),
      fingerprint(9, "tiny"),
      fingerprint(dailySeed(2026, 11, 13), "daily"),
    ]).toEqual([
      [1620, 1620, 128, 162, 1],
      [3776, 3020, 256, 336, 1],
      [268, 536, 32, 44, 1],
      [660, 660, 64, 87, 1],
    ]);
  });
});

describe("2048 rules", () => {
  it("slides and merges each tile once per move", () => {
    expect(row([1, 1, 1, 1], "L")).toEqual([[2, 2, 0, 0], 8]);
    expect(row([1, 1, 1, 1], "R")).toEqual([[0, 0, 2, 2], 8]);
    expect(row([1, 0, 1, 2], "L")).toEqual([[2, 2, 0, 0], 4]);
    expect(row([2, 1, 1, 0], "R")).toEqual([[0, 0, 2, 2], 4]);
  });

  it("reports where every tile went", () => {
    const b = new Array<number>(16).fill(0);
    b[0] = 1;
    b[2] = 1;
    b[3] = 2;
    const p = slide(b, 4, "L");
    expect(p.dest.get(0)).toBe(0);
    expect(p.dest.get(2)).toBe(0);
    expect(p.dest.get(3)).toBe(1);
    expect(p.merged).toEqual([0]);
  });

  it("slides columns up and down", () => {
    const b = new Array<number>(16).fill(0);
    b[0] = 1;
    b[4] = 1;
    b[12] = 2;
    const up = slide(b, 4, "U");
    expect([up.cells[0], up.cells[4], up.cells[8], up.cells[12], up.gained]).toEqual([2, 2, 0, 0, 4]);
    const down = slide(b, 4, "D");
    expect([down.cells[0], down.cells[4], down.cells[8], down.cells[12]]).toEqual([0, 0, 2, 2]);
  });

  it("new games have two small tiles", () => {
    for (let seed = 0; seed < 100; seed++) {
      for (const mode of MODES) {
        const tiles = new Game(seed, mode).cells.filter((e) => e > 0);
        expect(tiles).toHaveLength(2);
        expect(tiles.every((e) => e === 1 || e === 2)).toBe(true);
      }
    }
  });

  it("rejects moves that change nothing", () => {
    const g = new Game(1, "classic");
    g.cells = new Array<number>(16).fill(0);
    g.cells[0] = 1;
    expect(() => g.step("L")).toThrow("no_change");
    expect(() => g.step("X")).toThrow("bad_move");
    expect(g.step("R").kind).toBe("move");
  });

  it("undo restores the board, score and the next tile drop", () => {
    const moves = greedy(3, "classic", 30);
    const g = replay(3, "classic", moves);
    const before = [g.cells.slice(), g.score];
    const d = DIRS.find((x) => g.canSlide(x))!;
    const once = replay(3, "classic", moves);
    once.step(d);
    g.step(d);
    g.step(UNDO);
    expect([g.cells, g.score]).toEqual(before);
    g.step(d);
    expect(g.cells).toEqual(once.cells);
    expect(g.undosUsed).toBe(1);
  });

  it("limits undos and allows none in Daily", () => {
    const g = replay(11, "classic", greedy(11, "classic", 10));
    for (let i = 0; i < 3; i++) g.step(UNDO);
    expect(() => g.step(UNDO)).toThrow("no_undo_left");
    expect(() => new Game(11, "classic").step(UNDO)).toThrow("nothing_to_undo");
    const d = replay(11, "daily", greedy(11, "daily", 5));
    expect(d.canUndo()).toBe(false);
    expect(() => d.step(UNDO)).toThrow("no_undo_left");
  });

  it("games end and score with the multiplier", () => {
    for (const mode of MODES) {
      const g = replay(21, mode, greedy(21, mode, 100_000));
      expect(g.canMove()).toBe(false);
      expect(g.points()).toBe(Math.floor((g.score * TENTHS[mode]) / 10));
      expect(g.maxTile()).toBeGreaterThanOrEqual(4);
    }
  });
});
