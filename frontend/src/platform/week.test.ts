import { describe, expect, it } from "vitest";
import { formatCountdown, nextWeekReset } from "./week";

describe("leaderboard weeks", () => {
  it("resets at Monday 00:00 WIB (Sunday 17:00 UTC)", () => {
    const reset = new Date("2026-11-15T17:00:00Z");
    expect(nextWeekReset(new Date("2026-11-11T09:00:00Z"))).toEqual(reset); // Wednesday
    expect(nextWeekReset(new Date("2026-11-08T17:00:00Z"))).toEqual(reset); // the very start of the week
    expect(nextWeekReset(new Date("2026-11-15T16:59:59Z"))).toEqual(reset); // last second
    expect(nextWeekReset(new Date("2026-11-15T17:00:00Z"))).toEqual(new Date("2026-11-22T17:00:00Z"));
  });

  it("formats countdowns", () => {
    expect(formatCountdown(3 * 86_400_000 + 4 * 3_600_000 + 59_000)).toBe("3d 4h");
    expect(formatCountdown(5 * 3_600_000 + 12 * 60_000)).toBe("5h 12m");
    expect(formatCountdown(9 * 60_000 + 30_000)).toBe("9m");
    expect(formatCountdown(-5)).toBe("0m");
  });
});
