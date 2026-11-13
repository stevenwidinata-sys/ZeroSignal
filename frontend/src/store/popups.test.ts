import { describe, expect, it } from "vitest";
import type { Granted } from "../api/types";
import { sfxVolume } from "../platform/sound";
import { rewardWaiting, shouldPrompt } from "./dailyLogin";
import { toastFor } from "./wallet";

const g = (level_before: number, level_after: number): Granted => ({
  coins: 5,
  tokens: 0,
  xp: 20,
  coins_capped: 0,
  level_before,
  level_after,
});
const status = (claimed_today: boolean) => ({ claimed_today }) as never;

describe("pop-up settings", () => {
  it("reward toasts and level-up pop-ups follow their own switches", () => {
    const on = { levelUpPopup: true, rewardToasts: true };
    expect(toastFor(g(1, 1), on)).toEqual(g(1, 1));
    expect(toastFor(g(1, 1), { ...on, rewardToasts: false })).toBeNull();
    expect(toastFor(g(1, 2), { levelUpPopup: true, rewardToasts: false })).toEqual(g(1, 2));
    // Level-up pop-up off: shown as a plain toast...
    expect(toastFor(g(1, 2), { levelUpPopup: false, rewardToasts: true })).toEqual(g(1, 1));
    // ...or not at all.
    expect(toastFor(g(1, 2), { levelUpPopup: false, rewardToasts: false })).toBeNull();
  });

  it("the daily reward opens on its own only when its pop-up is on", () => {
    expect(shouldPrompt(status(false), false, true)).toBe(true);
    expect(shouldPrompt(status(false), false, false)).toBe(false);
    expect(shouldPrompt(status(false), false, false, true)).toBe(true);
    expect(shouldPrompt(status(true), false, true, true)).toBe(false);
    expect(rewardWaiting(status(false))).toBe(true);
  });

  it("menu clicks use the UI volume, game sounds the game volume", () => {
    const s = { sound: true, volume: 0.6, uiVolume: 0.2 };
    expect(sfxVolume("click", s)).toBe(0.2);
    expect(sfxVolume("bonk", s)).toBe(0.6);
    expect(sfxVolume("click", { ...s, sound: false })).toBe(0);
  });
});
