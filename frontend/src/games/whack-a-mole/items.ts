/**
 * Hammers and board themes: the same JSON the backend uses
 * (shared/whack_items.json). The server decides ownership and prices.
 */
import raw from "../../../../shared/whack_items.json";
import type { CSSProperties } from "react";
import type { Sfx } from "../../platform/sound";

export type Rarity = "common" | "rare" | "epic" | "legendary";

export interface HammerArt {
  head: string;
  handle: string;
  fx: string;
  sound: "bonk" | "squeak" | "clang" | "splash" | "zap" | "chime";
}

export interface ThemeArt {
  board: string;
  hole: string;
  rim: string;
  moleBody: string;
  moleBelly: string;
  deco: string;
}

export interface Item<A> {
  id: string;
  name: string;
  rarity: Rarity;
  price: number | null;
  art: A;
}

export const HAMMERS = raw.hammers as Item<HammerArt>[];
export const THEMES = raw.themes as Item<ThemeArt>[];

export const findHammer = (id: string) => HAMMERS.find((h) => h.id === id) ?? HAMMERS[0];
export const findTheme = (id: string) => THEMES.find((t) => t.id === id) ?? THEMES[0];

/** Hammer drawing as an SVG string (used for the cursor and the picker). */
export function hammerSvg(art: HammerArt, size = 40): string {
  return (
    `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 40 40'>` +
    `<rect x='17' y='14' width='6' height='24' rx='2' fill='${art.handle}' stroke='#000' stroke-width='2'/>` +
    `<rect x='4' y='3' width='32' height='14' rx='3' fill='${art.head}' stroke='#000' stroke-width='2'/>` +
    `</svg>`
  );
}

/** CSS cursor showing the hammer (hot spot at the head). */
export function hammerCursor(art: HammerArt): string {
  return `url("data:image/svg+xml,${encodeURIComponent(hammerSvg(art))}") 20 10, pointer`;
}

/** CSS variables that paint the board, holes and plain moles. */
export function themeStyle(art: ThemeArt): CSSProperties {
  return {
    ["--wam-board" as string]: art.board,
    ["--wam-hole" as string]: art.hole,
    ["--wam-rim" as string]: art.rim,
    ["--mole-body" as string]: art.moleBody,
    ["--mole-belly" as string]: art.moleBelly,
  };
}

/** Sound a hammer makes on a hit. */
export const hammerSfx = (art: HammerArt): Sfx => art.sound;

/** "hammer:pan" → its display name. */
export function itemName(key: string): string {
  const [kind, id] = key.split(":");
  const list: Item<unknown>[] = kind === "hammer" ? HAMMERS : THEMES;
  return list.find((i) => i.id === id)?.name ?? id;
}
