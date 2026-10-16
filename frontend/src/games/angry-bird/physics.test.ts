import { describe, expect, it } from "vitest";
import {
  PHYS,
  abilityTapTime,
  abilityVelocity,
  clamp01,
  launchFromDrag,
  launchVelocity,
  predictPath,
} from "./physics";

describe("launchFromDrag", () => {
  it("pulling down-left launches up-right", () => {
    const { power, angle } = launchFromDrag(-50, 50, 100);
    expect(power).toBeCloseTo(Math.SQRT2 / 2, 5);
    expect(angle).toBeCloseTo(Math.PI / 4, 5);
  });

  it("pulling straight left launches flat right", () => {
    const { angle } = launchFromDrag(-80, 0, 100);
    expect(angle).toBeCloseTo(0, 5);
  });

  it("clamps power to 1 for over-pulls", () => {
    expect(launchFromDrag(-500, 0, 100).power).toBe(1);
  });

  it("returns zero power for no drag or bad input", () => {
    expect(launchFromDrag(0, 0, 100).power).toBe(0);
    expect(launchFromDrag(NaN, 5, 100).power).toBe(0);
    expect(launchFromDrag(10, 5, 0).power).toBe(0);
  });
});

describe("launchVelocity", () => {
  it("matches the server formula", () => {
    const v = launchVelocity(0.5, 0.8, 1.1);
    const speed = PHYS.MAX_LAUNCH_SPEED * 0.8 * 1.1;
    expect(v.x).toBeCloseTo(speed * Math.cos(0.5), 5);
    expect(v.y).toBeCloseTo(speed * Math.sin(0.5), 5);
  });

  it("clamps power like the server", () => {
    expect(launchVelocity(0, 5, 1).x).toBeCloseTo(PHYS.MAX_LAUNCH_SPEED, 5);
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(Infinity)).toBe(0);
  });
});

describe("predictPath", () => {
  it("matches rapier's substepped integration with server gravity", () => {
    const pts = predictPath({ x: 10, y: 8 }, { x: 30, y: 30 }, 1, 1);
    // N substeps of h: y = y0 + N*h*vy - g*h^2*N(N+1)/2 (verified vs rapier
    // in backend physics::tests::free_flight_matches_client_preview_math).
    const n = 30;
    const N = n * PHYS.SUBSTEPS;
    const h = PHYS.DT / PHYS.SUBSTEPS;
    const y = 8 + N * h * 30 - PHYS.GRAVITY * h * h * ((N * (N + 1)) / 2);
    expect(pts[n - 1].x).toBeCloseTo(10 + n * PHYS.DT * 30, 4);
    expect(pts[n - 1].y).toBeCloseTo(y, 4);
    expect(pts[n - 1].y).toBeCloseTo(20.527, 2); // rapier's measured value
  });

  it("stops at the ground", () => {
    const pts = predictPath({ x: 0, y: 5 }, { x: 10, y: -20 }, 5, 1);
    for (const p of pts) expect(p.y).toBeGreaterThan(PHYS.BIRD_RADIUS);
    expect(pts.length).toBeLessThan(60);
  });
});

describe("abilities", () => {
  it("tap time fires on the same server step", () => {
    for (const steps of [0, 1, 37, 120]) {
      const tap = abilityTapTime(steps);
      // Server fires at first step index k with k*DT >= tap.
      const k = Math.max(0, Math.ceil(tap / PHYS.DT - 1e-9)) + 0;
      expect(k).toBe(steps);
    }
  });

  it("dash adds speed along the direction of travel", () => {
    const v = abilityVelocity("dash", { x: 3, y: 4 });
    expect(v.x).toBeCloseTo(3 + 0.6 * PHYS.DASH_BOOST, 5);
    expect(v.y).toBeCloseTo(4 + 0.8 * PHYS.DASH_BOOST, 5);
  });

  it("egg drop and split match server deltas", () => {
    expect(abilityVelocity("egg_drop", { x: 5, y: 2 })).toEqual({ x: 5, y: -48 });
    expect(abilityVelocity("split", { x: 10, y: 2 })).toEqual({ x: 12, y: 17 });
    expect(abilityVelocity("none", { x: 1, y: 1 })).toEqual({ x: 1, y: 1 });
  });
});
