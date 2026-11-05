import { describe, expect, it } from "vitest";
import type { LoginStatus } from "../api/types";
import { shouldPrompt } from "./dailyLogin";

const status = (claimed_today: boolean): LoginStatus => ({
  claimed_today,
  streak_day: 3,
  rewards: [],
  next_reset: "2026-11-06T17:00:00Z",
});

describe("daily login pop-up", () => {
  it("shows when today's reward is unclaimed", () => {
    expect(shouldPrompt(status(false), false)).toBe(true);
  });

  it("hides when claimed, dismissed, or not loaded", () => {
    expect(shouldPrompt(status(true), false)).toBe(false);
    expect(shouldPrompt(status(false), true)).toBe(false);
    expect(shouldPrompt(null, false)).toBe(false);
  });
});
