import { describe, expect, it } from "vitest";
import { isMember, mergeNotice } from "./auth";

const user = (is_guest: boolean) => ({ id: "1", username: "u", email: "e", is_guest });

describe("guest helpers", () => {
  it("only real accounts are members", () => {
    expect(isMember(null)).toBe(false);
    expect(isMember(user(true))).toBe(false);
    expect(isMember(user(false))).toBe(true);
  });

  it("describes what moved from a guest session", () => {
    const none = { scores: 0, games: 0, items: 0, coins: 0, coins_capped: 0, tokens: 0, xp: 0 };
    expect(mergeNotice(none)).toMatch(/nothing to move/);
    const m = { ...none, scores: 3, coins: 1200, tokens: 1, xp: 450, items: 2 };
    expect(mergeNotice(m)).toBe("Your guest progress moved to this account: 3 scores, 1,200 coins, 1 token, 450 XP, 2 items.");
    expect(mergeNotice({ ...m, coins_capped: 200 })).toMatch(/200 coins didn't fit under today's 1,000-coin limit/);
  });
});
