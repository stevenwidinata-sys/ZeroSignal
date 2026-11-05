import { describe, expect, it } from "vitest";
import {
  ITEMS,
  SLOTS,
  defaultLoadout,
  findItem,
  normalizeLoadout,
  unlockLabel,
  unlockedBetween,
} from "./catalog";

describe("character catalog", () => {
  it("has 23 slots and plenty of items, all in known slots", () => {
    expect(SLOTS).toHaveLength(23);
    expect(ITEMS.length).toBeGreaterThanOrEqual(120);
    const slotIds = new Set(SLOTS.map((s) => s.id));
    for (const i of ITEMS) expect(slotIds.has(i.slot), i.id).toBe(true);
    expect(new Set(ITEMS.map((i) => i.id)).size).toBe(ITEMS.length);
  });

  it("default outfit uses starter items of the right slot", () => {
    const l = defaultLoadout();
    for (const s of SLOTS.filter((s) => s.required)) {
      const it = findItem(l[s.id]);
      expect(it?.slot, s.id).toBe(s.id);
      expect(it?.unlock.kind).toBe("starter");
    }
  });

  it("normalizes stored outfits for display", () => {
    const l = normalizeLoadout({ hat: "hat-crown", shirt: "nope", glasses: "shirt-tee-red" });
    expect(l.hat).toBe("hat-crown");
    expect(l.shirt).toBe("shirt-tee-white");
    expect(l.glasses).toBeUndefined();
    expect(normalizeLoadout(null)).toEqual(defaultLoadout());
  });

  it("explains how to unlock things", () => {
    expect(unlockLabel({ kind: "level", level: 5 })).toBe("Reach level 5");
    expect(unlockLabel({ kind: "coins", price: 1500 })).toContain("1,500");
    expect(unlockLabel({ kind: "wheel" })).toContain("wheel");
  });

  it("lists level unlocks between two levels", () => {
    expect(unlockedBetween(1, 2).map((i) => i.id)).toContain("hat-cap-blue");
    expect(unlockedBetween(4, 4)).toEqual([]);
  });
});
