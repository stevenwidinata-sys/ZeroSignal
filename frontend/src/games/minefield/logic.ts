/** Pure Minefield helpers for the client (the server owns the mines). */

export const HIDDEN = -1;
export const MINE = 9;
export const EXPLODED = 10;

/** What you've marked on a hidden cell. */
export type Mark = "flag" | "question";

/** Right-click cycles: nothing → flag → ? → nothing. */
export function nextMark(m: Mark | undefined): Mark | undefined {
  if (m === undefined) return "flag";
  if (m === "flag") return "question";
  return undefined;
}

export function neighbors(i: number, rows: number, cols: number): number[] {
  const r = Math.floor(i / cols);
  const c = i % cols;
  const out: number[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nc >= 0 && nr < rows && nc < cols) out.push(nr * cols + nc);
    }
  }
  return out;
}

/** Flags placed next to cell `i` (sent with a chord). */
export function flagsAround(i: number, rows: number, cols: number, marks: Map<number, Mark>): number[] {
  return neighbors(i, rows, cols).filter((n) => marks.get(n) === "flag");
}

/** A number can be chorded when its flags match it and something is still hidden. */
export function canChord(i: number, cells: number[], rows: number, cols: number, marks: Map<number, Mark>): boolean {
  const v = cells[i];
  if (v < 1 || v > 8) return false;
  const around = neighbors(i, rows, cols);
  const flags = around.filter((n) => marks.get(n) === "flag").length;
  const hidden = around.some((n) => cells[n] === HIDDEN && marks.get(n) !== "flag");
  return flags === v && hidden;
}

/** Keyboard cursor: arrows move, stopping at the edges. */
export function moveCursor(i: number, key: string, rows: number, cols: number): number {
  const r = Math.floor(i / cols);
  const c = i % cols;
  switch (key) {
    case "ArrowUp":
      return Math.max(0, r - 1) * cols + c;
    case "ArrowDown":
      return Math.min(rows - 1, r + 1) * cols + c;
    case "ArrowLeft":
      return r * cols + Math.max(0, c - 1);
    case "ArrowRight":
      return r * cols + Math.min(cols - 1, c + 1);
    default:
      return i;
  }
}

/** Mines left to find, by your flags (can go negative, like the classic). */
export function minesLeft(total: number, marks: Map<number, Mark>): number {
  let flags = 0;
  for (const m of marks.values()) if (m === "flag") flags++;
  return total - flags;
}

/** Drop marks on cells that got opened. */
export function pruneMarks(marks: Map<number, Mark>, cells: number[]): Map<number, Mark> {
  const next = new Map<number, Mark>();
  for (const [i, m] of marks) if (cells[i] === HIDDEN) next.set(i, m);
  return next;
}

/** 3BV per second, 2 decimals. */
export function bvPerSecond(threeBv: number, timeMs: number): number {
  if (timeMs <= 0) return 0;
  return Math.round((threeBv / (timeMs / 1000)) * 100) / 100;
}

/** Click efficiency: the minimum clicks (3BV) as % of your clicks. */
export function efficiency(threeBv: number, clicks: number): number {
  return clicks <= 0 ? 0 : Math.round((threeBv / clicks) * 100);
}

/** 83_456 → "1:23.4" */
export function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 100)) / 10;
  const m = Math.floor(total / 60);
  const s = (total - m * 60).toFixed(1).padStart(4, "0");
  return m > 0 ? `${m}:${s}` : `${(total).toFixed(1)}s`;
}
