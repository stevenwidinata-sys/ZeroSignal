import { describe, expect, it } from "vitest";
import { isWorthShowing } from "./wallet";

const base = { coins: 0, tokens: 0, xp: 0, coins_capped: 0, level_before: 1, level_after: 1 };

describe("reward toast", () => {
  it("hides empty or missing rewards", () => {
    expect(isWorthShowing(null)).toBe(false);
    expect(isWorthShowing(undefined)).toBe(false);
    expect(isWorthShowing(base)).toBe(false);
  });

  it("shows any payout, and a capped payout so players know why", () => {
    expect(isWorthShowing({ ...base, xp: 5 })).toBe(true);
    expect(isWorthShowing({ ...base, tokens: 1 })).toBe(true);
    expect(isWorthShowing({ ...base, coins_capped: 10 })).toBe(true);
  });
});
