import { useSettings } from "../store/settings";

/**
 * Tiny synthesized sound effects (Web Audio API, no audio files).
 * Every effect respects the user's sound on/off + volume settings.
 */
export type Sfx =
  | "click"
  | "drop"
  | "land"
  | "tick"
  | "win"
  | "lose"
  | "draw"
  | "spin"
  | "reward"
  | "bonk"
  | "clank"
  | "boom"
  | "whiff"
  | "golden"
  | "fever"
  | "squeak"
  | "clang"
  | "splash"
  | "zap"
  | "chime"
  | "slide"
  | "merge";

interface Note {
  /** Hz at start (and optional end, for slides). */
  freq: number;
  to?: number;
  /** Seconds after trigger. */
  at: number;
  dur: number;
  type: OscillatorType;
  gain: number;
}

/** Note recipes. Exported for tests. */
export const RECIPES: Record<Sfx, Note[]> = {
  click: [{ freq: 660, at: 0, dur: 0.05, type: "square", gain: 0.25 }],
  drop: [{ freq: 520, to: 180, at: 0, dur: 0.18, type: "triangle", gain: 0.35 }],
  land: [{ freq: 140, to: 70, at: 0, dur: 0.12, type: "square", gain: 0.35 }],
  tick: [{ freq: 1200, at: 0, dur: 0.03, type: "square", gain: 0.15 }],
  win: [
    { freq: 523, at: 0, dur: 0.12, type: "square", gain: 0.3 },
    { freq: 659, at: 0.12, dur: 0.12, type: "square", gain: 0.3 },
    { freq: 784, at: 0.24, dur: 0.12, type: "square", gain: 0.3 },
    { freq: 1047, at: 0.36, dur: 0.3, type: "square", gain: 0.3 },
  ],
  lose: [
    { freq: 392, at: 0, dur: 0.18, type: "sawtooth", gain: 0.25 },
    { freq: 330, at: 0.18, dur: 0.18, type: "sawtooth", gain: 0.25 },
    { freq: 262, to: 196, at: 0.36, dur: 0.4, type: "sawtooth", gain: 0.25 },
  ],
  draw: [
    { freq: 440, at: 0, dur: 0.15, type: "triangle", gain: 0.3 },
    { freq: 440, at: 0.2, dur: 0.15, type: "triangle", gain: 0.3 },
  ],
  spin: [{ freq: 900, at: 0, dur: 0.025, type: "square", gain: 0.12 }],
  // Whack-a-Mole
  bonk: [
    { freq: 320, to: 120, at: 0, dur: 0.09, type: "square", gain: 0.35 },
    { freq: 880, at: 0.02, dur: 0.04, type: "triangle", gain: 0.15 },
  ],
  clank: [
    { freq: 1400, to: 1100, at: 0, dur: 0.08, type: "square", gain: 0.2 },
    { freq: 2100, at: 0.01, dur: 0.06, type: "triangle", gain: 0.12 },
  ],
  boom: [{ freq: 160, to: 40, at: 0, dur: 0.35, type: "sawtooth", gain: 0.35 }],
  whiff: [{ freq: 260, to: 200, at: 0, dur: 0.06, type: "triangle", gain: 0.12 }],
  golden: [
    { freq: 1047, at: 0, dur: 0.07, type: "square", gain: 0.22 },
    { freq: 1319, at: 0.07, dur: 0.07, type: "square", gain: 0.22 },
    { freq: 2093, at: 0.14, dur: 0.16, type: "square", gain: 0.22 },
  ],
  squeak: [
    { freq: 900, to: 1500, at: 0, dur: 0.07, type: "sine", gain: 0.3 },
    { freq: 1500, to: 1100, at: 0.07, dur: 0.06, type: "sine", gain: 0.25 },
  ],
  clang: [
    { freq: 620, at: 0, dur: 0.22, type: "square", gain: 0.18 },
    { freq: 1245, at: 0, dur: 0.18, type: "triangle", gain: 0.14 },
  ],
  splash: [
    { freq: 420, to: 140, at: 0, dur: 0.14, type: "sawtooth", gain: 0.16 },
    { freq: 700, to: 300, at: 0.03, dur: 0.1, type: "triangle", gain: 0.14 },
  ],
  zap: [{ freq: 1800, to: 300, at: 0, dur: 0.12, type: "square", gain: 0.18 }],
  chime: [
    { freq: 1319, at: 0, dur: 0.12, type: "triangle", gain: 0.25 },
    { freq: 1976, at: 0.05, dur: 0.16, type: "triangle", gain: 0.2 },
  ],
  // 2048
  slide: [{ freq: 300, to: 240, at: 0, dur: 0.05, type: "triangle", gain: 0.12 }],
  merge: [
    { freq: 520, to: 780, at: 0, dur: 0.07, type: "square", gain: 0.18 },
    { freq: 1040, at: 0.05, dur: 0.06, type: "triangle", gain: 0.14 },
  ],
  fever: [
    { freq: 523, to: 1047, at: 0, dur: 0.25, type: "sawtooth", gain: 0.2 },
    { freq: 784, to: 1568, at: 0.1, dur: 0.25, type: "square", gain: 0.15 },
  ],
  reward: [
    { freq: 784, at: 0, dur: 0.1, type: "triangle", gain: 0.3 },
    { freq: 988, at: 0.1, dur: 0.1, type: "triangle", gain: 0.3 },
    { freq: 1319, at: 0.2, dur: 0.1, type: "triangle", gain: 0.3 },
    { freq: 1568, at: 0.3, dur: 0.45, type: "triangle", gain: 0.3 },
  ],
};

let ctx: AudioContext | null = null;

/** The shared audio context (music uses it too). Null when unsupported. */
export function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx ??= new Ctor();
  // Browsers start contexts suspended until a user gesture.
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function playSfx(name: Sfx): void {
  const { sound, volume } = useSettings.getState();
  if (!sound || volume <= 0) return;
  const ac = audio();
  if (!ac) return;

  const t0 = ac.currentTime;
  for (const n of RECIPES[name]) {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = n.type;
    osc.frequency.setValueAtTime(n.freq, t0 + n.at);
    if (n.to) osc.frequency.exponentialRampToValueAtTime(n.to, t0 + n.at + n.dur);
    const peak = n.gain * volume;
    g.gain.setValueAtTime(0.0001, t0 + n.at);
    g.gain.exponentialRampToValueAtTime(peak, t0 + n.at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + n.at + n.dur);
    osc.connect(g).connect(ac.destination);
    osc.start(t0 + n.at);
    osc.stop(t0 + n.at + n.dur + 0.02);
  }
}
