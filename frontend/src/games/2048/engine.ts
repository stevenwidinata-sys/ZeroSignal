/**
 * 2048 rules. A line-for-line copy of `backend/src/game_2048/engine.rs`: the
 * server replays your moves with the Rust version, so both must give
 * identical boards. The random numbers use only 32-bit integer math, and a
 * shared test vector in both test suites catches drift. Change both files
 * together.
 *
 * Cells hold exponents: 0 empty, 1 = 2, 2 = 4, 3 = 8, ...
 */

// ---------------------------------------------------------------------------
// Random numbers (mulberry32, same as Whack-a-Mole)
// ---------------------------------------------------------------------------

export class Rng {
  s: number;
  constructor(seed: number) {
    this.s = seed >>> 0;
  }
  nextU32(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }
  /** 0..n (n > 0). */
  below(n: number): number {
    return this.nextU32() % n;
  }
}

/** Everyone gets the same Daily seed on the same WIB day. */
export function dailySeed(year: number, month: number, day: number): number {
  const r = new Rng(((Math.imul(year, 10_000) + month * 100 + day) >>> 0) ^ 0x2048);
  return (r.nextU32() ^ 0x2048d41c) >>> 0;
}

// ---------------------------------------------------------------------------
// Modes
// ---------------------------------------------------------------------------

export type Mode = "classic" | "big" | "tiny" | "daily";
export const MODES: Mode[] = ["classic", "big", "tiny", "daily"];

/** `scores.level` value of each mode's leaderboard. */
export const BOARD_ID: Record<Mode, number> = { classic: 1, big: 2, tiny: 3, daily: 4 };
export const SIZE: Record<Mode, number> = { classic: 4, big: 5, tiny: 3, daily: 4 };
/** Score multiplier in tenths (Big ×0.8, Tiny ×2). */
export const TENTHS: Record<Mode, number> = { classic: 10, big: 8, tiny: 20, daily: 10 };
export const MAX_UNDOS = 3;
export const UNDOS: Record<Mode, number> = { classic: MAX_UNDOS, big: MAX_UNDOS, tiny: MAX_UNDOS, daily: 0 };

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

export type Dir = "U" | "D" | "L" | "R";
export const DIRS: Dir[] = ["U", "D", "L", "R"];
export const UNDO = "Z";

/** Cell indexes of every line, each starting at the edge tiles slide toward. */
export function lines(size: number, dir: Dir): number[][] {
  const out: number[][] = [];
  for (let a = 0; a < size; a++) {
    const line: number[] = [];
    for (let b = 0; b < size; b++) {
      if (dir === "L") line.push(a * size + b);
      else if (dir === "R") line.push(a * size + (size - 1 - b));
      else if (dir === "U") line.push(b * size + a);
      else line.push((size - 1 - b) * size + a);
    }
    out.push(line);
  }
  return out;
}

/** Where each tile went in a slide (for animations). */
export interface SlidePlan {
  cells: number[];
  gained: number;
  /** Source cell -> destination cell, for every tile that was on the board. */
  dest: Map<number, number>;
  /** Destination cells where two tiles merged. */
  merged: number[];
}

/** Slide every tile toward `dir`. Each tile merges at most once per move. */
export function slide(cells: number[], size: number, dir: Dir): SlidePlan {
  const out = cells.slice();
  const dest = new Map<number, number>();
  const merged: number[] = [];
  let gained = 0;
  for (const line of lines(size, dir)) {
    const tiles = line.filter((i) => cells[i] > 0);
    let j = 0;
    let k = 0;
    const values: number[] = [];
    while (k < tiles.length) {
      const target = line[j];
      if (k + 1 < tiles.length && cells[tiles[k]] === cells[tiles[k + 1]]) {
        const e = cells[tiles[k]] + 1;
        values.push(e);
        gained += 2 ** e;
        dest.set(tiles[k], target);
        dest.set(tiles[k + 1], target);
        merged.push(target);
        k += 2;
      } else {
        values.push(cells[tiles[k]]);
        dest.set(tiles[k], target);
        k += 1;
      }
      j += 1;
    }
    line.forEach((i, n) => {
      out[i] = values[n] ?? 0;
    });
  }
  return { cells: out, gained, dest, merged };
}

