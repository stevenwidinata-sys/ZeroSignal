import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Avatar, { drawItem, shade } from "./Avatar";
import { ITEMS, defaultLoadout } from "./catalog";

const ctx = { skin: "#f1c27d", hair: "#6b3e1f", uid: "t" };

describe("avatar renderer", () => {
  it("draws every catalog item (except explicit 'none' options)", () => {
    const missing = ITEMS.filter((i) => i.art.shape !== "none" && drawItem(i, ctx) == null).map((i) => i.id);
    expect(missing).toEqual([]);
  });

  it("renders a full outfit with every item without crashing", () => {
    for (const it of ITEMS) {
      const html = renderToStaticMarkup(<Avatar loadout={{ ...defaultLoadout(), [it.slot]: it.id }} />);
      expect(html.startsWith("<svg"), it.id).toBe(true);
    }
  });

  it("supports a head-only crop for small chips", () => {
    const html = renderToStaticMarkup(<Avatar loadout={null} crop="head" size={32} label="me" />);
    expect(html).toContain('viewBox="14 -4 36 36"');
    expect(html).toContain('aria-label="me"');
  });

  it("shades colors in both directions", () => {
    expect(shade("#808080", 0)).toBe("#808080");
    expect(shade("#000000", 0.5)).toBe("#808080");
    expect(shade("#ffffff", -0.5)).toBe("#808080");
  });
});
