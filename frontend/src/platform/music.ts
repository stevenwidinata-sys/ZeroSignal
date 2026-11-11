/**
 * Background chiptune music, generated in code (Web Audio, no music files).
 *
 * Each track is a looped pattern of 8th-note steps with a lead, a bass and a
 * drum line. A small lookahead scheduler queues notes slightly ahead of time
 * so playback stays smooth even when the page is busy.
 */
import { audio } from "./sound";

export type TrackId = "hub" | "calm" | "upbeat";

/** "-" = rest. Drums: k = kick, s = snare, h = hi-hat. */
export interface Track {
  name: string;
  bpm: number;
  lead: { wave: OscillatorType; gain: number; notes: string[] };
  bass: { wave: OscillatorType; gain: number; notes: string[] };
  drums: string[];
}

const rep = <T>(a: T[], n: number): T[] => Array.from({ length: n }, () => a).flat();

export const TRACKS: Record<TrackId, Track> = {
  // Cheerful C major loop (C - G - Am - F) for menus and the hub.
  hub: {
    name: "Insert Coin",
    bpm: 120,
    lead: {
      wave: "square",
      gain: 0.07,
      notes: [
        "E5", "G5", "C6", "G5", "E5", "G5", "C6", "-",
        "D5", "G5", "B5", "G5", "D5", "G5", "B5", "-",
        "C5", "E5", "A5", "E5", "C5", "E5", "A5", "-",
        "F5", "A5", "C6", "A5", "G5", "F5", "E5", "D5",
      ],
    },
    bass: {
      wave: "triangle",
      gain: 0.16,
      notes: [
        ...rep(["C3", "-", "C4", "-"], 2),
        ...rep(["G2", "-", "G3", "-"], 2),
        ...rep(["A2", "-", "A3", "-"], 2),
        ...rep(["F2", "-", "F3", "-"], 2),
      ],
    },
    drums: rep(["k", "h", "s", "h", "k", "h", "s", "h"], 4),
  },
  // Gentle A minor loop (Am - F - C - G) for thinking games.
  calm: {
    name: "Quiet Board",
    bpm: 84,
    lead: {
      wave: "triangle",
      gain: 0.12,
      notes: [
        "A4", "-", "C5", "-", "E5", "-", "D5", "-",
        "C5", "-", "A4", "-", "F4", "-", "A4", "-",
        "G4", "-", "C5", "-", "E5", "-", "G5", "-",
        "D5", "-", "B4", "-", "G4", "-", "-", "-",
      ],
    },
    bass: {
      wave: "sine",
      gain: 0.2,
      notes: [
        "A2", "-", "-", "-", "E3", "-", "-", "-",
        "F2", "-", "-", "-", "C3", "-", "-", "-",
        "C3", "-", "-", "-", "G3", "-", "-", "-",
        "G2", "-", "-", "-", "D3", "-", "-", "-",
      ],
    },
    drums: rep(["k", "-", "-", "-", "h", "-", "-", "-"], 4),
  },
  // Fast E minor loop (Em - Em - C - B) for Angry Bird.
  upbeat: {
    name: "Slingshot Rush",
    bpm: 150,
    lead: {
      wave: "square",
      gain: 0.06,
      notes: [
        "E5", "E5", "G5", "E5", "B5", "A5", "G5", "F#5",
        "E5", "-", "E5", "G5", "A5", "G5", "E5", "D5",
        "C5", "C5", "E5", "C5", "G5", "F#5", "E5", "D5",
        "B4", "-", "D#5", "F#5", "B5", "A5", "F#5", "D#5",
      ],
    },
    bass: {
      wave: "square",
      gain: 0.07,
      notes: [
        ...rep(["E2", "E3"], 8),
        ...rep(["C2", "C3"], 4),
        ...rep(["B1", "B2"], 4),
      ],
    },
    drums: rep(["k", "h", "s", "h", "k", "k", "s", "h"], 4),
  },
};

