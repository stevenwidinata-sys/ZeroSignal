import { SKINS } from "./skins";

/** Skins that can appear on the wheel (free starters can't be won). */
export const WHEEL_SKINS = SKINS.filter((s) => !s.free);
export const SEGMENT_DEG = 360 / WHEEL_SKINS.length;

/**
 * Next absolute wheel rotation (degrees, clockwise) that brings `skinId`'s
 * segment centre under the top pointer, always spinning forward by at least
 * `minTurns` full turns from `current`.
 */
export function rotationFor(skinId: string, current: number, minTurns = 4): number {
  const i = WHEEL_SKINS.findIndex((s) => s.id === skinId);
  if (i < 0) return current;
  // Segment i spans [i*SEG, (i+1)*SEG) clockwise from the top.
  const target = (360 - (i * SEGMENT_DEG + SEGMENT_DEG / 2)) % 360;
  const base = current + minTurns * 360;
  const delta = (((target - base) % 360) + 360) % 360;
  return base + delta;
}

/** Which segment sits under the pointer for a given rotation. */
export function segmentAt(rotation: number): string {
  const a = (((360 - (rotation % 360)) % 360) + 360) % 360;
  return WHEEL_SKINS[Math.floor(a / SEGMENT_DEG) % WHEEL_SKINS.length].id;
}
