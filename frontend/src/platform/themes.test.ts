import { describe, expect, it } from "vitest";
import { THEMES, contrast, findTheme, themeCss, themeVars } from "./themes";

describe("mood themes", () => {
  it("has 10 themes with unique ids, in light/dark pairs", () => {
    expect(THEMES).toHaveLength(10);
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(10);
    for (const t of THEMES) {
      const p = findTheme(t.pair)!;
      expect(p, t.id).toBeDefined();
      expect(p.pair).toBe(t.id);
      expect(p.scheme).not.toBe(t.scheme);
    }
  });

  it("keeps text readable (WCAG AA 4.5:1)", () => {
    for (const t of THEMES) {
      const k = t.tokens;
      const v = themeVars(t);
      for (const [fg, bg, what] of [
        [k.ink, k.bg, "ink on bg"],
        [k.ink, k.surface, "ink on surface"],
        [k.muted, k.bg, "muted on bg"],
        [k.muted, k.surface, "muted on surface"],
        [k.onYellow, v["--yellow"], "button text on yellow"],
      ] as const) {
        expect(contrast(fg, bg), `${t.name}: ${what}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("generates one CSS rule per theme with every token", () => {
    const css = themeCss();
    for (const t of THEMES) expect(css).toContain(`[data-theme="${t.id}"]`);
    expect(Object.keys(themeVars(THEMES[0]))).toHaveLength(17);
  });

  it("the default themes match the original dark and light colors", () => {
    expect(findTheme("dark")!.tokens.bg).toBe("#0b0e1f");
    expect(findTheme("light")!.tokens.bg).toBe("#fff7e0");
  });
});
