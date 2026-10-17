/** Chip skins. Ids/rarities must match backend/src/connect_four/skins.rs. */
export type Rarity = "common" | "rare" | "epic" | "legendary";

export interface SkinMeta {
  id: string;
  name: string;
  rarity: Rarity;
  free: boolean;
  /** Base fill (used by the wheel and as the chip body color). */
  color: string;
  /** Darker rim color. */
  rim: string;
}

export const SKINS: SkinMeta[] = [
  { id: "red", name: "Classic Red", rarity: "common", free: true, color: "#ff4d4f", rim: "#b81d24" },
  { id: "blue", name: "Classic Blue", rarity: "common", free: true, color: "#3a86ff", rim: "#1d4fb8" },
  { id: "green", name: "Lime Green", rarity: "common", free: false, color: "#3bce7a", rim: "#1f8f50" },
  { id: "purple", name: "Royal Purple", rarity: "rare", free: false, color: "#9b5de5", rim: "#5f2a9e" },
  { id: "golden", name: "Golden", rarity: "legendary", free: false, color: "#ffd23f", rim: "#c48a00" },
  { id: "red-bird", name: "Red Bird", rarity: "rare", free: false, color: "#e63946", rim: "#8f1d26" },
  { id: "pig", name: "Piggy", rarity: "rare", free: false, color: "#8bd450", rim: "#4f8a22" },
  { id: "bomb-bird", name: "Bomb Bird", rarity: "epic", free: false, color: "#2b2d42", rim: "#0d0e16" },
  { id: "egg", name: "Golden Egg", rarity: "epic", free: false, color: "#fff1b8", rim: "#d9a400" },
  { id: "tnt", name: "TNT Crate", rarity: "epic", free: false, color: "#c8873a", rim: "#7a4a14" },
];

export const RARITY_LABEL: Record<Rarity, string> = {
  common: "Common",
  rare: "Rare",
  epic: "Epic",
  legendary: "Legendary",
};

export const RARITY_COLOR: Record<Rarity, string> = {
  common: "#a9b1d6",
  rare: "#3a86ff",
  epic: "#9b5de5",
  legendary: "#ffd23f",
};

export function findSkin(id: string): SkinMeta {
  return SKINS.find((s) => s.id === id) ?? SKINS[0];
}

/**
 * Pick the opponent's skin: never the same as yours, so the board stays
 * readable. Prefers `preferred` when it differs.
 */
export function opponentSkin(mine: string, preferred = "blue"): string {
  if (preferred !== mine) return preferred;
  return mine === "red" ? "blue" : "red";
}
