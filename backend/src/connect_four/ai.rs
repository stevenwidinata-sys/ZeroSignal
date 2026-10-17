//! Connect Four AI: negamax + alpha-beta + transposition table on the bitboard.
//!
//! Difficulty levels:
//! - Easy:       takes a win, blocks a threat only sometimes, otherwise random.
//! - Medium:     looks 4 moves ahead, picks randomly among near-best moves.
//! - Hard:       looks 8 moves ahead, picks among equally best moves.
//! - Impossible: iterative deepening as deep as the time budget allows. Once the
//!               game is solved inside the budget it plays perfectly.

use std::time::{Duration, Instant};

use rand::seq::SliceRandom;
use rand::Rng;
use serde::{Deserialize, Serialize};

use super::board::{column_mask, Board, Position, CELLS, WIDTH};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Difficulty {
    Easy,
    Medium,
    Hard,
    Impossible,
}

impl Difficulty {
    pub fn as_str(self) -> &'static str {
        match self {
            Difficulty::Easy => "easy",
            Difficulty::Medium => "medium",
            Difficulty::Hard => "hard",
            Difficulty::Impossible => "impossible",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "easy" => Some(Difficulty::Easy),
            "medium" => Some(Difficulty::Medium),
            "hard" => Some(Difficulty::Hard),
            "impossible" => Some(Difficulty::Impossible),
            _ => None,
        }
    }

    /// Default thinking-time cap per move (server).
    pub fn time_budget(self) -> Duration {
        match self {
            Difficulty::Impossible => Duration::from_millis(1500),
            _ => Duration::from_millis(800),
        }
    }
}

/// Pick a move for the player to move. `None` only if the game is over.
pub fn choose_move(board: &Board, d: Difficulty, rng: &mut impl Rng) -> Option<u8> {
    choose_move_within(board, d, rng, d.time_budget())
}

/// Like `choose_move` with an explicit time budget (tests use small ones).
pub fn choose_move_within(
    board: &Board,
    d: Difficulty,
    rng: &mut impl Rng,
    budget: Duration,
) -> Option<u8> {
    let legal = board.legal_moves();
    if legal.is_empty() {
        return None;
    }
    let p = board.position();

    // Every level takes an immediate win.
    if let Some(&c) = legal.iter().find(|&&c| p.is_winning_move(c)) {
        return Some(c);
    }

    match d {
        Difficulty::Easy => Some(easy_move(p, &legal, rng)),
        Difficulty::Medium => Some(search_move(p, 4, 6, budget, rng)),
        Difficulty::Hard => Some(search_move(p, 8, 0, budget, rng)),
        Difficulty::Impossible => Some(search_move(p, CELLS as u32, 0, budget, rng)),
    }
}

