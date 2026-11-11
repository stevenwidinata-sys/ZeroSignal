//! Minefield rules: board generation, the logic solver that makes boards
//! "no-guess", opening cells (flood fill), chording and 3BV.
//!
//! Cells are indexed `row * cols + col`. The mines never leave the server.

use rand::seq::SliceRandom;
use rand::{Rng, SeedableRng};
use rand_chacha::ChaCha8Rng;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Difficulty {
    Beginner,
    Intermediate,
    Expert,
    Daily,
}

/// Size and scoring of one difficulty.
#[derive(Debug, Clone, Copy)]
pub struct Spec {
    pub rows: usize,
    pub cols: usize,
    pub mines: usize,
    /// Points for a win...
    pub base: i64,
    /// ...plus this many per second faster than `par_s`.
    pub per_second: i64,
    pub par_s: i64,
}

impl Difficulty {
    pub const ALL: [Difficulty; 4] =
        [Difficulty::Beginner, Difficulty::Intermediate, Difficulty::Expert, Difficulty::Daily];

    pub fn as_str(self) -> &'static str {
        match self {
            Difficulty::Beginner => "beginner",
            Difficulty::Intermediate => "intermediate",
            Difficulty::Expert => "expert",
            Difficulty::Daily => "daily",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|d| d.as_str() == s)
    }

    /// `scores.level`: one leaderboard per difficulty.
    pub fn board_id(self) -> i32 {
        match self {
            Difficulty::Beginner => 1,
            Difficulty::Intermediate => 2,
            Difficulty::Expert => 3,
            Difficulty::Daily => 4,
        }
    }

    pub fn spec(self) -> Spec {
        match self {
            Difficulty::Beginner => Spec { rows: 9, cols: 9, mines: 10, base: 1_000, per_second: 20, par_s: 60 },
            Difficulty::Intermediate | Difficulty::Daily => {
                Spec { rows: 16, cols: 16, mines: 40, base: 3_000, per_second: 15, par_s: 240 }
            }
            Difficulty::Expert => Spec { rows: 16, cols: 30, mines: 99, base: 8_000, per_second: 12, par_s: 600 },
        }
    }
}

/// Points for a win in `time_ms` (hint penalties already included).
pub fn score(d: Difficulty, time_ms: i64) -> i64 {
    let s = d.spec();
    let secs = time_ms.max(0) / 1_000;
    s.base + (s.par_s - secs).max(0) * s.per_second
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Board {
    pub rows: usize,
    pub cols: usize,
    pub mines: Vec<bool>,
    /// Mines around each cell.
    pub counts: Vec<u8>,
}

impl Board {
    pub fn from_mines(rows: usize, cols: usize, mines: Vec<bool>) -> Self {
        let mut b = Board { rows, cols, counts: vec![0; rows * cols], mines };
        for i in 0..rows * cols {
            b.counts[i] = b.neighbors(i).filter(|n| b.mines[*n]).count() as u8;
        }
        b
    }

    pub fn len(&self) -> usize {
        self.rows * self.cols
    }

    pub fn mine_count(&self) -> usize {
        self.mines.iter().filter(|m| **m).count()
    }

    pub fn neighbors(&self, i: usize) -> impl Iterator<Item = usize> + '_ {
        let (r, c) = ((i / self.cols) as isize, (i % self.cols) as isize);
        let (rows, cols) = (self.rows as isize, self.cols as isize);
        (-1..=1)
            .flat_map(move |dr| (-1..=1).map(move |dc| (dr, dc)))
            .filter(|&(dr, dc)| dr != 0 || dc != 0)
            .map(move |(dr, dc)| (r + dr, c + dc))
            .filter(move |&(nr, nc)| nr >= 0 && nc >= 0 && nr < rows && nc < cols)
            .map(move |(nr, nc)| (nr * cols + nc) as usize)
    }

    /// Open `start`; zeros spread to their neighbors. Returns newly opened cells.
    /// Never opens a mine (the caller checks `start` first).
    pub fn flood(&self, start: usize, open: &mut [bool]) -> Vec<usize> {
        let mut out = Vec::new();
        if open[start] || self.mines[start] {
            return out;
        }
        let mut stack = vec![start];
        open[start] = true;
        while let Some(i) = stack.pop() {
            out.push(i);
            if self.counts[i] == 0 {
                for n in self.neighbors(i).collect::<Vec<_>>() {
                    if !open[n] && !self.mines[n] {
                        open[n] = true;
                        stack.push(n);
                    }
                }
            }
        }
        out
    }

    pub fn is_cleared(&self, open: &[bool]) -> bool {
        (0..self.len()).all(|i| self.mines[i] || open[i])
    }

    /// 3BV: the fewest clicks that clear the board (each opening counts once,
    /// plus every number not touching an opening).
    pub fn three_bv(&self) -> u32 {
        let mut seen = vec![false; self.len()];
        let mut bv = 0;
        for i in 0..self.len() {
            if !self.mines[i] && self.counts[i] == 0 && !seen[i] {
                bv += 1;
                self.flood(i, &mut seen);
            }
        }
        bv + (0..self.len()).filter(|&i| !self.mines[i] && !seen[i]).count() as u32
    }
}

