/**
 * Whack-a-Mole rules. A line-for-line copy of
 * `backend/src/whack_a_mole/engine.rs`: the server replays your taps with the
 * Rust version, so both must give identical results. Only integer math is
 * used (Math.imul / Math.trunc), and a shared test vector in both test suites
 * catches drift. Change both files together.
 */

// ---------------------------------------------------------------------------
// Random numbers (mulberry32)
// ---------------------------------------------------------------------------

export class Rng {
  private s: number;
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

// ---------------------------------------------------------------------------
// Modes and moles
// ---------------------------------------------------------------------------

export type Mode = "classic" | "frenzy" | "survival" | "daily";
export const MODES: Mode[] = ["classic", "frenzy", "survival", "daily"];

/** `scores.level` value of each mode's leaderboard. */
export const BOARD_ID: Record<Mode, number> = { classic: 1, frenzy: 2, survival: 3, daily: 4 };

interface Config {
  /** Round length; null = Survival. */
  duration: number | null;
  ramp: number;
  gap: [number, number];
  visible: [number, number];
  doubleMax: number;
}

export function config(mode: Mode): Config {
  switch (mode) {
    case "classic":
    case "daily":
      return { duration: 60_000, ramp: 60_000, gap: [900, 480], visible: [1_150, 750], doubleMax: 25 };
    case "frenzy":
      return { duration: 30_000, ramp: 30_000, gap: [560, 330], visible: [800, 540], doubleMax: 45 };
    case "survival":
      return { duration: null, ramp: 120_000, gap: [1_000, 380], visible: [1_350, 620], doubleMax: 35 };
  }
}

export const SURVIVAL_CAP_MS = 300_000;
export const SURVIVAL_LIVES = 3;
export const ICE_BONUS_MS = 3_000;
export const ICE_BONUS_MAX_MS = 15_000;
export const MIN_TAP_GAP_MS = 30;
export const BOMB_PENALTY = 300;
const FIRST_SPAWN_MS = 600;

export type Kind = "normal" | "ninja" | "helmet" | "golden" | "bomb" | "ice";
export const KINDS: Kind[] = ["normal", "ninja", "helmet", "golden", "bomb", "ice"];

export const POINTS: Record<Kind, number> = { normal: 100, ninja: 150, helmet: 250, golden: 500, bomb: 0, ice: 50 };
const VISIBLE_PCT: Record<Kind, number> = { normal: 100, ninja: 55, helmet: 135, golden: 80, bomb: 100, ice: 100 };
const KIND_WEIGHTS = [640, 100, 100, 40, 90, 30];

export const escapeHurts = (k: Kind) => k === "normal" || k === "ninja" || k === "helmet";

function rollKind(rng: Rng): Kind {
  let r = rng.below(1_000);
  for (let i = 0; i < KIND_WEIGHTS.length; i++) {
    if (r < KIND_WEIGHTS[i]) return KINDS[i];
    r -= KIND_WEIGHTS[i];
  }
  return "normal";
}

export interface Spawn {
  t: number;
  hole: number;
  kind: Kind;
  vis: number;
}

const until = (s: Spawn) => s.t + s.vis;

/** Rust `(start + (end - start) * p / ramp)` with i64 truncating division. */
function lerp([start, end]: [number, number], at: number, ramp: number): number {
  const p = Math.min(at, ramp);
  return start + Math.trunc(((end - start) * p) / Math.max(ramp, 1));
}

export function horizon(mode: Mode): number {
  const d = config(mode).duration;
  return d === null ? SURVIVAL_CAP_MS : d + ICE_BONUS_MAX_MS;
}

export function schedule(seed: number, mode: Mode, grid: number): Spawn[] {
  const cfg = config(mode);
  const holes = grid * grid;
  const end = horizon(mode);
  const rng = new Rng(seed);
  const busyUntil = new Array<number>(holes).fill(0);
  const out: Spawn[] = [];
  let t = FIRST_SPAWN_MS;

  while (t < end) {
    const doubled = rng.below(100) < lerp([0, cfg.doubleMax], t, cfg.ramp);
    const count = doubled ? 2 : 1;
    for (let n = 0; n < count; n++) {
      const free: number[] = [];
      for (let h = 0; h < holes; h++) if (busyUntil[h] <= t) free.push(h);
      if (free.length === 0) break;
      const hole = free[rng.below(free.length)];
      const kind = rollKind(rng);
      const vis = Math.trunc((lerp(cfg.visible, t, cfg.ramp) * VISIBLE_PCT[kind]) / 100);
      busyUntil[hole] = t + vis;
      out.push({ t, hole, kind, vis });
    }
    const gap = lerp(cfg.gap, t, cfg.ramp);
    t += gap - Math.trunc(gap / 6) + rng.below(Math.trunc(gap / 3) + 1);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Replay
// ---------------------------------------------------------------------------

export interface Tap {
  t: number;
  hole: number;
}

export type TapOutcome =
  | { type: "ignored" }
  | { type: "empty" }
  | { type: "hit"; kind: Kind; points: number }
  | { type: "cracked" }
  | { type: "bomb" };

export const comboTenths = (streak: number) => (streak >= 10 ? 30 : streak >= 5 ? 15 : 10);
export const gridTenths = (grid: number) => (grid === 4 ? 12 : 10);

export interface Summary {
  score: number;
  hits: number;
  misses: number;
  escapes: number;
  best_streak: number;
  fever: boolean;
  golden_hits: number;
  bombs_hit: number;
  /** Hits per kind, in KINDS order. */
  by_kind: number[];
  hole_hits: number[];
  hole_misses: number[];
  reaction_total_ms: number;
  reactions: number;
  ended_ms: number;
  lives_left: number;
}

export class Game {
  readonly spawns: Spawn[];
  private left: number[];
  private escapeOrder: number[];
  private nextEscape = 0;
  endMs: number;
  private iceBonus = 0;
  private lastTap: number | null = null;
  streak = 0;
  lives: number;
  over = false;
  s: Summary;

  constructor(
    seed: number,
    readonly mode: Mode,
    readonly grid: number,
  ) {
    this.spawns = schedule(seed, mode, grid);
    this.left = this.spawns.map((s) => (s.kind === "helmet" ? 2 : 1));
    this.escapeOrder = this.spawns.map((_, i) => i);
    this.escapeOrder.sort((a, b) => until(this.spawns[a]) - until(this.spawns[b]) || a - b);
    this.endMs = config(mode).duration ?? SURVIVAL_CAP_MS;
    this.lives = mode === "survival" ? SURVIVAL_LIVES : 0;
    const holes = grid * grid;
    this.s = {
      score: 0,
      hits: 0,
      misses: 0,
      escapes: 0,
      best_streak: 0,
      fever: false,
      golden_hits: 0,
      bombs_hit: 0,
      by_kind: [0, 0, 0, 0, 0, 0],
      hole_hits: new Array<number>(holes).fill(0),
      hole_misses: new Array<number>(holes).fill(0),
      reaction_total_ms: 0,
      reactions: 0,
      ended_ms: 0,
      lives_left: 0,
    };
  }

  private loseLife(at: number) {
    if (this.mode === "survival") {
      this.lives = Math.max(0, this.lives - 1);
      if (this.lives === 0) this.endMs = at;
    }
  }

  /** Let moles escape up to and including `now`. */
  advance(now: number): void {
    while (this.nextEscape < this.escapeOrder.length) {
      const i = this.escapeOrder[this.nextEscape];
      const sp = this.spawns[i];
      const at = until(sp);
      if (at > now || at >= this.endMs) break;
      this.nextEscape++;
      if (this.left[i] === 0 || sp.t >= this.endMs) continue;
      this.left[i] = 0;
      if (escapeHurts(sp.kind)) {
        this.s.escapes++;
        this.streak = 0;
        this.loseLife(at);
      }
    }
    if (now >= this.endMs) this.over = true;
  }

  moleAt(hole: number, now: number): number | null {
    if (now >= this.endMs) return null;
    for (let i = 0; i < this.spawns.length; i++) {
      const s = this.spawns[i];
      if (s.hole === hole && s.t <= now && now < until(s) && this.left[i] > 0) return i;
    }
    return null;
  }

  /** Spawns up and unhit at `now` (for drawing). */
  visible(now: number): number[] {
    const out: number[] = [];
    if (now >= this.endMs) return out;
    for (let i = 0; i < this.spawns.length; i++) {
      const s = this.spawns[i];
      if (s.t > now) break; // spawns are in time order
      if (now < until(s) && this.left[i] > 0) out.push(i);
    }
    return out;
  }

  hitsLeft(i: number): number {
    return this.left[i];
  }

  tap(tap: Tap): TapOutcome {
    this.advance(tap.t);
    if (this.over || tap.hole >= this.grid * this.grid) return { type: "ignored" };
    if (this.lastTap !== null && tap.t < this.lastTap + MIN_TAP_GAP_MS) return { type: "ignored" };
    this.lastTap = tap.t;
    const h = tap.hole;

    const i = this.moleAt(tap.hole, tap.t);
    if (i === null) {
      this.s.misses++;
      this.s.hole_misses[h]++;
      this.streak = 0;
      return { type: "empty" };
    }
    const sp = this.spawns[i];
    if (sp.kind === "bomb") {
      this.left[i] = 0;
      this.s.misses++;
      this.s.bombs_hit++;
      this.s.hole_misses[h]++;
      this.streak = 0;
      if (this.mode === "survival") {
        this.loseLife(tap.t);
        if (this.lives === 0) this.over = true;
      } else {
        this.s.score -= BOMB_PENALTY;
      }
      return { type: "bomb" };
    }
    if (sp.kind === "helmet" && this.left[i] === 2) {
      this.left[i] = 1;
      return { type: "cracked" };
    }
    this.left[i] = 0;
    this.streak++;
    this.s.best_streak = Math.max(this.s.best_streak, this.streak);
    if (this.streak >= 10) this.s.fever = true;
    const points = Math.trunc((POINTS[sp.kind] * comboTenths(this.streak) * gridTenths(this.grid)) / 100);
    this.s.score += points;
    this.s.hits++;
    this.s.by_kind[KINDS.indexOf(sp.kind)]++;
    this.s.hole_hits[h]++;
    this.s.reaction_total_ms += tap.t - sp.t;
    this.s.reactions++;
    if (sp.kind === "golden") this.s.golden_hits++;
    if (sp.kind === "ice") {
      if (this.mode === "survival") {
        this.lives = Math.min(this.lives + 1, SURVIVAL_LIVES);
      } else if (this.iceBonus < ICE_BONUS_MAX_MS) {
        this.iceBonus += ICE_BONUS_MS;
        this.endMs += ICE_BONUS_MS;
      }
    }
    return { type: "hit", kind: sp.kind, points };
  }

  /** Run the clock out and return the final numbers (like the server). */
  finish(): Summary {
    this.advance(this.endMs);
    return { ...this.s, ended_ms: this.endMs, lives_left: this.lives, score: Math.max(0, this.s.score) };
  }
}

/** Same as the server's replay (without input validation). */
export function replay(seed: number, mode: Mode, grid: number, taps: Tap[]): Summary {
  const g = new Game(seed, mode, grid);
  for (const t of taps) g.tap(t);
  return g.finish();
}
