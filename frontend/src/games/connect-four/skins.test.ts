import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SKINS, findSkin, opponentSkin } from "./skins";

// (id, rarity, free) declared in backend/src/connect_four/skins.rs.
function backendSkins(): [string, string, boolean][] {
  const src = readFileSync(
    resolve(__dirname, "../../../../backend/src/connect_four/skins.rs"),
    "utf8",
  );
  return [...src.matchAll(/skin\("([a-z-]+)", "[^"]+", Rarity::(\w+), (true|false)\)/g)].map(
    (m) => [m[1], m[2].toLowerCase(), m[3] === "true"],
  );
}

describe("connect four skins", () => {
  it("has 10 unique skins matching the backend catalog", () => {
    expect(SKINS).toHaveLength(10);
    expect(new Set(SKINS.map((s) => s.id)).size).toBe(10);
    expect(SKINS.map((s) => [s.id, s.rarity, s.free])).toEqual(backendSkins());
  });

  it("falls back to the first skin for unknown ids", () => {
    expect(findSkin("pig").name).toBe("Piggy");
    expect(findSkin("nope").id).toBe("red");
  });

  it("never gives the opponent your skin", () => {
    for (const s of SKINS) expect(opponentSkin(s.id)).not.toBe(s.id);
    expect(opponentSkin("blue")).toBe("red");
    expect(opponentSkin("pig", "tnt")).toBe("tnt");
  });
});
