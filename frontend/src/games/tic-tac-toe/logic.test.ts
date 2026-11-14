import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { BOARDS, FACES, findByKey, opponentFace } from "./items";
import { type Game, newGame, play, seriesState, toMove } from "./logic";

function from(moves: string): Game {
  let g = newGame();
  for (const ch of moves) {
    const next = play(g, Number(ch));
    if (!next) throw new Error(`illegal ${ch} in ${moves}`);
    g = next;
  }
  return g;
}

// Same positions as backend/src/tic_tac_toe/board.rs.
describe("tic-tac-toe rules", () => {
  it("detects wins for both players and draws", () => {
    expect(from("03142").outcome).toEqual({ kind: "win", winner: 1 });
    expect(from("03142").line).toEqual([0, 1, 2]);
    expect(from("021486").outcome).toEqual({ kind: "win", winner: 2 });
    expect(from("014352687").outcome).toEqual({ kind: "draw" });
    expect(toMove(from("4"))).toBe(2);
  });

  it("rejects illegal moves without changing the game", () => {
    const g = from("4");
    expect(play(g, 4)).toBeNull();
    expect(play(g, 9)).toBeNull();
    expect(play(from("03142"), 8)).toBeNull();
    expect(g.moves).toEqual([4]);
  });
});

describe("tic-tac-toe series (matches the server)", () => {
  it("ends early when decided and counts draws as games", () => {
    expect(seriesState(3, 2, 0, 0)).toBe("p1");
    expect(seriesState(3, 1, 0, 1)).toBe("ongoing");
    expect(seriesState(3, 0, 0, 3)).toBe("drawn");
    expect(seriesState(5, 0, 3, 0)).toBe("p2");
    expect(seriesState(5, 1, 1, 3)).toBe("drawn");
  });
});

describe("boards and faces", () => {
  it("match the backend's shared catalog", () => {
    const json = JSON.parse(readFileSync(resolve(__dirname, "../../../../shared/tic_tac_toe_items.json"), "utf8"));
    expect(BOARDS.map((b) => b.id)).toEqual(json.boards.map((b: { id: string }) => b.id));
    expect(FACES.length).toBeGreaterThanOrEqual(18);
    expect(FACES.filter((f) => f.price === null).map((f) => f.id)).toEqual([
      "x", "o", "photo", "avatar", "star", "heart", "strawberry", "watermelon", "panda", "frog",
    ]);
  });

  it("resolves spin keys and never gives both sides the same face", () => {
    expect(findByKey("face:pig")?.item.name).toBe("Piggy");
    expect(findByKey("board:neon")?.kind).toBe("board");
    expect(findByKey("hat:pig")).toBeNull();
    for (const f of FACES) expect(opponentFace(f.id)).not.toBe(f.id);
  });
});
