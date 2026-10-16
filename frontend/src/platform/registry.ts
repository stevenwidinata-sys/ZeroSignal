import angryBird from "../games/angry-bird";
import connectFour from "../games/connect-four";
import type { GameModule } from "./types";

/** All games on the platform, in hub display order. */
export const GAMES: GameModule[] = [angryBird, connectFour];

export function findGame(id: string | undefined): GameModule | undefined {
  return GAMES.find((g) => g.meta.id === id);
}

export const LIVE_GAMES = GAMES.filter((g) => g.meta.status === "live" && g.Play);
