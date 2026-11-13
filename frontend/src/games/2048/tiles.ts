import type { Dir, StepResult } from "./engine";

/**
 * Tiles on screen. The engine only knows cell values; for animations every
 * tile also gets an id that follows it as it slides. Tiles that merged stay
 * one move as "ghost"s (sliding under the new tile), then disappear.
 */
export interface Tile {
  id: number;
  /** Exponent: 1 = 2, 2 = 4, ... */
  exp: number;
  /** Cell index. */
  pos: number;
  state: "idle" | "new" | "merged" | "ghost";
}

let lastId = 0;
const nextId = () => ++lastId;

/** Tiles for a board with no animation (start, continue, undo). */
export function freshTiles(cells: number[]): Tile[] {
  return cells.flatMap((exp, pos) => (exp > 0 ? [{ id: nextId(), exp, pos, state: "idle" as const }] : []));
}

/** Tiles after a slide: old tiles move, merges pop in, the new tile appears. */
export function tilesAfter(prev: Tile[], res: StepResult, cells: number[]): Tile[] {
  if (res.kind !== "move" || !res.plan) return freshTiles(cells);
  const plan = res.plan;
  const merged = new Set(plan.merged);
  const out: Tile[] = prev
    .filter((t) => t.state !== "ghost")
    .map((t) => {
      const to = plan.dest.get(t.pos) ?? t.pos;
      return { ...t, pos: to, state: merged.has(to) ? "ghost" : "idle" };
    });
  for (const d of plan.merged) out.push({ id: nextId(), exp: cells[d], pos: d, state: "merged" });
  if (res.spawned !== null) out.push({ id: nextId(), exp: cells[res.spawned], pos: res.spawned, state: "new" });
  return out;
}

/** Keyboard: arrows and WASD slide, Z undoes. */
export function keyToMove(key: string): Dir | "Z" | null {
  switch (key) {
    case "ArrowUp":
    case "w":
    case "W":
      return "U";
    case "ArrowDown":
    case "s":
    case "S":
      return "D";
    case "ArrowLeft":
    case "a":
    case "A":
      return "L";
    case "ArrowRight":
    case "d":
    case "D":
      return "R";
    case "z":
    case "Z":
      return "Z";
    default:
      return null;
  }
}

/** A swipe of at least `min` px, in its main direction. */
export function swipeDir(dx: number, dy: number, min = 24): Dir | null {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < min) return null;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "R" : "L";
  return dy > 0 ? "D" : "U";
}

/** Size class for the number on a tile (more digits = smaller text). */
export function digitsClass(value: number): string {
  const d = String(value).length;
  return `g2048-d${Math.min(Math.max(d, 2), 6)}`;
}

/** Color class for a tile: t1..t11, then one "super" look for 4096+. */
export function tileClass(exp: number): string {
  return exp > 11 ? "g2048-t-super" : `g2048-t${exp}`;
}

/** "1:05" or "1:02:03". */
export function formatPlayTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}
