//! Daily quests: 3 random quests per WIB day, progressed only by results the
//! server verified itself. Each pays coins + XP when claimed; claiming all 3
//! pays a bonus token. One free reroll (one quest) per day.
//!
//! This file is the pure part (pool + progress rules); `api` does the DB work.

pub mod api;

use rand::seq::SliceRandom;
use rand::Rng;

use crate::economy::{GameResult, Reward};

pub const QUESTS_PER_DAY: usize = 3;
pub const BONUS_TOKENS: i32 = 1;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Game {
    ConnectFour,
    TicTacToe,
}

/// A server-verified thing that happened. `level` is the AI difficulty:
/// 1 Easy, 2 Medium, 3 Hard, 4 Impossible (Connect Four only).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Event {
    AiGame { game: Game, level: i64, result: GameResult },
    SeriesWon { game: Game, level: i64, used_undo: bool },
    AngryBirdRound { score: i64 },
    WhackRound { score: i64, golden_hits: i64 },
    /// `level`: 1 Beginner, 2 Intermediate/Daily, 3 Expert.
    MinefieldWin { level: i64, hints: i64 },
    /// A finished 2048 game (20+ moves): leaderboard points, biggest tile.
    Game2048 { points: i64, max_tile: i64 },
    MysteryBox,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Goal {
    PlayAi(Game),
    WinAi { game: Option<Game>, min_level: i64 },
    WinOrDrawAi { game: Game, min_level: i64 },
    WinSeries { game: Option<Game>, min_level: i64, no_undo: bool },
    AngryBirdRounds,
    AngryBirdSingleScore(i64),
    AngryBirdTotalScore,
    OpenMysteryBox,
    WhackRounds,
    WhackSingleScore(i64),
    WhackGoldenHits,
    MinefieldWins { min_level: i64, no_hints: bool },
    Games2048,
    Tile2048(i64),
    Score2048(i64),
}

#[derive(Debug, Clone, Copy)]
pub struct QuestDef {
    pub id: &'static str,
    pub title: &'static str,
    goal: Goal,
    pub target: i32,
    pub coins: i64,
    pub xp: i64,
}

impl QuestDef {
    pub fn reward(&self) -> Reward {
        Reward { coins: self.coins, tokens: 0, xp: self.xp }
    }

    /// How much `ev` moves this quest forward (0 = not relevant).
    pub fn progress(&self, ev: &Event) -> i32 {
        use Event::*;
        let hit = |b: bool| i32::from(b);
        match (self.goal, *ev) {
            (Goal::PlayAi(g), AiGame { game, .. }) => hit(g == game),
            (Goal::WinAi { game: g, min_level }, AiGame { game, level, result }) => {
                hit(g.map_or(true, |g| g == game) && level >= min_level && result == GameResult::Win)
            }
            (Goal::WinOrDrawAi { game: g, min_level }, AiGame { game, level, result }) => {
                hit(g == game && level >= min_level && result != GameResult::Loss)
            }
            (Goal::WinSeries { game: g, min_level, no_undo }, SeriesWon { game, level, used_undo }) => {
                hit(g.map_or(true, |g| g == game) && level >= min_level && !(no_undo && used_undo))
            }
            (Goal::AngryBirdRounds, AngryBirdRound { .. }) => 1,
            (Goal::AngryBirdSingleScore(min), AngryBirdRound { score }) => hit(score >= min),
            (Goal::AngryBirdTotalScore, AngryBirdRound { score }) => {
                score.clamp(0, i32::MAX as i64) as i32
            }
            (Goal::OpenMysteryBox, MysteryBox) => 1,
            (Goal::WhackRounds, WhackRound { .. }) => 1,
            (Goal::WhackSingleScore(min), WhackRound { score, .. }) => hit(score >= min),
            (Goal::WhackGoldenHits, WhackRound { golden_hits, .. }) => {
                golden_hits.clamp(0, i32::MAX as i64) as i32
            }
            (Goal::MinefieldWins { min_level, no_hints }, MinefieldWin { level, hints }) => {
                hit(level >= min_level && !(no_hints && hints > 0))
            }
            (Goal::Games2048, Game2048 { .. }) => 1,
            (Goal::Tile2048(min), Game2048 { max_tile, .. }) => hit(max_tile >= min),
            (Goal::Score2048(min), Game2048 { points, .. }) => hit(points >= min),
            _ => 0,
        }
    }
}

const fn q(id: &'static str, title: &'static str, goal: Goal, target: i32, coins: i64, xp: i64) -> QuestDef {
    QuestDef { id, title, goal, target, coins, xp }
}

use Game::{ConnectFour as CF, TicTacToe as TTT};

