/**
 * Client-side Tic-Tac-Toe rules for local 2-player games (no rewards, so no
 * server needed). AI games run on the server. Cells 0..8, row by row.
 */
export type Mark = 0 | 1 | 2;
export type Cells = Mark[];
export type Outcome = { kind: "ongoing" } | { kind: "win"; winner: 1 | 2 } | { kind: "draw" };

export const LINES: [number, number, number][] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export interface Game {
  cells: Cells;
  moves: number[];
  outcome: Outcome;
  line: [number, number, number] | null;
}

export function newGame(): Game {
  return { cells: Array<Mark>(9).fill(0), moves: [], outcome: { kind: "ongoing" }, line: null };
}

export function toMove(g: Game): 1 | 2 {
  return g.moves.length % 2 === 0 ? 1 : 2;
}

export function lineOf(cells: Cells, p: 1 | 2): [number, number, number] | null {
  return LINES.find((l) => l.every((i) => cells[i] === p)) ?? null;
}

export function play(g: Game, cell: number): Game | null {
  if (g.outcome.kind !== "ongoing" || cell < 0 || cell > 8 || g.cells[cell] !== 0) return null;
  const p = toMove(g);
  const cells = [...g.cells];
  cells[cell] = p;
  const moves = [...g.moves, cell];
  const line = lineOf(cells, p);
  const outcome: Outcome = line ? { kind: "win", winner: p } : moves.length === 9 ? { kind: "draw" } : { kind: "ongoing" };
  return { cells, moves, outcome, line };
}

export function emptyCells(cells: Cells): number[] {
  return cells.flatMap((c, i) => (c === 0 ? [i] : []));
}

/** Same rule as the server: a series is exactly `bestOf` games (draws
 * count), ending early once one side can't be caught. */
export type SeriesState = "ongoing" | "p1" | "p2" | "drawn";

export function seriesState(bestOf: number, w1: number, w2: number, draws: number): SeriesState {
  const remaining = Math.max(0, bestOf - w1 - w2 - draws);
  if (w1 > w2 + remaining) return "p1";
  if (w2 > w1 + remaining) return "p2";
  if (remaining === 0) return "drawn";
  return "ongoing";
}
