import type { ComponentType, LazyExoticComponent } from "react";

export type GameStatus = "live" | "soon";

/** One step of a game's short "how to play" tutorial. */
export interface TutorialStep {
  icon: string;
  title: string;
  text: string;
}

/** Static info shown on the hub card and game pages. */
export interface GameMeta {
  /** URL slug and leaderboard key. Must match backend/src/games.rs. */
  id: string;
  title: string;
  tagline: string;
  /** Short genre/feature tags shown on the card. */
  tags: string[];
  /** Card accent: one of the theme's primary colors. */
  accent: "yellow" | "green" | "blue";
  /** Emoji/glyph used as the card's pixel icon. */
  icon: string;
  status: GameStatus;
  /** Label for the score column on the leaderboard. */
  scoreLabel: string;
  /** Label for the extra leaderboard column (the score's `detail`), if any. */
  detailLabel?: string;
  /** 3-4 steps shown the first time the game is opened (live games). */
  tutorial?: TutorialStep[];
  /** Show a NEW badge on the hub card. */
  isNew?: boolean;
  /** Separate leaderboards inside one game (stored as the score's `level`). */
  boards?: GameBoard[];
}

export interface GameBoard {
  /** Leaderboard board (`scores.level`); none = every board together. */
  level?: number;
  label: string;
  /** "today" = only scores from the current WIB day. */
  period?: "today";
}

/**
 * Every game implements this contract. To add a game:
 *   1. create src/games/<id>/index.ts exporting a GameModule
 *   2. add it to GAMES in src/platform/registry.ts
 *   3. add the id to backend/src/games.rs (+ a server-side scorer when live)
 */
export interface GameModule {
  meta: GameMeta;
  /** The playable screen. Lazy-loaded so each game ships its own bundle. */
  Play?: LazyExoticComponent<ComponentType>;
}
