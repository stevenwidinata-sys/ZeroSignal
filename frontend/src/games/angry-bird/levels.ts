// Mirror of the backend level definitions (backend/src/physics/level.rs).
// The server is authoritative; these numbers only drive the visuals so the
// player sees roughly what the server simulates.

export interface BlockDef {
  x: number;
  y: number;
  w: number;
  h: number;
  hp: number;
}

export interface PigDef {
  x: number;
  y: number;
  r: number;
  hp: number;
}

export interface Level {
  id: number;
  width: number;
  height: number;
  slingshotX: number;
  slingshotY: number;
  blocks: BlockDef[];
  pigs: PigDef[];
}

export const LEVEL_ONE: Level = {
  id: 1,
  width: 100,
  height: 60,
  slingshotX: 10,
  slingshotY: 8,
  blocks: [
    { x: 60, y: 2, w: 2, h: 8, hp: 40 },
    { x: 68, y: 2, w: 2, h: 8, hp: 40 },
    { x: 64, y: 10.5, w: 10, h: 2, hp: 30 },
    { x: 82, y: 2, w: 2, h: 10, hp: 50 },
    { x: 90, y: 2, w: 2, h: 10, hp: 50 },
    { x: 86, y: 12.5, w: 10, h: 2, hp: 35 },
    { x: 64, y: 12, w: 2, h: 2, hp: 20 },
  ],
  pigs: [
    { x: 64, y: 1.5, r: 1.6, hp: 25 },
    { x: 86, y: 1.5, r: 1.6, hp: 25 },
    { x: 86, y: 15, r: 1.6, hp: 25 },
  ],
};
