import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import Chip from "../games/connect-four/Chip";
import { SKINS } from "../games/connect-four/skins";
import Piece from "../games/tic-tac-toe/Piece";
import { SAFE, SAFE_O, SAFE_X, safeSkin } from "./colorblind";

// Static rendering reads a store's initial state, so drive the hook directly.
const mode = vi.hoisted(() => ({ on: false }));
vi.mock("./colorblind", async (orig) => ({
  ...(await orig<typeof import("./colorblind")>()),
  useColorblind: () => mode.on,
}));

afterEach(() => {
  mode.on = false;
});

describe("colorblind palette", () => {
  it("uses 5 different safe colors", () => {
    const colors = Object.values(SAFE).map((c) => c.color);
    expect(new Set(colors).size).toBe(5);
    expect(SAFE_X).not.toBe(SAFE_O);
  });

  it("maps every plain-color skin and leaves themed skins alone", () => {
    const plain = ["red", "blue", "green", "purple", "golden"];
    for (const s of SKINS) {
      if (plain.includes(s.id)) expect(safeSkin(s.id), s.id).not.toBeNull();
      else expect(safeSkin(s.id), s.id).toBeNull();
    }
    const mapped = plain.map((id) => safeSkin(id)!.color);
    expect(new Set(mapped).size).toBe(plain.length);
  });
});

describe("shapes on pieces", () => {
  it("adds no marks when the switch is off", () => {
    expect(renderToStaticMarkup(<Chip skin="red" mark={1} />)).not.toContain("c4-mark");
    expect(renderToStaticMarkup(<Piece face="cool" mark={2} />)).not.toContain("ttt-mark");
  });

  it("marks Connect Four chips: player 1 circle, player 2 cross", () => {
    mode.on = true;
    expect(renderToStaticMarkup(<Chip skin="red" mark={1} />)).toContain("c4-mark-1");
    expect(renderToStaticMarkup(<Chip skin="pig" mark={2} />)).toContain("c4-mark-2");
    // Swatches without an owner (shop, wheel) stay clean.
    expect(renderToStaticMarkup(<Chip skin="red" />)).not.toContain("c4-mark");
    expect(renderToStaticMarkup(<Chip skin="red" mark={1} />)).toContain(SAFE.vermillion.color);
  });

  it("badges non-X/O Tic-Tac-Toe faces and recolors X/O", () => {
    mode.on = true;
    expect(renderToStaticMarkup(<Piece face="cool" mark={2} />)).toContain("ttt-mark-2");
    const x = renderToStaticMarkup(<Piece face="x" mark={1} />);
    expect(x).not.toContain("ttt-mark");
    expect(x).toContain(SAFE_X);
  });
});
