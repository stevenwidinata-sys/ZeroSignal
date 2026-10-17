/**
 * Client-side Connect Four rules for local 2-player games (no points, so no
 * server needed). AI games are played on the server instead.
 * Layout matches the API: cells[col][row], row 0 = bottom; 0 empty, 1 / 2.
 */
export const COLS = 7;
export const ROWS = 6;

export type Cell = 0 | 1 | 2;
export type Cells = Cell[][];
export type Outcome =
  | { kind: "ongoing" }
  | { kind: "win"; winner: 1 | 2 }
  | { kind: "draw" };

export interface Game {
  cells: Cells;
  moves: number[];
  outcome: Outcome;
  winningCells: [number, number][];
}

export function emptyCells(): Cells {
  return Array.from({ length: COLS }, () => Array<Cell>(ROWS).fill(0));
}

export function newGame(): Game {
  return { cells: emptyCells(), moves: [], outcome: { kind: "ongoing" }, winningCells: [] };
}

export function toMove(g: Game): 1 | 2 {
  return g.moves.length % 2 === 0 ? 1 : 2;
}

export function canPlay(cells: Cells, col: number): boolean {
  return col >= 0 && col < COLS && cells[col][ROWS - 1] === 0;
}

export function legalColumns(g: Game): number[] {
  if (g.outcome.kind !== "ongoing") return [];
  return [...Array(COLS).keys()].filter((c) => canPlay(g.cells, c));
}

/** Row a chip would land in, or -1 if the column is full. */
export function landingRow(cells: Cells, col: number): number {
  return cells[col].indexOf(0);
}

const DIRS: [number, number][] = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];

/** All cells that are part of a 4-in-a-row for `p`. */
export function findLines(cells: Cells, p: 1 | 2): [number, number][] {
  const out: [number, number][] = [];
  const at = (c: number, r: number) => c >= 0 && c < COLS && r >= 0 && r < ROWS && cells[c][r] === p;
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      for (const [dc, dr] of DIRS) {
        if ([0, 1, 2, 3].every((i) => at(c + dc * i, r + dr * i))) {
          for (let i = 0; i < 4; i++) {
            const cell: [number, number] = [c + dc * i, r + dr * i];
            if (!out.some(([x, y]) => x === cell[0] && y === cell[1])) out.push(cell);
          }
        }
      }
    }
  }
  return out;
}

/** Returns a new game with the move applied, or null if illegal. */
export function play(g: Game, col: number): Game | null {
  if (g.outcome.kind !== "ongoing" || !canPlay(g.cells, col)) return null;
  const p = toMove(g);
  const cells = g.cells.map((column) => [...column]) as Cells;
  cells[col][landingRow(cells, col)] = p;
  const moves = [...g.moves, col];
  const lines = findLines(cells, p);
  let outcome: Outcome = { kind: "ongoing" };
  if (lines.length) outcome = { kind: "win", winner: p };
  else if (moves.length === COLS * ROWS) outcome = { kind: "draw" };
  return { cells, moves, outcome, winningCells: lines };
}

export function randomColumn(g: Game, rand: () => number = Math.random): number | null {
  const legal = legalColumns(g);
  if (!legal.length) return null;
  return legal[Math.floor(rand() * legal.length)];
}

/** Best-of series score. Draws don't count, like the server. */
export interface Series {
  bestOf: 3 | 5;
  wins: [number, number];
  draws: number;
}

export function seriesWinner(s: Series): 1 | 2 | null {
  const need = Math.floor(s.bestOf / 2) + 1;
  if (s.wins[0] >= need) return 1;
  if (s.wins[1] >= need) return 2;
  return null;
}

export function recordResult(s: Series, o: Outcome): Series {
  if (o.kind === "ongoing") return s;
  if (o.kind === "draw") return { ...s, draws: s.draws + 1 };
  const wins: [number, number] = [...s.wins];
  wins[o.winner - 1] += 1;
  return { ...s, wins };
}
