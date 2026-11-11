import { describe, expect, it } from "vitest";
import { boardLabel, sumBoards, winRate } from "./statsLogic";

describe("stats helpers", () => {
  it("win rate", () => {
    expect(winRate(0, 0)).toBe(0);
    expect(winRate(1, 3)).toBe(33);
    expect(winRate(2, 3)).toBe(67);
  });

  it("board labels come from the game registry", () => {
    expect(boardLabel("whack-a-mole", 2)).toContain("Frenzy");
    expect(boardLabel("minefield", 3)).toContain("Expert");
    expect(boardLabel("angry-bird", 1)).toBe("Level 1");
  });

  it("sums a game's boards with a weighted average", () => {
    const boards = [
      { game_id: "whack-a-mole", level: 1, rounds: 1, best: 100, average: 100 },
      { game_id: "whack-a-mole", level: 2, rounds: 3, best: 900, average: 500 },
      { game_id: "angry-bird", level: 1, rounds: 9, best: 99_999, average: 1 },
    ];
    expect(sumBoards(boards, "whack-a-mole")).toEqual({ rounds: 4, best: 900, average: 400 });
    expect(sumBoards(boards, "minefield")).toEqual({ rounds: 0, best: 0, average: 0 });
  });
});
