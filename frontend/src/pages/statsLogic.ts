import type { StatsBoard } from "../api/types";
import { findGame } from "../platform/registry";

/** Whole-percent win rate; 0 when nothing was played. */
export function winRate(won: number, played: number): number {
  return played > 0 ? Math.round((won / played) * 100) : 0;
}

/** Name of a board inside a game ("⚡ Frenzy"), or "Level n". */
export function boardLabel(gameId: string, level: number): string {
  return findGame(gameId)?.meta.boards?.find((b) => b.level === level)?.label ?? `Level ${level}`;
}

/** All boards of one game, summed (rounds, best, weighted average). */
export function sumBoards(boards: StatsBoard[], gameId: string): { rounds: number; best: number; average: number } {
  const mine = boards.filter((b) => b.game_id === gameId);
  const rounds = mine.reduce((n, b) => n + b.rounds, 0);
  const best = mine.reduce((m, b) => Math.max(m, b.best), 0);
  const total = mine.reduce((n, b) => n + b.average * b.rounds, 0);
  return { rounds, best, average: rounds ? Math.round(total / rounds) : 0 };
}

/** Minefield size -> its leaderboard board (scores.level). */
export const MF_LEVEL: Record<string, number> = { beginner: 1, intermediate: 2, expert: 3, daily: 4 };

export const DIFFICULTY_NAME: Record<string, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
  impossible: "Impossible",
  beginner: "Beginner",
  intermediate: "Intermediate",
  expert: "Expert",
  daily: "Daily",
};
