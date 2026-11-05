//! Tic-Tac-Toe AI.
//! - Easy:   takes a win half the time, otherwise random.
//! - Medium: always wins/blocks, otherwise plays the best move only 40% of
//!           the time, so it can be beaten.
//! - Hard:   perfect minimax. It can never lose; the best you can get is a draw.

use std::sync::OnceLock;

use rand::seq::SliceRandom;
use rand::Rng;
use serde::{Deserialize, Serialize};

use super::board::{line_of, Board, Cells, LINES};
use crate::connect_four::board::{Outcome, Player};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Difficulty {
    Easy,
    Medium,
    Hard,
}

impl Difficulty {
    pub fn as_str(self) -> &'static str {
        match self {
            Difficulty::Easy => "easy",
            Difficulty::Medium => "medium",
            Difficulty::Hard => "hard",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "easy" => Some(Difficulty::Easy),
            "medium" => Some(Difficulty::Medium),
            "hard" => Some(Difficulty::Hard),
            _ => None,
        }
    }
}

/// Base-3 index of a board (3^9 = 19,683 possible boards).
fn index(cells: &Cells) -> usize {
    cells.iter().fold(0, |acc, &c| acc * 3 + c as usize)
}

/// Negamax value of every board for the player to move: positive = that
/// player wins (sooner is bigger), negative = loses (later is less bad),
/// 0 = draw. Computed once, then every lookup is instant.
fn table() -> &'static [i8] {
    static TABLE: OnceLock<Vec<i8>> = OnceLock::new();
    TABLE.get_or_init(|| {
        fn solve(cells: &mut Cells, memo: &mut [Option<i8>]) -> i8 {
            let idx = index(cells);
            if let Some(v) = memo[idx] {
                return v;
            }
            let empties = cells.iter().filter(|&&c| c == 0).count() as i8;
            let x = cells.iter().filter(|&&c| c == 1).count();
            let o = cells.iter().filter(|&&c| c == 2).count();
            let to_move = if x == o { 1 } else { 2 };
            let v = if line_of(cells, 3 - to_move).is_some() {
                // The previous player just won.
                -(empties + 1)
            } else if empties == 0 {
                0
            } else {
                let mut best = i8::MIN;
                for i in 0..cells.len() {
                    if cells[i] == 0 {
                        cells[i] = to_move;
                        best = best.max(-solve(cells, memo));
                        cells[i] = 0;
                    }
                }
                best
            };
            memo[idx] = Some(v);
            v
        }
        let mut memo = vec![None; 19_683];
        solve(&mut [0; 9], &mut memo);
        memo.into_iter().map(|v| v.unwrap_or(0)).collect()
    })
}

/// Every move with the best possible value for the player to move.
pub fn best_moves(b: &Board) -> Vec<u8> {
    let me = match b.to_move() {
        Player::P1 => 1,
        Player::P2 => 2,
    };
    let t = table();
    let mut cells = b.cells();
    let scored: Vec<(u8, i8)> = b
        .legal_moves()
        .into_iter()
        .map(|c| {
            cells[c as usize] = me;
            let v = -t[index(&cells)];
            cells[c as usize] = 0;
            (c, v)
        })
        .collect();
    let top = scored.iter().map(|&(_, v)| v).max().unwrap_or(0);
    scored.into_iter().filter(|&(_, v)| v == top).map(|(c, _)| c).collect()
}

fn mark_of(b: &Board) -> u8 {
    match b.to_move() {
        Player::P1 => 1,
        Player::P2 => 2,
    }
}

/// A cell that completes a line for `p` right now, if any.
fn finishing_cell(cells: &Cells, p: u8) -> Option<u8> {
    LINES.iter().find_map(|l| {
        let mine = l.iter().filter(|&&i| cells[i as usize] == p).count();
        let empty: Vec<u8> = l.iter().copied().filter(|&i| cells[i as usize] == 0).collect();
        (mine == 2 && empty.len() == 1).then(|| empty[0])
    })
}

