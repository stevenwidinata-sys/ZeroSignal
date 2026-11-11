import { describe, expect, it } from "vitest";
import { linkNeedsConfirm, useLeaveGuard } from "./leaveGuard";

describe("leave guard", () => {
  it("only same-site page links to another page ask first", () => {
    expect(linkNeedsConfirm("/leaderboard/minefield", null, "/play/minefield")).toBe(true);
    expect(linkNeedsConfirm("/play/minefield", null, "/play/minefield")).toBe(false);
    expect(linkNeedsConfirm("/play/minefield#top", null, "/play/minefield")).toBe(false);
    expect(linkNeedsConfirm("https://github.com", null, "/")).toBe(false);
    expect(linkNeedsConfirm("//evil.example", null, "/")).toBe(false);
    expect(linkNeedsConfirm("/shop", "_blank", "/")).toBe(false);
    expect(linkNeedsConfirm(null, null, "/")).toBe(false);
  });

  it("tracks active guards without duplicates", () => {
    const g = useLeaveGuard.getState();
    g.add("a");
    g.add("a");
    g.add("b");
    expect(useLeaveGuard.getState().active).toEqual(["a", "b"]);
    g.remove("a");
    g.remove("b");
    expect(useLeaveGuard.getState().active).toEqual([]);
  });
});
