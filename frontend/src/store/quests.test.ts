import { describe, expect, it } from "vitest";
import type { Quest, QuestsView } from "../api/types";
import { canReroll, readyCount } from "./quests";

const quest = (slot: number, over: Partial<Quest> = {}): Quest => ({
  slot,
  id: `q${slot}`,
  title: "Quest",
  progress: 0,
  target: 3,
  coins: 20,
  xp: 30,
  done: false,
  claimed: false,
  ...over,
});

const view = (quests: Quest[], reroll_available = true): QuestsView => ({
  quests,
  reroll_available,
  bonus_tokens: 1,
  bonus_claimed: false,
  next_reset: "2026-11-06T17:00:00Z",
});

describe("daily quests", () => {
  it("counts finished but unclaimed quests", () => {
    const v = view([quest(0, { done: true }), quest(1, { done: true, claimed: true }), quest(2)]);
    expect(readyCount(v)).toBe(1);
    expect(readyCount(null)).toBe(0);
  });

  it("only rerolls unfinished quests while the daily reroll is left", () => {
    const v = view([quest(0), quest(1, { done: true }), quest(2, { claimed: true, done: true })]);
    expect(canReroll(v, 0)).toBe(true);
    expect(canReroll(v, 1)).toBe(false);
    expect(canReroll(v, 2)).toBe(false);
    expect(canReroll(v, 9)).toBe(false);
    expect(canReroll(view([quest(0)], false), 0)).toBe(false);
  });
});
