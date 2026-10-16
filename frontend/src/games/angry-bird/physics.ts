// Pure physics/aiming math that mirrors backend/src/physics/engine.rs.
// The server is authoritative; these values only drive visuals and the aim
// preview, so what the player sees matches what the server scores.
// World units: origin bottom-left, +x right, +y up.
import type { Ability } from "../../api/types";

export const PHYS = {
  MAX_LAUNCH_SPEED: 70, // world units / s at power = 1
  GRAVITY: 9.81 * 2, // world units / s^2 (downward)
  DT: 1 / 60, // fixed timestep
  SUBSTEPS: 4, // rapier 0.18 default num_solver_iterations (TGS substeps)
  MAX_SHOT_TIME: 480 / 60, // MAX_STEPS_PER_SHOT * DT
  SETTLE_SPEED: 0.6,
  BIRD_RADIUS: 1.2,
  IMPACT_RADIUS: 3,
  BLAST_RADIUS: 10,
  BLAST_STRENGTH: 220,
  DASH_BOOST: 40,
  EGG_DROP_DV: 50,
  SPLIT_VX_MULT: 1.2,
  SPLIT_DVY: 15,
} as const;

export interface Vec {
  x: number;
  y: number;
}

export function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
}

/**
 * Convert a slingshot pull into a launch. `dragX/dragY` is the pointer offset
 * from the slingshot in *screen* space (+y down). The bird flies opposite to
 * the pull. Returns power in [0, 1] and angle in radians in world space.
 */
export function launchFromDrag(
  dragX: number,
  dragY: number,
  maxDrag: number,
): { power: number; angle: number } {
  const len = Math.hypot(dragX, dragY);
  if (!(maxDrag > 0) || !Number.isFinite(len) || len === 0) {
    return { power: 0, angle: 0 };
  }
  return { power: clamp01(len / maxDrag), angle: Math.atan2(dragY, -dragX) };
}

/** Launch velocity in world units/s — same formula as the server. */
export function launchVelocity(
  angle: number,
  power: number,
  birdPower: number,
): Vec {
  const speed = PHYS.MAX_LAUNCH_SPEED * clamp01(power) * birdPower;
  return { x: speed * Math.cos(angle), y: speed * Math.sin(angle) };
}

/**
 * Predict the flight path with the same substepped semi-implicit Euler
 * integration rapier uses on the server. Stops when the bird reaches the
 * ground. Returns one point every `sampleEvery` steps.
 */
export function predictPath(
  start: Vec,
  vel: Vec,
  seconds: number,
  sampleEvery = 3,
  groundY = 0,
): Vec[] {
  const pts: Vec[] = [];
  const p = { ...start };
  const v = { ...vel };
  const steps = Math.round(seconds / PHYS.DT);
  const h = PHYS.DT / PHYS.SUBSTEPS;
  for (let i = 1; i <= steps; i++) {
    for (let s = 0; s < PHYS.SUBSTEPS; s++) {
      v.y -= PHYS.GRAVITY * h;
      p.x += v.x * h;
      p.y += v.y * h;
    }
    if (p.y - PHYS.BIRD_RADIUS <= groundY) break;
    if (i % sampleEvery === 0) pts.push({ ...p });
  }
  return pts;
}

/** Bird mass as the server computes it (density * circle area). */
export function birdMass(massFactor: number): number {
  return massFactor * Math.PI * PHYS.BIRD_RADIUS * PHYS.BIRD_RADIUS;
}

/** Server impact model: damage dealt per step while near a target. */
export function impactDamage(mass: number, speed: number): number {
  return 0.5 * mass * speed * speed * 0.02;
}

/**
 * Ability tap time to send to the server, given how many physics steps have
 * run since launch. The server fires the ability before the first step where
 * `step * DT >= tap`; subtracting half a step avoids float rounding making it
 * fire one step late.
 */
export function abilityTapTime(stepsElapsed: number): number {
  return Math.max(0, (stepsElapsed - 0.5) * PHYS.DT);
}

/** Velocity after a mid-flight ability (explode is handled separately). */
export function abilityVelocity(ability: Ability, v: Vec): Vec {
  switch (ability) {
    case "dash": {
      const n = Math.hypot(v.x, v.y);
      const dir = n > 0.01 ? { x: v.x / n, y: v.y / n } : { x: 1, y: 0 };
      return {
        x: v.x + dir.x * PHYS.DASH_BOOST,
        y: v.y + dir.y * PHYS.DASH_BOOST,
      };
    }
    case "egg_drop":
      return { x: v.x, y: v.y - PHYS.EGG_DROP_DV };
    case "split":
      return { x: v.x * PHYS.SPLIT_VX_MULT, y: v.y + PHYS.SPLIT_DVY };
    default:
      return { ...v };
  }
}
