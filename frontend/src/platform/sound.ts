import { useSettings } from "../store/settings";

/**
 * Tiny synthesized sound effects (Web Audio API, no audio files).
 * Every effect respects the user's sound on/off + volume settings.
 */
export type Sfx = "click" | "drop" | "land" | "tick" | "win" | "lose" | "draw" | "spin" | "reward";

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
  reward: [
    { freq: 784, at: 0, dur: 0.1, type: "triangle", gain: 0.3 },
    { freq: 988, at: 0.1, dur: 0.1, type: "triangle", gain: 0.3 },
    { freq: 1319, at: 0.2, dur: 0.1, type: "triangle", gain: 0.3 },
    { freq: 1568, at: 0.3, dur: 0.45, type: "triangle", gain: 0.3 },
  ],
};

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
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
