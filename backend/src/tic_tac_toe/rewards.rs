//! Tic-Tac-Toe series rules and rewards.
//!
//! A series is exactly `best_of` games (draws count as games). It ends early
//! once one side can't be caught. Equal wins at the end = drawn series.
//! Hard AI is unbeatable, so surviving it (a drawn series) also pays out.

use rand::Rng;
use serde::Serialize;

use super::ai::Difficulty;
use crate::connect_four::board::{Outcome, Player};
use crate::economy::{self, GameResult, Reward};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SeriesState {
    Ongoing,
    Won,
    Lost,
    Drawn,
}

pub fn series_state(best_of: i16, user_wins: i16, ai_wins: i16, draws: i16) -> SeriesState {
    let remaining = (best_of - user_wins - ai_wins - draws).max(0);
    if user_wins > ai_wins + remaining {
        SeriesState::Won
    } else if ai_wins > user_wins + remaining {
        SeriesState::Lost
    } else if remaining == 0 {
        SeriesState::Drawn
    } else {
        SeriesState::Ongoing
    }
}

pub fn difficulty_mult(d: Difficulty) -> i64 {
    match d {
        Difficulty::Easy => 1,
        Difficulty::Medium => 2,
        Difficulty::Hard => 3,
    }
}

/// XP for one finished game. The user is always player 1 (X, moves first).
pub fn game_reward(d: Difficulty, outcome: Outcome) -> Reward {
    let result = match outcome {
        Outcome::Ongoing => return Reward::default(),
        Outcome::Win(Player::P1) => GameResult::Win,
        Outcome::Win(Player::P2) => GameResult::Loss,
        Outcome::Draw => GameResult::Draw,
    };
    Reward { xp: economy::game_xp(result, difficulty_mult(d)), ..Reward::default() }
}

/// What finishing a series pays: coins, bonus XP, token chance, a reward
/// spin, and leaderboard points.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct SeriesPayout {
    pub coins: i64,
    pub xp: i64,
    pub token_chance: f64,
    pub spin: bool,
    pub points: i32,
}

/// Easy 5 / Medium 15 / Hard 40 coins for a series win, Hard 15 for a drawn
/// series. Best of 5 pays double. `None` = nothing extra.
pub fn series_payout(d: Difficulty, best_of: i16, state: SeriesState) -> Option<SeriesPayout> {
    let mult = if best_of >= 5 { 2 } else { 1 };
    let (coins, token_chance, points) = match (state, d) {
        (SeriesState::Won, Difficulty::Easy) => (5, 0.08, 1),
        (SeriesState::Won, Difficulty::Medium) => (15, 0.15, 3),
        (SeriesState::Won, Difficulty::Hard) => (40, 0.50, 10),
        (SeriesState::Drawn, Difficulty::Hard) => (15, 0.15, 4),
        _ => return None,
    };
    Some(SeriesPayout {
        coins: coins * mult,
        xp: 20 * difficulty_mult(d) * mult as i64,
        token_chance,
        spin: true,
        points: points * mult as i32,
    })
}

pub fn payout_reward(p: &SeriesPayout, rng: &mut impl Rng) -> Reward {
    Reward { coins: p.coins, tokens: economy::roll_token(p.token_chance, rng), xp: p.xp }
}

#[cfg(test)]
mod tests {
    use super::*;
    use SeriesState::*;

    #[test]
    fn series_ends_early_when_decided() {
        assert_eq!(series_state(3, 0, 0, 0), Ongoing);
        assert_eq!(series_state(3, 1, 0, 0), Ongoing);
        assert_eq!(series_state(3, 2, 0, 0), Won);
        assert_eq!(series_state(3, 0, 2, 0), Lost);
        assert_eq!(series_state(3, 1, 0, 1), Ongoing); // AI can still tie 1-1
        assert_eq!(series_state(3, 1, 0, 2), Won);
        assert_eq!(series_state(5, 2, 0, 0), Ongoing);
        assert_eq!(series_state(5, 3, 0, 0), Won);
    }

    #[test]
    fn draws_use_up_games_and_ties_draw_the_series() {
        assert_eq!(series_state(3, 0, 0, 2), Ongoing);
        assert_eq!(series_state(3, 0, 0, 3), Drawn);
        assert_eq!(series_state(3, 1, 1, 1), Drawn);
        assert_eq!(series_state(5, 1, 1, 3), Drawn);
    }

    #[test]
    fn payout_table() {
        let w = |d| series_payout(d, 3, Won).unwrap().coins;
        assert_eq!((w(Difficulty::Easy), w(Difficulty::Medium), w(Difficulty::Hard)), (5, 15, 40));
        assert_eq!(series_payout(Difficulty::Hard, 3, Drawn).unwrap().coins, 15);
        assert_eq!(series_payout(Difficulty::Hard, 5, Won).unwrap().coins, 80);
        assert!(series_payout(Difficulty::Easy, 3, Drawn).is_none());
        assert!(series_payout(Difficulty::Hard, 3, Lost).is_none());
    }

    #[test]
    fn every_game_gives_xp() {
        for d in [Difficulty::Easy, Difficulty::Medium, Difficulty::Hard] {
            for o in [Outcome::Win(Player::P1), Outcome::Win(Player::P2), Outcome::Draw] {
                assert!(game_reward(d, o).xp > 0);
            }
        }
    }
}