function same(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export type StepError = "bad_move" | "no_change" | "no_undo_left" | "nothing_to_undo";

interface Snapshot {
  cells: number[];
  rng: number;
  score: number;
}

/** What one step did (for animations and sounds). */
export interface StepResult {
  kind: "move" | "undo";
  plan?: SlidePlan;
  /** Cell where the new tile dropped, if any. */
  spawned: number | null;
}

export class Game {
  readonly mode: Mode;
  readonly size: number;
  cells: number[];
  rng: Rng;
  score = 0;
  private history: Snapshot[] = [];
  undosUsed = 0;
  /** Slides made (undos not counted, undone slides still counted). */
  moves = 0;
  /** Biggest exponent ever on the board. */
  bestExp = 0;

  constructor(seed: number, mode: Mode) {
    this.mode = mode;
    this.size = SIZE[mode];
    this.cells = new Array<number>(this.size * this.size).fill(0);
    this.rng = new Rng(seed);
    this.spawn();
    this.spawn();
  }

  /** Drop a 2 (90%) or 4 (10%) on a random empty cell. */
  private spawn(): number | null {
    const empty: number[] = [];
    this.cells.forEach((e, i) => e === 0 && empty.push(i));
    if (empty.length === 0) return null;
    const at = empty[this.rng.below(empty.length)];
    const exp = this.rng.below(10) === 0 ? 2 : 1;
    this.cells[at] = exp;
    this.bestExp = Math.max(this.bestExp, exp);
    return at;
  }

  undosLeft(): number {
    return Math.max(0, UNDOS[this.mode] - this.undosUsed);
  }

  canUndo(): boolean {
    return this.undosLeft() > 0 && this.history.length > 0;
  }

  /** Apply one move character: U D L R, or Z (undo). Throws a StepError. */
  step(c: string): StepResult {
    if (c === UNDO) {
      if (this.undosLeft() === 0) throw new Error("no_undo_left" satisfies StepError);
      const s = this.history.pop();
      if (!s) throw new Error("nothing_to_undo" satisfies StepError);
      this.cells = s.cells;
      this.rng.s = s.rng;
      this.score = s.score;
      this.undosUsed += 1;
      return { kind: "undo", spawned: null };
    }
    if (!DIRS.includes(c as Dir)) throw new Error("bad_move" satisfies StepError);
    const plan = slide(this.cells, this.size, c as Dir);
    if (same(plan.cells, this.cells)) throw new Error("no_change" satisfies StepError);
    if (this.undosLeft() > 0) {
      this.history.push({ cells: this.cells.slice(), rng: this.rng.s, score: this.score });
      if (this.history.length > MAX_UNDOS) this.history.shift();
    }
    this.bestExp = Math.max(this.bestExp, ...plan.cells);
    this.cells = plan.cells.slice();
    this.score += plan.gained;
    this.moves += 1;
    const spawned = this.spawn();
    return { kind: "move", plan, spawned };
  }

  /** Would this move change the board? */
  canSlide(dir: Dir): boolean {
    return !same(slide(this.cells, this.size, dir).cells, this.cells);
  }

  /** True while some move still changes the board. */
  canMove(): boolean {
    const n = this.size;
    return this.cells.some(
      (e, i) => e === 0 || (i % n + 1 < n && this.cells[i + 1] === e) || (i + n < n * n && this.cells[i + n] === e),
    );
  }

  maxTile(): number {
    return this.bestExp === 0 ? 0 : 2 ** this.bestExp;
  }

  /** Leaderboard points: score × the mode multiplier (rounded down). */
  points(): number {
    return Math.floor((this.score * TENTHS[this.mode]) / 10);
  }
}

/** Rebuild a game from its seed and move string (throws on a bad move). */
export function replay(seed: number, mode: Mode, moves: string): Game {
  const g = new Game(seed, mode);
  for (const c of moves) g.step(c);
  return g;
}

/** Value shown on a tile with exponent `e`. */
export function tileValue(e: number): number {
  return e === 0 ? 0 : 2 ** e;
}
