import { describe, expect, it } from "vitest";
import { RECENT_MAX, parseRecent, withPlayed } from "./recent";

describe("recently played", () => {
  it("keeps the newest first, without duplicates, at most 3", () => {
    let l: string[] = [];
    for (const id of ["a", "b", "a", "c", "d"]) l = withPlayed(l, id);
    expect(l).toEqual(["d", "c", "a"]);
    expect(l).toHaveLength(RECENT_MAX);
  });

  it("reads stored data defensively", () => {
    expect(parseRecent(null)).toEqual([]);
    expect(parseRecent("nope")).toEqual([]);
    expect(parseRecent('{"a":1}')).toEqual([]);
    expect(parseRecent('["x", 3, "y", "z", "w"]')).toEqual(["x", "y", "z"]);
  });
});
