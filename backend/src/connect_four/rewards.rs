//! Connect Four coin / XP / token rewards (AI games only).

use rand::Rng;

use super::ai::Difficulty;
use super::board::{Outcome, Player};
use crate::economy::{self, GameResult, Reward};

pub fn difficulty_mult(d: Difficulty) -> i64 {
    match d {
        Difficulty::Easy => 1,
        Difficulty::Medium => 2,
        Difficulty::Hard => 3,
        Difficulty::Impossible => 4,
    }
}

/// XP for one finished game. The user is always player 1.
pub fn game_reward(d: Difficulty, outcome: Outcome) -> Reward {
    let result = match outcome {
        Outcome::Ongoing => return Reward::default(),
        Outcome::Win(Player::P1) => GameResult::Win,
        Outcome::Win(Player::P2) => GameResult::Loss,
        Outcome::Draw => GameResult::Draw,
    };
    Reward { xp: economy::game_xp(result, difficulty_mult(d)), ..Reward::default() }
}

/// Coins for winning a series: Easy 10 / Medium 25 / Hard 50 / Impossible 120,
/// doubled for best of 5. Plus bonus XP and a luck-based token drop.
pub fn series_reward(d: Difficulty, best_of: i16, rng: &mut impl Rng) -> Reward {
    let (coins, token_chance) = match d {
        Difficulty::Easy => (10, 0.10),
        Difficulty::Medium => (25, 0.20),
        Difficulty::Hard => (50, 0.35),
        Difficulty::Impossible => (120, 0.60),
    };
    let mult = if best_of >= 5 { 2 } else { 1 };
    Reward {
        coins: coins * mult,
        tokens: economy::roll_token(token_chance, rng),
        xp: 25 * difficulty_mult(d) * mult,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand::SeedableRng;
    use rand_chacha::ChaCha8Rng;

    const ALL: [Difficulty; 4] =
        [Difficulty::Easy, Difficulty::Medium, Difficulty::Hard, Difficulty::Impossible];

    #[test]
    fn series_coins_match_the_table_and_double_for_best_of_5() {
        let mut r = ChaCha8Rng::seed_from_u64(1);
        let coins: Vec<i64> = ALL.iter().map(|&d| series_reward(d, 3, &mut r).coins).collect();
        assert_eq!(coins, vec![10, 25, 50, 120]);
        assert_eq!(series_reward(Difficulty::Hard, 5, &mut r).coins, 100);
    }

    #[test]
    fn every_finished_game_gives_xp_but_only_wins_pay_coins() {
        for d in ALL {
            for o in [Outcome::Win(Player::P1), Outcome::Win(Player::P2), Outcome::Draw] {
                let r = game_reward(d, o);
                assert!(r.xp > 0);
                assert_eq!(r.coins, 0);
            }
            assert!(game_reward(d, Outcome::Ongoing).is_empty());
        }
    }

    #[test]
    fn harder_ai_drops_tokens_more_often() {
        let mut r = ChaCha8Rng::seed_from_u64(5);
        let drops: Vec<i32> = ALL
            .iter()
            .map(|&d| (0..4_000).map(|_| series_reward(d, 3, &mut r).tokens).sum())
            .collect();
        assert!(drops.windows(2).all(|w| w[0] < w[1]), "{drops:?}");
    }
}
