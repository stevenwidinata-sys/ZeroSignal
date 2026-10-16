import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { GAMES, LIVE_GAMES, findGame } from "./registry";

// Ids declared in the backend catalog (backend/src/games.rs).
function backendGameIds(): string[] {
  const src = readFileSync(resolve(__dirname, "../../../backend/src/games.rs"), "utf8");
  const ids = [...src.matchAll(/id:\s*(?:"([a-z0-9-]+)"|ANGRY_BIRD)/g)].map(
    (m) => m[1] ?? "angry-bird",
  );
  return ids;
}

describe("game registry", () => {
  it("has unique, URL-safe ids", () => {
    const ids = GAMES.map((g) => g.meta.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]{1,64}$/);
  });

  it("matches the backend catalog exactly", () => {
    expect(GAMES.map((g) => g.meta.id).sort()).toEqual(backendGameIds().sort());
  });

  it("live games have a Play screen; coming-soon games do not", () => {
    for (const g of GAMES) {
      expect(!!g.Play).toBe(g.meta.status === "live");
    }
    expect(LIVE_GAMES.map((g) => g.meta.id)).toContain("angry-bird");
  });

  it("finds games by id and rejects unknown ones", () => {
    expect(findGame("angry-bird")?.meta.title).toBe("Angry Bird");
    expect(findGame("connect-four")?.meta.status).toBe("soon");
    expect(findGame("nope")).toBeUndefined();
    expect(findGame(undefined)).toBeUndefined();
  });
});