const SEMITONES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "A4" -> 440 Hz. Supports sharps ("F#5"). Returns null for rests/invalid. */
export function noteFreq(note: string): number | null {
  const m = /^([A-G])(#?)(\d)$/.exec(note);
  if (!m) return null;
  const midi = 12 * (Number(m[3]) + 1) + SEMITONES[m[1]] + (m[2] ? 1 : 0);
  return 440 * 2 ** ((midi - 69) / 12);
}

/** Which track fits a page. */
export function trackForPath(pathname: string): TrackId {
  if (pathname.startsWith("/play/angry-bird") || pathname.startsWith("/play/whack-a-mole")) return "upbeat";
  if (pathname.startsWith("/play/")) return "calm";
  return "hub";
}

// ---------------------------------------------------------------------------
// Playback
// ---------------------------------------------------------------------------

const LOOKAHEAD_S = 0.15;
const TICK_MS = 40;

let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let current: TrackId | null = null;
let timer: number | null = null;
let step = 0;
let nextAt = 0;
let level = 0.4;

function out(ac: AudioContext): GainNode {
  if (!master) {
    master = ac.createGain();
    master.gain.value = level;
    master.connect(ac.destination);
  }
  return master;
}

function noiseBuffer(ac: AudioContext): AudioBuffer {
  if (!noise) {
    noise = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.25), ac.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noise;
}

function tone(ac: AudioContext, wave: OscillatorType, freq: number, at: number, dur: number, gain: number) {
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = wave;
  o.frequency.setValueAtTime(freq, at);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(out(ac));
  o.start(at);
  o.stop(at + dur + 0.02);
}

function drum(ac: AudioContext, kind: string, at: number) {
  if (kind === "k") {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.frequency.setValueAtTime(150, at);
    o.frequency.exponentialRampToValueAtTime(45, at + 0.12);
    g.gain.setValueAtTime(0.35, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.14);
    o.connect(g).connect(out(ac));
    o.start(at);
    o.stop(at + 0.16);
    return;
  }
  if (kind !== "s" && kind !== "h") return;
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac);
  const f = ac.createBiquadFilter();
  f.type = "highpass";
  f.frequency.value = kind === "h" ? 7000 : 1500;
  const g = ac.createGain();
  const dur = kind === "h" ? 0.04 : 0.12;
  g.gain.setValueAtTime(kind === "h" ? 0.06 : 0.14, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(f).connect(g).connect(out(ac));
  src.start(at);
  src.stop(at + dur + 0.02);
}

function schedule() {
  const ac = audio();
  if (!ac || !current) return;
  const t = TRACKS[current];
  const stepS = 60 / t.bpm / 2;
  const len = t.lead.notes.length;
  if (nextAt < ac.currentTime) nextAt = ac.currentTime + 0.05;
  while (nextAt < ac.currentTime + LOOKAHEAD_S) {
    const i = step % len;
    const lead = noteFreq(t.lead.notes[i]);
    if (lead) tone(ac, t.lead.wave, lead, nextAt, stepS * 0.9, t.lead.gain);
    const bass = noteFreq(t.bass.notes[i]);
    if (bass) tone(ac, t.bass.wave, bass, nextAt, stepS * (t.bpm < 100 ? 3.5 : 0.95), t.bass.gain);
    drum(ac, t.drums[i], nextAt);
    nextAt += stepS;
    step++;
  }
}

/** Switch to a track (null = silence). Safe to call repeatedly. */
export function playTrack(id: TrackId | null): void {
  if (id === current) return;
  if (timer !== null) window.clearInterval(timer);
  timer = null;
  current = id;
  step = 0;
  nextAt = 0;
  if (!id || !audio()) return;
  schedule();
  timer = window.setInterval(schedule, TICK_MS);
}

/** Music volume, 0..1 (separate from sound effects). */
export function setMusicVolume(v: number): void {
  level = Math.min(1, Math.max(0, v));
  const ac = audio();
  if (master && ac) master.gain.setTargetAtTime(level, ac.currentTime, 0.05);
}

export function currentTrack(): TrackId | null {
  return current;
}