/// Random board with no mine on or next to `start`.
pub fn random_board(rng: &mut impl Rng, d: Difficulty, start: usize) -> Board {
    let s = d.spec();
    let probe = Board::from_mines(s.rows, s.cols, vec![false; s.rows * s.cols]);
    let mut keep_clear: Vec<usize> = probe.neighbors(start).collect();
    keep_clear.push(start);
    let mut cells: Vec<usize> = (0..s.rows * s.cols).filter(|i| !keep_clear.contains(i)).collect();
    cells.shuffle(rng);
    let mut mines = vec![false; s.rows * s.cols];
    for &i in cells.iter().take(s.mines) {
        mines[i] = true;
    }
    Board::from_mines(s.rows, s.cols, mines)
}

// ---------------------------------------------------------------------------
// Solver: only logic a careful human can do, no guessing.
// ---------------------------------------------------------------------------

/// Can the whole board be cleared from `start` by logic alone?
pub fn solvable(b: &Board, start: usize) -> bool {
    let mut open = vec![false; b.len()];
    let mut mine = vec![false; b.len()];
    b.flood(start, &mut open);
    let total_mines = b.mine_count();

    loop {
        if b.is_cleared(&open) {
            return true;
        }
        let mut progress = false;

        // Constraints: (unknown neighbors, mines still among them).
        let mut cons: Vec<(Vec<usize>, usize)> = Vec::new();
        for i in 0..b.len() {
            if !open[i] || b.counts[i] == 0 {
                continue;
            }
            let unknown: Vec<usize> = b.neighbors(i).filter(|n| !open[*n] && !mine[*n]).collect();
            if unknown.is_empty() {
                continue;
            }
            let known = b.neighbors(i).filter(|n| mine[*n]).count();
            cons.push((unknown, b.counts[i] as usize - known));
        }

        // Single-cell rules.
        for (u, k) in &cons {
            if *k == 0 {
                progress |= apply(b, u, false, &mut open, &mut mine);
            } else if *k == u.len() {
                progress |= apply(b, u, true, &mut open, &mut mine);
            }
        }
        // Subset rule: if A's cells are all in B, B's extra cells hold k_B - k_A mines.
        if !progress {
            'pairs: for a in 0..cons.len() {
                for bi in 0..cons.len() {
                    if a == bi {
                        continue;
                    }
                    let (ua, ka) = &cons[a];
                    let (ub, kb) = &cons[bi];
                    if ua.len() >= ub.len() || !ua.iter().all(|c| ub.contains(c)) || kb < ka {
                        continue;
                    }
                    let extra: Vec<usize> = ub.iter().copied().filter(|c| !ua.contains(c)).collect();
                    let left = kb - ka;
                    if left == 0 {
                        progress |= apply(b, &extra, false, &mut open, &mut mine);
                    } else if left == extra.len() {
                        progress |= apply(b, &extra, true, &mut open, &mut mine);
                    }
                    if progress {
                        break 'pairs;
                    }
                }
            }
        }
        // Mine count: no mines left, or every unknown cell is a mine.
        if !progress {
            let unknown: Vec<usize> = (0..b.len()).filter(|&i| !open[i] && !mine[i]).collect();
            let left = total_mines - mine.iter().filter(|m| **m).count();
            if left == 0 {
                progress |= apply(b, &unknown, false, &mut open, &mut mine);
            } else if left == unknown.len() {
                progress |= apply(b, &unknown, true, &mut open, &mut mine);
            }
        }
        if !progress {
            return false;
        }
    }
}

/// Mark `cells` as mines, or open them (proved safe). True if anything changed.
fn apply(b: &Board, cells: &[usize], are_mines: bool, open: &mut [bool], mine: &mut [bool]) -> bool {
    let mut changed = false;
    for &c in cells {
        if are_mines {
            if !mine[c] {
                mine[c] = true;
                changed = true;
            }
        } else if !open[c] {
            debug_assert!(!b.mines[c], "solver opened a mine");
            b.flood(c, open);
            changed = true;
        }
    }
    changed
}

/// Most boards this tries before settling for one that may need a guess.
pub const MAX_ATTEMPTS: u32 = 20_000;

/// A no-guess board for a first click on `start`, made from `seed`.
/// Returns the board and whether it is proven guess-free.
pub fn no_guess_board(seed: u64, d: Difficulty, start: usize) -> (Board, bool) {
    let mut rng = ChaCha8Rng::seed_from_u64(seed);
    let mut last = random_board(&mut rng, d, start);
    for _ in 0..MAX_ATTEMPTS {
        if solvable(&last, start) {
            return (last, true);
        }
        last = random_board(&mut rng, d, start);
    }
    (last, false)
}