pub const POOL: [QuestDef; 21] = [
    q("cf_play_3", "Play 3 Connect Four games vs the AI", Goal::PlayAi(CF), 3, 20, 30),
    q("cf_win_2_medium", "Win 2 Connect Four games vs Medium or harder",
        Goal::WinAi { game: Some(CF), min_level: 2 }, 2, 40, 60),
    q("cf_series_hard", "Win a Connect Four series vs Hard or Impossible",
        Goal::WinSeries { game: Some(CF), min_level: 3, no_undo: false }, 1, 60, 100),
    q("ttt_play_3", "Play 3 Tic-Tac-Toe games vs the AI", Goal::PlayAi(TTT), 3, 20, 30),
    q("ttt_survive_hard_2", "Win or draw 2 Tic-Tac-Toe games vs Hard",
        Goal::WinOrDrawAi { game: TTT, min_level: 3 }, 2, 40, 60),
    q("ttt_series_medium", "Win a Tic-Tac-Toe series vs Medium",
        Goal::WinSeries { game: Some(TTT), min_level: 2, no_undo: false }, 1, 40, 60),
    q("ab_play_3", "Play 3 Angry Bird rounds", Goal::AngryBirdRounds, 3, 20, 30),
    q("ab_score_5000", "Score 5,000 in one Angry Bird round", Goal::AngryBirdSingleScore(5_000), 1, 40, 60),
    q("ab_total_15000", "Score 15,000 in total in Angry Bird today", Goal::AngryBirdTotalScore, 15_000, 50, 80),
    q("series_no_undo", "Win any series without using undo",
        Goal::WinSeries { game: None, min_level: 1, no_undo: true }, 1, 50, 80),
    q("open_box", "Open a mystery box", Goal::OpenMysteryBox, 1, 30, 40),
    q("win_5_any", "Win 5 AI games in any game", Goal::WinAi { game: None, min_level: 1 }, 5, 60, 100),
    q("wam_play_3", "Play 3 Whack-a-Mole rounds", Goal::WhackRounds, 3, 20, 30),
    q("wam_score_5000", "Score 5,000 in one Whack-a-Mole round", Goal::WhackSingleScore(5_000), 1, 40, 60),
    q("wam_golden_5", "Hit 5 golden moles today", Goal::WhackGoldenHits, 5, 40, 60),
    q("mf_clear_2", "Clear 2 Minefield boards", Goal::MinefieldWins { min_level: 1, no_hints: false }, 2, 20, 30),
    q("mf_clear_intermediate", "Clear an Intermediate or harder Minefield board",
        Goal::MinefieldWins { min_level: 2, no_hints: false }, 1, 40, 60),
    q("mf_no_hints", "Clear a Minefield board without hints",
        Goal::MinefieldWins { min_level: 1, no_hints: true }, 1, 30, 40),
    q("g2048_play_3", "Play 3 games of 2048", Goal::Games2048, 3, 20, 30),
    q("g2048_tile_512", "Make a 512 tile in 2048", Goal::Tile2048(512), 1, 40, 60),
    q("g2048_score_10000", "Score 10,000 in one game of 2048", Goal::Score2048(10_000), 1, 40, 60),
];

pub fn find(id: &str) -> Option<&'static QuestDef> {
    POOL.iter().find(|q| q.id == id)
}

