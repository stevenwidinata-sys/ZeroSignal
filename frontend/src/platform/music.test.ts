import { describe, expect, it } from "vitest";
import { TRACKS, noteFreq, trackForPath, type TrackId } from "./music";

describe("music", () => {
  it("converts note names to frequencies", () => {
    expect(noteFreq("A4")).toBeCloseTo(440);
    expect(noteFreq("A5")).toBeCloseTo(880);
    expect(noteFreq("C4")).toBeCloseTo(261.63, 1);
    expect(noteFreq("F#5")).toBeCloseTo(739.99, 1);
    expect(noteFreq("-")).toBeNull();
    expect(noteFreq("H9")).toBeNull();
  });

  it("has 3 tracks whose lines line up and only use valid notes", () => {
    const ids = Object.keys(TRACKS) as TrackId[];
    expect(ids.sort()).toEqual(["calm", "hub", "upbeat"]);
    for (const id of ids) {
      const t = TRACKS[id];
      const len = t.lead.notes.length;
      expect(len, id).toBeGreaterThan(0);
      expect(t.bass.notes, id).toHaveLength(len);
      expect(t.drums, id).toHaveLength(len);
      for (const n of [...t.lead.notes, ...t.bass.notes]) {
        expect(n === "-" || noteFreq(n) !== null, `${id}: ${n}`).toBe(true);
      }
      for (const d of t.drums) expect(["k", "s", "h", "-"]).toContain(d);
    }
  });

  it("upbeat is faster than hub, hub faster than calm", () => {
    expect(TRACKS.upbeat.bpm).toBeGreaterThan(TRACKS.hub.bpm);
    expect(TRACKS.hub.bpm).toBeGreaterThan(TRACKS.calm.bpm);
  });

  it("picks the track for each page", () => {
    expect(trackForPath("/")).toBe("hub");
    expect(trackForPath("/shop")).toBe("hub");
    expect(trackForPath("/play/angry-bird")).toBe("upbeat");
    expect(trackForPath("/play/connect-four")).toBe("calm");
    expect(trackForPath("/play/tic-tac-toe")).toBe("calm");
  });
});