fn easy_move(p: Position, legal: &[u8], rng: &mut impl Rng) -> u8 {
    let threats = p.opponent_threats() & p.possible();
    if threats != 0 && rng.gen_bool(0.5) {
        if let Some(&c) = legal.iter().find(|&&c| threats & column_mask(c) != 0) {
            return c;
        }
    }
    *legal.choose(rng).expect("legal is non-empty")
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/// Win scores sit far above any heuristic value and prefer faster wins.
const WIN: i32 = 10_000;
const INF: i32 = 1_000_000;
/// Columns ordered center-first: central moves are usually better.
const ORDER: [u8; WIDTH as usize] = [3, 2, 4, 1, 5, 0, 6];
const TT_BITS: u32 = 18;

#[derive(Clone, Copy, Default)]
struct Entry {
    key: u64,
    value: i32,
    depth: u8,
    flag: u8, // 0 empty, 1 exact, 2 lower bound, 3 upper bound
}

struct Searcher {
    tt: Vec<Entry>,
    deadline: Instant,
    nodes: u64,
    aborted: bool,
}

/// Score of a win for the player to move at `p` on its next stone.
#[inline]
fn win_now(p: &Position) -> i32 {
    WIN + (CELLS - p.nb_moves()) as i32
}

impl Searcher {
    fn new(budget: Duration) -> Self {
        Searcher {
            tt: vec![Entry::default(); 1 << TT_BITS],
            deadline: Instant::now() + budget,
            nodes: 0,
            aborted: false,
        }
    }

    /// Static evaluation from the side to move: threats + center control.
    fn eval(p: &Position) -> i32 {
        let me = p.current;
        let opp = p.current ^ p.mask;
        let my_t = p.own_threats().count_ones() as i32;
        let op_t = p.opponent_threats().count_ones() as i32;
        let center = (me & column_mask(3)).count_ones() as i32
            - (opp & column_mask(3)).count_ones() as i32;
        8 * (my_t - op_t) + 3 * center
    }

    /// Ordered candidate columns that don't lose immediately.
    fn candidates(p: &Position, allowed: u64) -> Vec<u8> {
        let mut out: Vec<(i32, u8)> = ORDER
            .iter()
            .copied()
            .filter(|&c| allowed & column_mask(c) != 0)
            .map(|c| {
                // Prefer moves that create more of our own threats.
                let child = p.play(c);
                let created = super::board::winning_cells_for(child.current ^ child.mask, child.mask)
                    .count_ones() as i32;
                (created, c)
            })
            .collect();
        out.sort_by(|a, b| b.0.cmp(&a.0)); // stable: ties keep center order
        out.into_iter().map(|(_, c)| c).collect()
    }

    fn negamax(&mut self, p: Position, depth: u32, mut alpha: i32, mut beta: i32) -> i32 {
        self.nodes += 1;
        if self.nodes & 2047 == 0 && Instant::now() >= self.deadline {
            self.aborted = true;
        }
        if self.aborted {
            return 0;
        }

        // Immediate win for the side to move.
        let possible = p.possible();
        if p.own_threats() & possible != 0 {
            return win_now(&p);
        }
        let allowed = p.non_losing_moves();
        if allowed == 0 {
            // Every move lets the opponent win on their next stone.
            return -(WIN + (CELLS - p.nb_moves() - 1) as i32);
        }
        if p.nb_moves() >= CELLS - 2 {
            return 0; // nobody can complete a line any more
        }
        if depth == 0 {
            return Self::eval(&p);
        }

        let alpha0 = alpha;
        let idx = (p.key() as usize) & ((1 << TT_BITS) - 1);
        let e = self.tt[idx];
        if e.flag != 0 && e.key == p.key() && e.depth as u32 >= depth {
            match e.flag {
                1 => return e.value,
                2 => alpha = alpha.max(e.value),
                _ => beta = beta.min(e.value),
            }
            if alpha >= beta {
                return e.value;
            }
        }

        let mut best = -INF;
        for c in Self::candidates(&p, allowed) {
            let v = -self.negamax(p.play(c), depth - 1, -beta, -alpha);
            if self.aborted {
                return 0;
            }
            best = best.max(v);
            alpha = alpha.max(v);
            if alpha >= beta {
                break;
            }
        }

        let flag = if best <= alpha0 {
            3
        } else if best >= beta {
            2
        } else {
            1
        };
        self.tt[idx] = Entry { key: p.key(), value: best, depth: depth as u8, flag };
        best
    }

    /// Value of each root move searched to `depth` (exact, full window).
    fn root_values(&mut self, p: Position, depth: u32, moves: &[u8]) -> Option<Vec<(u8, i32)>> {
        let mut out = Vec::with_capacity(moves.len());
        for &c in moves {
            let v = -self.negamax(p.play(c), depth.saturating_sub(1), -INF, INF);
            if self.aborted {
                return None;
            }
            out.push((c, v));
        }
        Some(out)
    }
}

/// Iterative deepening up to `max_depth`; returns a random move among those
/// scoring within `tolerance` of the best from the deepest finished iteration.
fn search_move(
    p: Position,
    max_depth: u32,
    tolerance: i32,
    budget: Duration,
    rng: &mut impl Rng,
) -> u8 {
    let mut moves: Vec<u8> = (0..WIDTH).filter(|&c| p.can_play(c)).collect();
    moves.shuffle(rng); // variety between equally good moves
    let allowed = p.non_losing_moves();
    // If something doesn't lose immediately, never consider the rest.
    if allowed != 0 {
        moves.retain(|&c| allowed & column_mask(c) != 0);
    }

    let mut s = Searcher::new(budget);
    let mut values: Vec<(u8, i32)> = moves.iter().map(|&c| (c, 0)).collect();
    let remaining = (CELLS - p.nb_moves()) as u32;
    for depth in 1..=max_depth.min(remaining) {
        match s.root_values(p, depth, &moves) {
            Some(v) => values = v,
            None => break, // out of time: keep the last finished depth
        }
        let best = values.iter().map(|&(_, v)| v).max().unwrap_or(0);
        // A proven win or loss for every line: no need to look deeper.
        if best.abs() >= WIN || values.iter().all(|&(_, v)| v.abs() >= WIN) {
            break;
        }
        // Search the current best first next iteration (better pruning via TT).
        moves.sort_by_key(|&c| -values.iter().find(|&&(m, _)| m == c).map_or(0, |&(_, v)| v));
    }

    let best = values.iter().map(|&(_, v)| v).max().unwrap_or(0);
    // Never trade a proven win for a "close enough" move.
    let tol = if best >= WIN { 0 } else { tolerance };
    let pool: Vec<u8> = values.iter().filter(|&&(_, v)| v >= best - tol).map(|&(c, _)| c).collect();
    *pool.choose(rng).unwrap_or(&moves[0])
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::connect_four::board::{Outcome, Player};
    use rand::SeedableRng;
    use rand_chacha::ChaCha8Rng;

    const ALL: [Difficulty; 4] =
        [Difficulty::Easy, Difficulty::Medium, Difficulty::Hard, Difficulty::Impossible];
    const FAST: Duration = Duration::from_millis(150);

    fn rng(seed: u64) -> ChaCha8Rng {
        ChaCha8Rng::seed_from_u64(seed)
    }

    fn board(s: &str) -> Board {
        Board::from_move_string(s).unwrap()
    }

    #[test]
    fn difficulty_round_trip() {
        for d in ALL {
            assert_eq!(Difficulty::parse(d.as_str()), Some(d));
        }
        assert_eq!(Difficulty::parse("godlike"), None);
    }

    #[test]
    fn every_level_takes_an_immediate_win() {
        // P1 to move with three stacked in column 3.
        let b = board("343434");
        for d in ALL {
            for seed in 0..5 {
                assert_eq!(choose_move_within(&b, d, &mut rng(seed), FAST), Some(3), "{d:?}");
            }
        }
    }

    #[test]
    fn stronger_levels_always_block() {
        // P2 to move; P1 threatens column 3.
        let b = board("34343");
        for d in [Difficulty::Medium, Difficulty::Hard, Difficulty::Impossible] {
            for seed in 0..5 {
                assert_eq!(choose_move_within(&b, d, &mut rng(seed), FAST), Some(3), "{d:?}");
            }
        }
    }

    #[test]
    fn finds_a_forced_double_threat() {
        // P1 at (3,0),(4,0). Playing 2 or 5 makes an open three: unstoppable.
        let b = board("3344");
        for d in [Difficulty::Medium, Difficulty::Hard, Difficulty::Impossible] {
            let c = choose_move_within(&b, d, &mut rng(1), FAST).unwrap();
            assert!(c == 2 || c == 5, "{d:?} played {c}");
        }
    }

    #[test]
    fn no_move_when_game_is_over() {
        let b = board("3434343");
        assert_eq!(choose_move(&b, Difficulty::Easy, &mut rng(0)), None);
    }

    /// Play a full game; `p1` moves first. Returns the outcome.
    fn play(p1: Difficulty, p2: Difficulty, seed: u64) -> Outcome {
        let mut r = rng(seed);
        let mut b = Board::new();
        while b.outcome() == Outcome::Ongoing {
            let d = if b.to_move() == Player::P1 { p1 } else { p2 };
            let c = choose_move_within(&b, d, &mut r, Duration::from_millis(60)).unwrap();
            b.play(c).unwrap();
        }
        b.outcome()
    }

    #[test]
    fn hard_beats_easy_even_moving_second() {
        let wins = (0..6)
            .filter(|&s| play(Difficulty::Easy, Difficulty::Hard, s) == Outcome::Win(Player::P2))
            .count();
        assert!(wins >= 5, "hard won only {wins}/6");
    }

    #[test]
    fn impossible_never_loses_to_medium_moving_second() {
        for s in 0..4 {
            let o = play(Difficulty::Medium, Difficulty::Impossible, s);
            assert_ne!(o, Outcome::Win(Player::P1), "seed {s}");
        }
    }
}
