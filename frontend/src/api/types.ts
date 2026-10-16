export interface User {
  id: string;
  username: string;
  email: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export type Ability =
  | "none"
  | "dash"
  | "explode"
  | "egg_drop"
  | "heavy"
  | "split";

export interface Bird {
  id: string;
  name: string;
  color: string;
  ability: Ability;
  mass: number;
  power: number;
  unlock_score: number;
  description: string;
  unlocked: boolean;
}

export interface ShotInput {
  bird: string;
  angle: number;
  power: number;
  ability_tap: number | null;
}

export interface SubmitResponse {
  score: number;
  pigs_destroyed: number;
  blocks_destroyed: number;
  best_score: number;
  newly_unlocked: string[];
}

export interface LeaderboardEntry {
  rank: number;
  username: string;
  best_score: number;
}

export interface MyScore {
  score: number;
  level: number;
  bird_variant: string | null;
  created_at: string;
}

export interface MyScoresResponse {
  game_id: string;
  best_score: number;
  scores: MyScore[];
}