/// Pick `n` different quests, never one listed in `exclude`.
pub fn pick(n: usize, exclude: &[&str], rng: &mut impl Rng) -> Vec<&'static QuestDef> {
    let options: Vec<&QuestDef> = POOL.iter().filter(|q| !exclude.contains(&q.id)).collect();
    options.choose_multiple(rng, n).copied().collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand::SeedableRng;
    use rand_chacha::ChaCha8Rng;

    fn quest(id: &str) -> &'static QuestDef {
        find(id).unwrap()
    }

    const fn game(game: Game, level: i64, result: GameResult) -> Event {
        Event::AiGame { game, level, result }
    }

    #[test]
    fn pool_ids_are_unique_and_rewards_in_range() {
        let mut ids: Vec<_> = POOL.iter().map(|q| q.id).collect();
        ids.sort();
        ids.dedup();
        assert_eq!(ids.len(), POOL.len());
        assert!(POOL.iter().all(|q| (20..=60).contains(&q.coins) && q.xp > 0 && q.target > 0));
    }

    #[test]
    fn picks_are_distinct_and_respect_exclusions() {
        let mut r = ChaCha8Rng::seed_from_u64(3);
        for _ in 0..200 {
            let p = pick(3, &[], &mut r);
            assert_eq!(p.len(), 3);
            assert!(p[0].id != p[1].id && p[1].id != p[2].id && p[0].id != p[2].id);
            let ex: Vec<&str> = p.iter().map(|q| q.id).collect();
            let swap = pick(1, &ex, &mut r);
            assert!(!ex.contains(&swap[0].id));
        }
    }

    #[test]
    fn play_quests_count_any_result_of_their_game_only() {
        let q = quest("cf_play_3");
        assert_eq!(q.progress(&game(CF, 1, GameResult::Loss)), 1);
        assert_eq!(q.progress(&game(TTT, 1, GameResult::Win)), 0);
        assert_eq!(q.progress(&Event::MysteryBox), 0);
    }

    #[test]
    fn win_quests_check_difficulty_and_result() {
        let q = quest("cf_win_2_medium");
        assert_eq!(q.progress(&game(CF, 1, GameResult::Win)), 0);
        assert_eq!(q.progress(&game(CF, 2, GameResult::Draw)), 0);
        assert_eq!(q.progress(&game(CF, 4, GameResult::Win)), 1);
        let any = quest("win_5_any");
        assert_eq!(any.progress(&game(TTT, 1, GameResult::Win)), 1);
        assert_eq!(any.progress(&game(CF, 1, GameResult::Win)), 1);
        assert_eq!(any.progress(&game(CF, 1, GameResult::Loss)), 0);
    }

    #[test]
    fn surviving_hard_counts_draws() {
        let q = quest("ttt_survive_hard_2");
        assert_eq!(q.progress(&game(TTT, 3, GameResult::Draw)), 1);
        assert_eq!(q.progress(&game(TTT, 3, GameResult::Loss)), 0);
        assert_eq!(q.progress(&game(TTT, 2, GameResult::Draw)), 0);
    }

    #[test]
    fn series_quests_check_undo() {
        let won = |game, level, used_undo| Event::SeriesWon { game, level, used_undo };
        let q = quest("series_no_undo");
        assert_eq!(q.progress(&won(TTT, 1, false)), 1);
        assert_eq!(q.progress(&won(CF, 1, true)), 0);
        let hard = quest("cf_series_hard");
        assert_eq!(hard.progress(&won(CF, 3, true)), 1);
        assert_eq!(hard.progress(&won(CF, 2, false)), 0);
        assert_eq!(hard.progress(&won(TTT, 3, false)), 0);
    }

    #[test]
    fn whack_a_mole_quests() {
        let round = |score, golden_hits| Event::WhackRound { score, golden_hits };
        assert_eq!(quest("wam_play_3").progress(&round(0, 0)), 1);
        assert_eq!(quest("wam_score_5000").progress(&round(4_999, 3)), 0);
        assert_eq!(quest("wam_score_5000").progress(&round(5_000, 0)), 1);
        assert_eq!(quest("wam_golden_5").progress(&round(9_000, 2)), 2);
        assert_eq!(quest("wam_golden_5").progress(&Event::AngryBirdRound { score: 9_000 }), 0);
        assert_eq!(quest("ab_play_3").progress(&round(100, 0)), 0);
    }

    #[test]
    fn minefield_quests() {
        let win = |level, hints| Event::MinefieldWin { level, hints };
        assert_eq!(quest("mf_clear_2").progress(&win(1, 3)), 1);
        assert_eq!(quest("mf_clear_intermediate").progress(&win(1, 0)), 0);
        assert_eq!(quest("mf_clear_intermediate").progress(&win(3, 1)), 1);
        assert_eq!(quest("mf_no_hints").progress(&win(2, 1)), 0);
        assert_eq!(quest("mf_no_hints").progress(&win(1, 0)), 1);
        assert_eq!(quest("wam_play_3").progress(&win(1, 0)), 0);
    }

    #[test]
    fn quests_2048() {
        let game = |points, max_tile| Event::Game2048 { points, max_tile };
        assert_eq!(quest("g2048_play_3").progress(&game(0, 8)), 1);
        assert_eq!(quest("g2048_tile_512").progress(&game(9_000, 256)), 0);
        assert_eq!(quest("g2048_tile_512").progress(&game(3_000, 1024)), 1);
        assert_eq!(quest("g2048_score_10000").progress(&game(9_999, 2048)), 0);
        assert_eq!(quest("g2048_score_10000").progress(&game(10_000, 512)), 1);
        assert_eq!(quest("wam_play_3").progress(&game(10_000, 512)), 0);
    }

    #[test]
    fn angry_bird_quests() {
        let round = |score| Event::AngryBirdRound { score };
        assert_eq!(quest("ab_play_3").progress(&round(0)), 1);
        assert_eq!(quest("ab_score_5000").progress(&round(4_999)), 0);
        assert_eq!(quest("ab_score_5000").progress(&round(5_000)), 1);
        assert_eq!(quest("ab_total_15000").progress(&round(7_250)), 7_250);
        assert_eq!(quest("ab_total_15000").progress(&round(-3)), 0);
    }
}
