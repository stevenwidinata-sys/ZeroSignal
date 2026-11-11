import { describe, expect, it } from "vitest";
import {
  BOMB_PENALTY,
  Game,
  MIN_TAP_GAP_MS,
  MODES,
  Rng,
  SURVIVAL_CAP_MS,
  comboTenths,
  horizon,
  replay,
  schedule,
  type Mode,
  type Tap,
} from "./engine";

/** Hits every non-bomb mole 100 ms after it appears (twice for helmets). */
function perfectTaps(seed: number, mode: Mode, grid: number): Tap[] {
  const taps: Tap[] = [];
  for (const s of schedule(seed, mode, grid)) {
    if (s.kind === "bomb") continue;
    taps.push({ t: s.t + 100, hole: s.hole });
    if (s.kind === "helmet") taps.push({ t: s.t + 140, hole: s.hole });
  }
  taps.sort((a, b) => a.t - b.t);
  const out: Tap[] = [];
  for (const t of taps) {
    const last = out[out.length - 1];
    out.push(last && t.t < last.t + MIN_TAP_GAP_MS ? { ...t, t: last.t + MIN_TAP_GAP_MS } : t);
  }
  return out.filter((t) => t.t <= horizon(mode));
}

/** Compact fingerprint of a replay, compared with the Rust test suite. */
function fingerprint(seed: number, mode: Mode, grid: number, every: number) {
  const taps = perfectTaps(seed, mode, grid).filter((_, i) => i % every === 0);
  const s = replay(seed, mode, grid, taps);
  return [s.score, s.hits, s.misses, s.escapes, s.best_streak, s.golden_hits, s.ended_ms, s.lives_left];
}

describe("shared test vectors (must match backend engine.rs)", () => {
  it("rng", () => {
    const r = new Rng(12345);
    expect([r.nextU32(), r.nextU32(), r.nextU32(), r.nextU32()]).toEqual([
      4207900869, 1317490944, 2079646450, 3513001552,
    ]);
  });

  it("schedule", () => {
    const s = schedule(42, "classic", 3);
    expect(s.slice(0, 4)).toEqual([
      { t: 600, hole: 7, kind: "ninja", vis: 630 },
      { t: 1605, hole: 6, kind: "normal", vis: 1140 },
      { t: 2417, hole: 1, kind: "normal", vis: 1134 },
      { t: 3397, hole: 5, kind: "helmet", vis: 1522 },
    ]);
    expect(s).toHaveLength(136);
  });

  it("replays", () => {
    expect([
      fingerprint(5, "classic", 3, 1),
      fingerprint(5, "classic", 4, 2),
      fingerprint(9, "survival", 3, 3),
      fingerprint(77, "frenzy", 4, 1),
    ]).toEqual(SHARED_REPLAYS);
  });
});

const SHARED_REPLAYS: number[][] = [
  [49075, 107, 0, 0, 107, 9, 66000, 0],
  [7620, 48, 0, 53, 3, 3, 66000, 0],
  [100, 1, 0, 3, 1, 0, 5746, 0],
  [34410, 73, 0, 0, 73, 3, 30000, 0],
];

describe("engine rules", () => {
  it("schedules are deterministic and never overlap in a hole", () => {
    for (const mode of MODES) {
      for (const grid of [3, 4]) {
        const a = schedule(7, mode, grid);
        expect(schedule(7, mode, grid)).toEqual(a);
        for (let i = 0; i < a.length; i++) {
          for (const y of a.slice(i + 1)) {
            if (y.hole === a[i].hole) expect(y.t).toBeGreaterThanOrEqual(a[i].t + a[i].vis);
          }
        }
      }
    }
  });

  it("perfect play reaches fever; perfect survival lasts to the cap", () => {
    const s = replay(5, "classic", 3, perfectTaps(5, "classic", 3));
    expect(s.fever).toBe(true);
    expect(s.misses + s.escapes).toBe(0);
    const sv = replay(9, "survival", 3, perfectTaps(9, "survival", 3));
    expect(sv.ended_ms).toBe(SURVIVAL_CAP_MS);
  });

  it("survival without taps ends after 3 escapes", () => {
    const s = replay(3, "survival", 3, []);
    expect(s.lives_left).toBe(0);
    expect(s.escapes).toBe(3);
  });

  it("bombs cost points, helmets need two hits, fast taps are ignored", () => {
    const sched = schedule(11, "classic", 3);
    const bomb = sched.find((s) => s.kind === "bomb")!;
    const g = new Game(11, "classic", 3);
    expect(g.tap({ t: bomb.t + 10, hole: bomb.hole }).type).toBe("bomb");
    expect(g.s.score).toBe(-BOMB_PENALTY);
    expect(g.finish().score).toBe(0);

    const h = schedule(13, "classic", 3).find((s) => s.kind === "helmet")!;
    const g2 = new Game(13, "classic", 3);
    expect(g2.tap({ t: h.t + 5, hole: h.hole }).type).toBe("cracked");
    expect(g2.tap({ t: h.t + 10, hole: h.hole }).type).toBe("ignored");
    expect(g2.tap({ t: h.t + 5 + MIN_TAP_GAP_MS, hole: h.hole })).toEqual({ type: "hit", kind: "helmet", points: 250 });
  });

  it("combo steps", () => {
    expect([0, 4, 5, 9, 10, 50].map(comboTenths)).toEqual([10, 10, 15, 15, 30, 30]);
  });

  it("visible() lists exactly the moles you can hit", () => {
    const g = new Game(21, "frenzy", 3);
    for (let now = 0; now < 5_000; now += 97) {
      g.advance(now);
      for (const i of g.visible(now)) expect(g.moleAt(g.spawns[i].hole, now)).toBe(i);
    }
  });
});
