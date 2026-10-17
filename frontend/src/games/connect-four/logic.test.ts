import { describe, expect, it } from "vitest";
import {
  COLS,
  ROWS,
  type Game,
  legalColumns,
  newGame,
  play,
  randomColumn,
  recordResult,
  seriesWinner,
  toMove,
} from "./logic";

function from(moves: string): Game {
  let g = newGame();
  for (const ch of moves) {
    const next = play(g, Number(ch));
    if (!next) throw new Error(`illegal move ${ch} in ${moves}`);
    g = next;
  }
  return g;
}

const sorted = (cells: [number, number][]) =>
  [...cells].sort((a, b) => a[0] - b[0] || a[1] - b[1]);

// Same positions as the Rust tests in backend/src/connect_four/board.rs.
describe("connect four rules", () => {
  it("starts empty with player 1 to move", () => {
    const g = newGame();
    expect(toMove(g)).toBe(1);
    expect(legalColumns(g)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("detects vertical, horizontal and both diagonal wins", () => {
    const v = from("3434343");
    expect(v.outcome).toEqual({ kind: "win", winner: 1 });
    expect(sorted(v.winningCells)).toEqual([[3, 0], [3, 1], [3, 2], [3, 3]]);
    expect(from("0011223").outcome).toEqual({ kind: "win", winner: 1 });
    expect(sorted(from("01126223333").winningCells)).toEqual([[0, 0], [1, 1], [2, 2], [3, 3]]);
    expect(sorted(from("65540443333").winningCells)).toEqual([[3, 3], [4, 2], [5, 1], [6, 0]]);
  });

  it("lets player 2 win", () => {
    expect(from("10201020").outcome).toEqual({ kind: "win", winner: 2 });
  });

  it("detects a draw on a full board", () => {
    const g = from("022002200220133113311331466446644664555555");
    expect(g.moves).toHaveLength(COLS * ROWS);
    expect(g.outcome).toEqual({ kind: "draw" });
    expect(legalColumns(g)).toEqual([]);
  });

  it("rejects illegal moves", () => {
    expect(play(from("000000"), 0)).toBeNull();
    expect(play(newGame(), 7)).toBeNull();
    expect(play(from("3434343"), 0)).toBeNull();
  });

  it("does not mutate the previous game", () => {
    const a = from("3");
    play(a, 3);
    expect(a.cells[3]).toEqual([1, 0, 0, 0, 0, 0]);
  });

  it("random column is always legal", () => {
    const g = from("000000");
    for (let i = 0; i < 20; i++) expect(randomColumn(g)).not.toBe(0);
    expect(randomColumn(from("3434343"))).toBeNull();
  });
});

describe("best-of series", () => {
  it("needs a majority and ignores draws", () => {
    let s = { bestOf: 3 as const, wins: [0, 0] as [number, number], draws: 0 };
    s = recordResult(s, { kind: "draw" });
    s = recordResult(s, { kind: "win", winner: 2 });
    expect(seriesWinner(s)).toBeNull();
    s = recordResult(s, { kind: "win", winner: 2 });
    expect(seriesWinner(s)).toBe(2);
    expect(s.draws).toBe(1);
    expect(ROWS).toBe(6);
  });

  it("best of 5 needs three wins", () => {
    let s = { bestOf: 5 as const, wins: [2, 0] as [number, number], draws: 0 };
    expect(seriesWinner(s)).toBeNull();
    s = recordResult(s, { kind: "win", winner: 1 });
    expect(seriesWinner(s)).toBe(1);
  });
});
