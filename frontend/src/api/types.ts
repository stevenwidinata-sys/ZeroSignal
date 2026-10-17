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


// ---------------------------------------------------------------------------
// Connect Four (server-authoritative AI matches)
// ---------------------------------------------------------------------------

export type Difficulty = "easy" | "medium" | "hard" | "impossible";
export type SkinRarity = "common" | "rare" | "epic" | "legendary";

export type CfOutcome =
  | { kind: "ongoing" }
  | { kind: "win"; winner: "p1" | "p2" }
  | { kind: "draw" };

export interface CfMatch {
  id: string;
  difficulty: Difficulty;
  best_of: 3 | 5;
  skin: string;
  user_wins: number;
  ai_wins: number;
  draws: number;
  moves: string;
  /** cells[col][row], row 0 = bottom; 0 empty, 1 you, 2 AI. */
  cells: (0 | 1 | 2)[][];
  outcome: CfOutcome;
  winning_cells: [number, number][];
  game_over: boolean;
  undos_left: number;
  used_undo: boolean;
  status: "active" | "won" | "lost" | "forfeited";
  points: number;
  ai_move: number | null;
  spin_granted: boolean;
}

export interface CfSkin {
  id: string;
  name: string;
  rarity: SkinRarity;
  free: boolean;
  owned: boolean;
}

export interface CfCollection {
  skins: CfSkin[];
  spins_available: number;
}

export interface CfSpin {
  difficulty: Difficulty;
  rolls: string[];
  won: string | null;
  collection: CfCollection;
}
