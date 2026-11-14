import { describe, expect, it } from "vitest";
import { RECIPES } from "../../platform/sound";
import { HAMMERS, THEMES, findHammer, findTheme, hammerCursor, itemName, themeStyle } from "./items";

describe("whack-a-mole items", () => {
  it("catalog has unique ids and four free items per list (the first is the default)", () => {
    for (const list of [HAMMERS, THEMES]) {
      expect(new Set(list.map((i) => i.id)).size).toBe(list.length);
      expect(list.filter((i) => i.price === null)).toHaveLength(4);
      expect(list[0].price).toBeNull();
    }
  });

  it("every hammer sound exists", () => {
    for (const h of HAMMERS) expect(RECIPES[h.art.sound], h.id).toBeTruthy();
  });

  it("falls back to the free item for unknown ids", () => {
    expect(findHammer("nope").id).toBe("mallet");
    expect(findTheme("nope").id).toBe("garden");
  });

  it("builds a cursor and theme variables", () => {
    expect(hammerCursor(findHammer("pan").art)).toMatch(/^url\("data:image\/svg\+xml,/);
    expect(themeStyle(findTheme("space").art)).toMatchObject({ "--wam-board": "#1a0b33" });
    expect(itemName("hammer:pan")).toBe("Frying Pan");
    expect(itemName("theme:space")).toBe("Deep Space");
  });
});
