import { describe, expect, it } from "vitest";
import { KEYMAPS, actionFor, canBind, conflicts, keysFor, resetGame, withKeys } from "./keymap";

describe("keymap", () => {
  it("defaults have no clashes in any game", () => {
    for (const m of KEYMAPS) expect(conflicts(m.gameId, {})).toEqual([]);
  });

  it("Whack-a-Mole 3×3 and 4×4 keys are separate contexts", () => {
    expect(actionFor("whack-a-mole", "KeyQ", {}, "3")).toBe("hole1");
    expect(actionFor("whack-a-mole", "KeyQ", {}, "4")).toBe("big5");
    expect(actionFor("whack-a-mole", "KeyP", {}, "4")).toBe("pause");
  });

  it("changing keys replaces the defaults and resets cleanly", () => {
    let o = withKeys("2048", "up", ["KeyI"], {});
    expect(keysFor("2048", "up", o)).toEqual(["KeyI"]);
    expect(actionFor("2048", "KeyI", o)).toBe("up");
    expect(actionFor("2048", "ArrowUp", o)).toBeNull();
    // Setting the defaults again drops the override.
    o = withKeys("2048", "up", ["ArrowUp", "KeyW"], o);
    expect(o).toEqual({});
    o = withKeys("2048", "up", ["KeyI"], withKeys("minefield", "flag", ["KeyG"], {}));
    expect(resetGame("2048", o)).toEqual({ "minefield.flag": ["KeyG"] });
  });

  it("finds clashes", () => {
    const o = withKeys("2048", "undo", ["KeyW"], {});
    expect(conflicts("2048", o)).toEqual([{ key: "KeyW", actions: ["Slide up", "Undo"] }]);
  });

  it("Tab and Esc can't be bound", () => {
    expect(canBind("Tab")).toBe(false);
    expect(canBind("Escape")).toBe(false);
    expect(canBind("KeyJ")).toBe(true);
  });
});
