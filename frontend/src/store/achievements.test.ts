import { describe, expect, it } from "vitest";
import type { Achievement } from "../api/types";
import { ITEMS } from "../character/catalog";
import { titleClasses } from "../components/TitleBadge";
import { filterAchievements, sortAchievements } from "./achievements";

const ach = (id: string, over: Partial<Achievement> = {}): Achievement => ({
  id,
  name: id,
  description: "",
  coins: 10,
  xp: 10,
  title: "title-rookie",
  progress: 0,
  target: 10,
  unlocked: false,
  claimed_at: null,
  ...over,
});

describe("achievements", () => {
  const list = [
    ach("claimed", { unlocked: true, progress: 10, claimed_at: "2026-11-06T00:00:00Z" }),
    ach("far", { progress: 1 }),
    ach("ready", { unlocked: true, progress: 10 }),
    ach("close", { progress: 8 }),
  ];

  it("sorts ready first, then closest to done, then claimed", () => {
    expect(sortAchievements(list).map((a) => a.id)).toEqual(["ready", "close", "far", "claimed"]);
  });

  it("filters by state", () => {
    expect(filterAchievements(list, "ready").map((a) => a.id)).toEqual(["ready"]);
    expect(filterAchievements(list, "locked").map((a) => a.id)).toEqual(["far", "close"]);
    expect(filterAchievements(list, "claimed").map((a) => a.id)).toEqual(["claimed"]);
    expect(filterAchievements(list, "all")).toHaveLength(4);
  });
});

describe("titles", () => {
  const titles = ITEMS.filter((i) => i.slot === "title");

  it("every title has a tier and color; silver and up have an icon", () => {
    for (const t of titles) {
      expect(t.art.tier, t.id).toBeDefined();
      expect(t.art.color, t.id).toMatch(/^#[0-9a-f]{6}$/i);
      if (t.art.tier !== "bronze") expect(t.art.icon, t.id).toBeTruthy();
    }
  });

  it("harder titles look stronger: mythic titles always have an effect", () => {
    for (const t of titles.filter((x) => x.art.tier === "mythic")) expect(t.art.effect, t.id).toBeTruthy();
    for (const t of titles.filter((x) => x.art.tier === "bronze")) expect(t.art.effect, t.id).toBeUndefined();
  });

  it("there are 25 achievement-only titles", () => {
    expect(titles.filter((t) => t.unlock.kind === "achievement")).toHaveLength(34);
  });

  it("builds tier and effect classes", () => {
    const pig = ITEMS.find((i) => i.id === "title-pig-slayer")!;
    expect(titleClasses(pig)).toBe("title-badge title-tier-mythic title-fx-flame");
    const rookie = ITEMS.find((i) => i.id === "title-rookie")!;
    expect(titleClasses(rookie)).toBe("title-badge title-tier-bronze");
  });
});
