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
  rewards: Granted;
}

// ---------------------------------------------------------------------------
// Economy (shared by every game)
// ---------------------------------------------------------------------------

/** What the server actually paid for a verified result. */
export interface Granted {
  coins: number;
  tokens: number;
  xp: number;
  /** Coins withheld because the daily cap was reached. */
  coins_capped: number;
  level_before: number;
  level_after: number;
}

export interface Wallet {
  coins: number;
  tokens: number;
  xp: number;
  level: number;
  xp_into_level: number;
  xp_for_next: number;
  coins_today: number;
  daily_cap: number;
}

export interface LeaderboardEntry {
  rank: number;
  username: string;
  best_score: number;
  /** Saved outfit (slot -> item id), null if never customized. */
  avatar: Record<string, string> | null;
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
  /** Paid when a game finished on this move. */
  rewards: Granted | null;
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

// ---------------------------------------------------------------------------
// Character, shop and profiles
// ---------------------------------------------------------------------------

/** slot id -> item id (catalog: shared/character_items.json). */
export type LoadoutDto = Record<string, string>;

export interface OutfitPreset {
  slot_no: 1 | 2 | 3;
  name: string;
  loadout: LoadoutDto;
}

export interface CharacterView {
  loadout: LoadoutDto;
  /** Every item id the player owns (starter + level + bought/won). */
  owned: string[];
  presets: OutfitPreset[];
  wallet: Wallet;
}

export interface BoxResponse {
  item_id: string;
  duplicate: boolean;
  refund: number;
  character: CharacterView;
}

export interface ItemWheelResponse {
  /** Every landing in order; all but the last were owned (free re-spins). */
  rolls: string[];
  won: string;
  character: CharacterView;
}

export interface GameStat {
  game_id: string;
  best_score: number;
  plays: number;
}

export interface PublicProfile {
  username: string;
  level: number;
  loadout: LoadoutDto;
  joined: string;
  items_owned: number;
  stats: GameStat[];
  achievements: PublicAchievement[];
}

// ---------------------------------------------------------------------------
// Tic-Tac-Toe (server-authoritative AI matches)
// ---------------------------------------------------------------------------

export type TttDifficulty = "easy" | "medium" | "hard";

export interface TttMatch {
  id: string;
  difficulty: TttDifficulty;
  best_of: 3 | 5;
  face: string;
  board: string;
  user_wins: number;
  ai_wins: number;
  draws: number;
  moves: string;
  /** 9 cells, row by row: 0 empty, 1 you (X), 2 AI (O). */
  cells: (0 | 1 | 2)[];
  outcome: CfOutcome;
  winning_line: [number, number, number] | null;
  game_over: boolean;
  undos_left: number;
  used_undo: boolean;
  status: "active" | "won" | "lost" | "drawn" | "forfeited";
  points: number;
  ai_move: number | null;
  spin_granted: boolean;
  rewards: Granted | null;
}

export interface TttItemView {
  id: string;
  name: string;
  rarity: SkinRarity;
  price: number | null;
  owned: boolean;
}

export interface TttCollection {
  boards: TttItemView[];
  faces: TttItemView[];
  spins_available: number;
  has_photo: boolean;
}

export interface TttSpin {
  difficulty: TttDifficulty;
  /** Item keys like "board:neon" or "face:pig"; all but the last were owned. */
  rolls: string[];
  won: string | null;
  collection: TttCollection;
}

/** One day of the 7-day login streak. */
export interface LoginDayReward {
  day: number;
  coins: number;
  tokens: number;
}

export interface LoginStatus {
  claimed_today: boolean;
  /** Day claimed today, or the day the next claim pays (1..7). */
  streak_day: number;
  rewards: LoginDayReward[];
  /** ISO time when the next WIB day starts. */
  next_reset: string;
}

export interface LoginClaim {
  status: LoginStatus;
  granted: Granted;
}

export interface Quest {
  slot: number;
  id: string;
  title: string;
  progress: number;
  target: number;
  coins: number;
  xp: number;
  done: boolean;
  claimed: boolean;
}

export interface QuestsView {
  quests: Quest[];
  reroll_available: boolean;
  bonus_tokens: number;
  bonus_claimed: boolean;
  /** ISO time when tomorrow's quests arrive (00:00 WIB). */
  next_reset: string;
}

export interface QuestClaim {
  quests: QuestsView;
  granted: Granted;
  bonus: boolean;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  coins: number;
  xp: number;
  /** Title item id granted on claim (character catalog). */
  title: string;
  progress: number;
  target: number;
  unlocked: boolean;
  claimed_at: string | null;
}

export interface AchievementsView {
  achievements: Achievement[];
  /** Unlocked but not claimed yet. */
  ready: number;
  claimed: number;
}

export interface AchievementClaim {
  achievements: AchievementsView;
  granted: Granted;
  title: string;
}

/** A claimed achievement as shown on public profiles. */
export interface PublicAchievement {
  id: string;
  name: string;
  description: string;
  title: string;
  claimed_at: string;
}

// ---------------------------------------------------------------------------
// Whack-a-Mole
// ---------------------------------------------------------------------------

export type WamMode = "classic" | "frenzy" | "survival" | "daily";

export interface WamTap {
  t: number;
  hole: number;
}

export interface WamStart {
  run_id: string;
  seed: number;
  mode: WamMode;
  grid: 3 | 4;
}

/** The server's replay of a round (same shape as the engine's Summary). */
export interface WamSummary {
  score: number;
  hits: number;
  misses: number;
  escapes: number;
  best_streak: number;
  fever: boolean;
  golden_hits: number;
  bombs_hit: number;
  by_kind: number[];
  bosses_beaten: number;
  hole_hits: number[];
  hole_misses: number[];
  reaction_total_ms: number;
  reactions: number;
  ended_ms: number;
  lives_left: number;
}

export interface WamFinish {
  mode: WamMode;
  summary: WamSummary;
  previous_best: number;
  new_best: boolean;
  rewards: Granted;
  /** Lucky drop ("hammer:pan"), if any. */
  drop: string | null;
}

export interface WamItemView {
  id: string;
  name: string;
  rarity: "common" | "rare" | "epic" | "legendary";
  price: number | null;
  owned: boolean;
}

export interface WamCollection {
  hammers: WamItemView[];
  themes: WamItemView[];
}

// ---------------------------------------------------------------------------
// Minefield
// ---------------------------------------------------------------------------

export type MfDifficulty = "beginner" | "intermediate" | "expert" | "daily";

export interface MfResult {
  won: boolean;
  time_ms: number | null;
  score: number | null;
  three_bv: number | null;
  clicks: number;
  /** Only in the reply to the move that ended the game. */
  previous_best: number | null;
  new_best: boolean | null;
  rewards: Granted | null;
}

export interface MfGame {
  id: string;
  difficulty: MfDifficulty;
  rows: number;
  cols: number;
  mines: number;
  status: "new" | "playing" | "won" | "lost";
  /** -1 hidden, 0-8 opened, 9 mine (after the game), 10 the mine you hit. */
  cells: number[];
  elapsed_ms: number;
  hints_used: number;
  hints_left: number;
  result: MfResult | null;
}

// ---------------------------------------------------------------------------
// Stats page
// ---------------------------------------------------------------------------

export interface StatsSeries {
  game: "connect-four" | "tic-tac-toe";
  difficulty: string;
  played: number;
  won: number;
  lost: number;
  drawn: number;
}

export interface StatsBoard {
  game_id: string;
  level: number;
  rounds: number;
  best: number;
  average: number;
}

export interface StatsView {
  joined: string;
  level: number;
  xp: number;
  coins_earned: number;
  coins_spent: number;
  tokens_earned: number;
  best_login_streak: number;
  quests_claimed: number;
  achievements_claimed: number;
  series: StatsSeries[];
  boards: StatsBoard[];
  minefield: { difficulty: string; played: number; won: number; best_time_ms: number | null }[];
  whack: {
    rounds: number;
    best_streak: number | null;
    fever_rounds: number;
    golden_hits: number | null;
    longest_survival_ms: number | null;
  };
}

// ---------------------------------------------------------------------------
// Weekly leaderboards
// ---------------------------------------------------------------------------

export type LeaderboardPeriod = "all" | "today" | "week" | "last_week";

export interface WeeklyPrize {
  game_id: string;
  /** Board within the game; null = the whole game. */
  level: number | null;
  rank: 1 | 2 | 3;
  coins: number;
  tokens: number;
  claimed: boolean;
}

export interface WeeklyPrizes {
  /** Monday (WIB) the prize week started. */
  week: string;
  prizes: WeeklyPrize[];
}

export interface WeeklyClaim {
  claimed: WeeklyPrize[];
  rewards: Granted;
}
