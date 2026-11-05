/**
 * Character catalog: the exact JSON file the backend uses
 * (shared/character_items.json). The server decides ownership and prices;
 * this copy is for drawing items and explaining how to unlock them.
 */
import raw from "../../../shared/character_items.json";

export type Rarity = "common" | "rare" | "epic" | "legendary";
export type SlotGroup = "body" | "head" | "clothes" | "extras" | "profile";

export type Unlock =
  | { kind: "starter" }
  | { kind: "level"; level: number }
  | { kind: "coins"; price: number }
  | { kind: "wheel" };

export interface ItemArt {
  shape?: string;
  color?: string;
  accent?: string;
  text?: string;
  special?: string;
}

export interface Item {
  id: string;
  slot: string;
  name: string;
  rarity: Rarity;
  unlock: Unlock;
  art: ItemArt;
}

export interface Slot {
  id: string;
  label: string;
  group: SlotGroup;
  required: boolean;
  default: string | null;
}

/** slot id -> item id */
export type Loadout = Record<string, string>;

export const SLOTS = raw.slots as Slot[];
export const ITEMS = raw.items as Item[];

export const GROUPS: { id: SlotGroup; label: string; icon: string }[] = [
  { id: "body", label: "Body", icon: "🧑" },
  { id: "head", label: "Head", icon: "🎩" },
  { id: "clothes", label: "Clothes", icon: "👕" },
  { id: "extras", label: "Extras", icon: "🎒" },
  { id: "profile", label: "Profile", icon: "🖼" },
];

const BY_ID = new Map(ITEMS.map((i) => [i.id, i]));

export function findItem(id: string | undefined | null): Item | undefined {
  return id ? BY_ID.get(id) : undefined;
}

export function itemsForSlot(slot: string): Item[] {
  return ITEMS.filter((i) => i.slot === slot);
}

export function defaultLoadout(): Loadout {
  const l: Loadout = {};
  for (const s of SLOTS) if (s.default) l[s.id] = s.default;
  return l;
}

/** Fill missing required slots and drop unknown ids (display only). */
export function normalizeLoadout(l: Loadout | null | undefined): Loadout {
  const out = defaultLoadout();
  for (const [slot, id] of Object.entries(l ?? {})) {
    const it = findItem(id);
    if (it && it.slot === slot) out[slot] = id;
  }
  return out;
}

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

/** How a locked item can be obtained, in plain words. */
export function unlockLabel(u: Unlock): string {
  switch (u.kind) {
    case "starter":
      return "Free";
    case "level":
      return `Reach level ${u.level}`;
    case "coins":
      return `${u.price.toLocaleString()} 🪙 in the shop`;
    case "wheel":
      return "Token wheel only";
  }
}

export function priceOf(it: Item): number | null {
  return it.unlock.kind === "coins" ? it.unlock.price : null;
}

/** Level items unlocked when going from `from` to `to` (exclusive, inclusive]. */
export function unlockedBetween(from: number, to: number): Item[] {
  return ITEMS.filter((i) => i.unlock.kind === "level" && i.unlock.level > from && i.unlock.level <= to);
}

export const MYSTERY_BOX_PRICE = 250;
export const WHEEL_TOKEN_COST = 1;
