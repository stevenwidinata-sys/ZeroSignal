import { describe, expect, it } from "vitest";
import { apiBase } from "./client";

describe("API address", () => {
  it("uses VITE_API_BASE_URL when set, without a trailing slash", () => {
    expect(apiBase("https://api.example.com/", true)).toBe("https://api.example.com");
    expect(apiBase(" http://localhost:8080 ", false)).toBe("http://localhost:8080");
  });

  it("calls its own address in production and localhost in dev when unset", () => {
    expect(apiBase(undefined, true)).toBe("");
    expect(apiBase("", true)).toBe("");
    expect(apiBase(undefined, false)).toBe("http://localhost:8080");
  });
});
