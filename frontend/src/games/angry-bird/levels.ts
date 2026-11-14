// Angry Bird levels, read from shared/angry_bird_levels.json: the same file
// the server's physics uses (backend/src/physics/level.rs). The server is
// authoritative; the browser uses these numbers to draw and preview.
import raw from "../../../../shared/angry_bird_levels.json";

export type Material = "wood" | "stone" | "ice";

export interface BlockDef {
  x: number;
  /** Bottom edge. */
  y: number;
  w: number;
  h: number;
  hp: number;
  m: Material;
}

export interface PigDef {
  x: number;
  /** Center. */
  y: number;
  r: number;
  hp: number;
}

export interface Level {
  id: number;
  world: number;
  name: string;
  width: number;
  height: number;
  slingshotX: number;
  slingshotY: number;
  /** Scores for 1, 2 and 3 stars (1 star = every pig gone). */
  stars: [number, number, number];
  blocks: BlockDef[];
  pigs: PigDef[];
}

export interface World {
  id: number;
  name: string;
  icon: string;
  /** Daytime sky gradient (top, bottom) and ground color. */
  sky: [string, string];
  ground: string;
}

interface RawLevel {
  id: number;
  world: number;
  name: string;
  width: number;
  height: number;
  slingshot: [number, number];
  stars: [number, number, number];
  blocks: BlockDef[];
  pigs: PigDef[];
}

const data = raw as unknown as { worlds: World[]; levels: RawLevel[] };

export const WORLDS: World[] = data.worlds;

export const LEVELS: Level[] = data.levels.map((l) => ({
  id: l.id,
  world: l.world,
  name: l.name,
  width: l.width,
  height: l.height,
  slingshotX: l.slingshot[0],
  slingshotY: l.slingshot[1],
  stars: l.stars,
  blocks: l.blocks,
  pigs: l.pigs,
}));

export function findLevel(id: number): Level {
  return LEVELS.find((l) => l.id === id) ?? LEVELS[0];
}

export function findWorld(id: number): World {
  return WORLDS.find((w) => w.id === id) ?? WORLDS[0];
}

export const LEVEL_ONE: Level = LEVELS[0];

/** Block colors (fill, edge) per material. */
export const MATERIAL_COLOR: Record<Material, [string, string]> = {
  wood: ["#b08968", "#7f5539"],
  stone: ["#9aa0a6", "#5f6368"],
  ice: ["#bfe9ff", "#5fa8d3"],
};

/** Stars earned (0 unless every pig is gone). */
export function starsFor(level: Level, score: number, cleared: boolean): number {
  if (!cleared) return 0;
  return 1 + (score >= level.stars[1] ? 1 : 0) + (score >= level.stars[2] ? 1 : 0);
}