/// The cell the Daily board opens on (middle of the board).
pub fn daily_start(d: Difficulty) -> usize {
    let s = d.spec();
    (s.rows / 2) * s.cols + s.cols / 2
}

/// Same Daily seed for everyone on a WIB date.
pub fn daily_seed(year: i32, month: u32, day: u32) -> u64 {
    (year as u64) * 10_000 + u64::from(month) * 100 + u64::from(day) ^ 0x4D49_4E45_4649_454C
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tiny(rows: usize, cols: usize, mines: &[usize]) -> Board {
        let mut m = vec![false; rows * cols];
        for &i in mines {
            m[i] = true;
        }
        Board::from_mines(rows, cols, m)
    }

    #[test]
    fn counts_and_neighbors() {
        // 3x3 with a mine in the middle: every other cell shows 1.
        let b = tiny(3, 3, &[4]);
        assert_eq!(b.counts, vec![1, 1, 1, 1, 0, 1, 1, 1, 1]);
        assert_eq!(b.neighbors(0).count(), 3);
        assert_eq!(b.neighbors(4).count(), 8);
    }

    #[test]
    fn flood_opens_zero_areas_and_stops_at_numbers() {
        // Row of 5, mine at the end: 0 0 0 1 *
        let b = tiny(1, 5, &[4]);
        let mut open = vec![false; 5];
        let opened = b.flood(0, &mut open);
        assert_eq!(opened.len(), 4);
        assert_eq!(open, vec![true, true, true, true, false]);
        assert!(b.is_cleared(&open));
    }

    #[test]
    fn three_bv() {
        // 0 0 0 1 * : one opening clears everything safe.
        assert_eq!(tiny(1, 5, &[4]).three_bv(), 1);
        // * 1 1 * : two isolated numbers.
        assert_eq!(tiny(1, 4, &[0, 3]).three_bv(), 2);
    }

    #[test]
    fn first_click_is_always_an_opening() {
        let mut rng = ChaCha8Rng::seed_from_u64(1);
        for d in [Difficulty::Beginner, Difficulty::Intermediate, Difficulty::Expert] {
            let s = d.spec();
            for start in [0, s.cols + 1, s.rows * s.cols - 1] {
                let b = random_board(&mut rng, d, start);
                assert_eq!(b.mine_count(), s.mines);
                assert!(!b.mines[start]);
                assert_eq!(b.counts[start], 0);
            }
        }
    }

    #[test]
    fn solver_spots_a_forced_guess() {
        // 2x2, one mine at the top-left, start bottom-right: the "1" can't
        // tell which of the other 3 cells is the mine.
        assert!(!solvable(&tiny(2, 2, &[0]), 3));
        // A board where everything is obvious.
        let easy = tiny(1, 5, &[4]);
        assert!(solvable(&easy, 0));
    }

    #[test]
    fn no_guess_boards_are_solvable_for_every_size() {
        for (seed, d) in [(1, Difficulty::Beginner), (2, Difficulty::Intermediate), (3, Difficulty::Expert)] {
            let s = d.spec();
            let start = daily_start(d);
            let (b, proven) = no_guess_board(seed, d, start);
            assert!(proven, "{d:?} found no guess-free board");
            assert!(solvable(&b, start));
            assert_eq!((b.rows, b.cols, b.mine_count()), (s.rows, s.cols, s.mines));
        }
    }

    #[test]
    fn daily_board_is_the_same_for_everyone() {
        let seed = daily_seed(2026, 11, 11);
        let d = Difficulty::Daily;
        assert_eq!(no_guess_board(seed, d, daily_start(d)).0, no_guess_board(seed, d, daily_start(d)).0);
        assert_ne!(seed, daily_seed(2026, 11, 12));
    }

    #[test]
    fn scoring() {
        assert_eq!(score(Difficulty::Beginner, 30_000), 1_000 + 30 * 20);
        assert_eq!(score(Difficulty::Beginner, 90_000), 1_000);
        assert_eq!(score(Difficulty::Expert, 100_999), 8_000 + 500 * 12);
        assert_eq!(score(Difficulty::Daily, 240_000), score(Difficulty::Intermediate, 240_000));
    }

    #[test]
    fn difficulties_round_trip() {
        for d in Difficulty::ALL {
            assert_eq!(Difficulty::parse(d.as_str()), Some(d));
        }
    }
}

#[cfg(test)]
mod bench {
    use super::*;

    #[test]
    #[ignore]
    fn generation_speed() {
        for d in [Difficulty::Beginner, Difficulty::Intermediate, Difficulty::Expert] {
            let t = std::time::Instant::now();
            let mut proven = 0;
            for seed in 0..20 {
                proven += i32::from(no_guess_board(seed, d, daily_start(d)).1);
            }
            println!("{d:?}: 20 boards in {:?}, proven {proven}/20", t.elapsed());
        }
    }
}
