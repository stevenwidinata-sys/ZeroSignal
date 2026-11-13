import game2048 from "../games/2048";
import angryBird from "../games/angry-bird";
import connectFour from "../games/connect-four";
import minefield from "../games/minefield";
import ticTacToe from "../games/tic-tac-toe";
import whackAMole from "../games/whack-a-mole";
import type { GameModule } from "./types";

/** All games on the platform, in hub display order. */
export const GAMES: GameModule[] = [angryBird, connectFour, ticTacToe, whackAMole, minefield, game2048];

export function findGame(id: string | undefined): GameModule | undefined {
  return GAMES.find((g) => g.meta.id === id);
}

export const LIVE_GAMES = GAMES.filter((g) => g.meta.status === "live" && g.Play);