pub fn choose_move(b: &Board, d: Difficulty, rng: &mut impl Rng) -> Option<u8> {
    let legal = b.legal_moves();
    if legal.is_empty() || b.outcome() != Outcome::Ongoing {
        return None;
    }
    let me = mark_of(b);
    let cells = b.cells();
    match d {
        Difficulty::Easy => {
            if rng.gen_bool(0.5) {
                if let Some(c) = finishing_cell(&cells, me) {
                    return Some(c);
                }
            }
            legal.choose(rng).copied()
        }
        Difficulty::Medium => {
            if let Some(c) = finishing_cell(&cells, me).or_else(|| finishing_cell(&cells, 3 - me)) {
                return Some(c);
            }
            if rng.gen_bool(0.4) {
                best_moves(b).choose(rng).copied()
            } else {
                legal.choose(rng).copied()
            }
        }
        Difficulty::Hard => best_moves(b).choose(rng).copied(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand::SeedableRng;
    use rand_chacha::ChaCha8Rng;

    fn b(s: &str) -> Board {
        Board::from_move_string(s).unwrap()
    }

    /// Explore every human (X) line against every equally-best Hard reply.
    /// Returns true if the human can ever win.
    fn human_can_win(board: &mut Board) -> bool {
        match board.outcome() {
            Outcome::Win(Player::P1) => return true,
            Outcome::Ongoing => {}
            _ => return false,
        }
        let moves = if board.to_move() == Player::P1 { board.legal_moves() } else { best_moves(board) };
        for c in moves {
            board.play(c).unwrap();
            let found = human_can_win(board);
            board.undo();
            if found {
                return true;
            }
        }
        false
    }

    #[test]
    fn hard_can_never_be_beaten() {
        assert!(!human_can_win(&mut Board::new()));
    }

    #[test]
    fn every_level_takes_an_obvious_win_or_hard_blocks() {
        let over = b("03142"); // X already won: no moves
        assert_eq!(choose_move(&over, Difficulty::Hard, &mut ChaCha8Rng::seed_from_u64(0)), None);
        // X: 0,1  O: 4 -> O must block at 2.
        let block = b("041");
        for seed in 0..10 {
            let mut r = ChaCha8Rng::seed_from_u64(seed);
            assert_eq!(choose_move(&block, Difficulty::Hard, &mut r), Some(2));
            assert_eq!(choose_move(&block, Difficulty::Medium, &mut r), Some(2));
        }
        // X: 3,4,8  O: 0,1 -> O wins at 2 (instead of blocking 5).
        let win = b("30418");
        for seed in 0..10 {
            let mut r = ChaCha8Rng::seed_from_u64(seed);
            assert_eq!(choose_move(&win, Difficulty::Hard, &mut r), Some(2));
            assert_eq!(choose_move(&win, Difficulty::Medium, &mut r), Some(2));
        }
    }

    #[test]
    fn solved_values_match_known_theory() {
        // Perfect play from the empty board is a draw.
        assert_eq!(table()[0], 0);
        // Corner opening answered off-center loses for O: center is required.
        assert_eq!(best_moves(&b("0")), vec![4]);
    }

    /// X plays perfectly; return how many of `n` games X wins vs `d`.
    fn perfect_wins_against(d: Difficulty, n: u64) -> usize {
        (0..n)
            .filter(|&seed| {
                let mut r = ChaCha8Rng::seed_from_u64(seed);
                let mut board = Board::new();
                while board.outcome() == Outcome::Ongoing {
                    let c = if board.to_move() == Player::P1 {
                        *best_moves(&board).choose(&mut r).unwrap()
                    } else {
                        choose_move(&board, d, &mut r).unwrap()
                    };
                    board.play(c).unwrap();
                }
                board.outcome() == Outcome::Win(Player::P1)
            })
            .count()
    }

    #[test]
    fn easy_and_medium_are_beatable_and_ordered() {
        let easy = perfect_wins_against(Difficulty::Easy, 300);
        let medium = perfect_wins_against(Difficulty::Medium, 300);
        let hard = perfect_wins_against(Difficulty::Hard, 100);
        assert!(easy > medium, "easy={easy} medium={medium}");
        assert!(medium > 0, "medium must be beatable");
        assert_eq!(hard, 0);
    }

    #[test]
    fn difficulty_round_trip() {
        for d in [Difficulty::Easy, Difficulty::Medium, Difficulty::Hard] {
            assert_eq!(Difficulty::parse(d.as_str()), Some(d));
        }
        assert_eq!(Difficulty::parse("impossible"), None);
    }
}
