//! 2048 rules: the board, sliding and merging, seeded tile drops, undo, and
//! the replay that turns a move string into a score.
//!
//! The frontend has a line-for-line copy in `frontend/src/games/2048/
//! engine.ts`. Both use only 32-bit integer math for the random numbers, so
//! the same seed and moves always give the same board on both sides. A
//! shared test vector in both test suites catches drift. Change both files
//! together.

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Random numbers (mulberry32, same as Whack-a-Mole).
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Rng(u32);

impl Rng {
    pub fn new(seed: u32) -> Self {
        Rng(seed)
    }

    pub fn next_u32(&mut self) -> u32 {
        self.0 = self.0.wrapping_add(0x6D2B_79F5);
        let mut t = self.0;
        t = (t ^ (t >> 15)).wrapping_mul(t | 1);
        t ^= t.wrapping_add((t ^ (t >> 7)).wrapping_mul(t | 61));
        t ^ (t >> 14)
    }

    /// 0..n (n > 0).
    pub fn below(&mut self, n: u32) -> u32 {
        self.next_u32() % n
    }
}

/// Everyone gets the same Daily seed on the same WIB day.
pub fn daily_seed(year: i32, month: u32, day: u32) -> u32 {
    let mut r = Rng::new((year as u32).wrapping_mul(10_000).wrapping_add(month * 100 + day) ^ 0x2048);
    r.next_u32() ^ 0x2048_D41C
}

// ---------------------------------------------------------------------------
// Modes
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Mode {
    Classic,
    Big,
    Tiny,
    Daily,
}

impl Mode {
    pub const ALL: [Mode; 4] = [Mode::Classic, Mode::Big, Mode::Tiny, Mode::Daily];

    pub fn as_str(self) -> &'static str {
        match self {
            Mode::Classic => "classic",
            Mode::Big => "big",
            Mode::Tiny => "tiny",
            Mode::Daily => "daily",
        }
    }

    pub fn parse(s: &str) -> Option<Mode> {
        Mode::ALL.into_iter().find(|m| m.as_str() == s)
    }

    /// Stored in `scores.level` so each mode has its own leaderboard.
    pub fn board_id(self) -> i32 {
        match self {
            Mode::Classic => 1,
            Mode::Big => 2,
            Mode::Tiny => 3,
            Mode::Daily => 4,
        }
    }

    /// Board width and height.
    pub fn size(self) -> usize {
        match self {
            Mode::Classic | Mode::Daily => 4,
            Mode::Big => 5,
            Mode::Tiny => 3,
        }
    }

    /// Score multiplier in tenths (Big ×0.8, Tiny ×2).
    pub fn tenths(self) -> i64 {
        match self {
            Mode::Classic | Mode::Daily => 10,
            Mode::Big => 8,
            Mode::Tiny => 20,
        }
    }

    /// Undos allowed per game.
    pub fn undos(self) -> u32 {
        match self {
            Mode::Daily => 0,
            _ => MAX_UNDOS,
        }
    }
}

pub const MAX_UNDOS: u32 = 3;
/// A move string can't be longer than this.
pub const MAX_MOVES: usize = 200_000;

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Dir {
    Up,
    Down,
    Left,
    Right,
}

impl Dir {
    pub fn from_char(c: char) -> Option<Dir> {
        match c {
            'U' => Some(Dir::Up),
            'D' => Some(Dir::Down),
            'L' => Some(Dir::Left),
            'R' => Some(Dir::Right),
            _ => None,
        }
    }
}

pub const UNDO: char = 'Z';

/// Cell indexes of every line, each starting at the edge tiles slide toward.
pub fn lines(size: usize, dir: Dir) -> Vec<Vec<usize>> {
    (0..size)
        .map(|a| {
            (0..size)
                .map(|b| match dir {
                    Dir::Left => a * size + b,
                    Dir::Right => a * size + (size - 1 - b),
                    Dir::Up => b * size + a,
                    Dir::Down => (size - 1 - b) * size + a,
                })
                .collect()
        })
        .collect()
}

/// Slide every tile toward `dir`. Cells hold exponents (0 empty, 1 = 2,
/// 2 = 4, ...). Each tile merges at most once per move. Returns the new
/// cells and the points gained (the value of every merged tile).
pub fn slide(cells: &[u8], size: usize, dir: Dir) -> (Vec<u8>, i64) {
    let mut out = cells.to_vec();
    let mut gained = 0i64;
    for line in lines(size, dir) {
        let tiles: Vec<u8> = line.iter().map(|&i| cells[i]).filter(|&e| e > 0).collect();
        let mut merged = Vec::with_capacity(size);
        let mut k = 0;
        while k < tiles.len() {
            if k + 1 < tiles.len() && tiles[k] == tiles[k + 1] {
                let e = tiles[k] + 1;
                merged.push(e);
                gained += 1i64 << e;
                k += 2;
            } else {
                merged.push(tiles[k]);
                k += 1;
            }
        }
        for (j, &i) in line.iter().enumerate() {
            out[i] = merged.get(j).copied().unwrap_or(0);
        }
    }
    (out, gained)
}

#[derive(Debug, Clone)]
struct Snapshot {
    cells: Vec<u8>,
    rng: Rng,
    score: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReplayError {
    TooManyMoves,
    BadMove,
    /// The move doesn't change the board.
    NoChange,
    NoUndoLeft,
    NothingToUndo,
}

#[derive(Debug, Clone)]
pub struct Game {
    pub mode: Mode,
    pub size: usize,
    pub cells: Vec<u8>,
    rng: Rng,
    pub score: i64,
    /// Up to `MAX_UNDOS` boards before the latest moves.
    history: Vec<Snapshot>,
    pub undos_used: u32,
    /// Slides made (undos not counted, undone slides still counted).
    pub moves: u32,
    /// Biggest exponent ever on the board.
    pub best_exp: u8,
}

impl Game {
    pub fn new(seed: u32, mode: Mode) -> Game {
        let size = mode.size();
        let mut g = Game {
            mode,
            size,
            cells: vec![0; size * size],
            rng: Rng::new(seed),
            score: 0,
            history: Vec::new(),
            undos_used: 0,
            moves: 0,
            best_exp: 0,
        };
        g.spawn();
        g.spawn();
        g
    }

    /// Drop a 2 (90%) or 4 (10%) on a random empty cell.
    fn spawn(&mut self) {
        let empty: Vec<usize> = (0..self.cells.len()).filter(|&i| self.cells[i] == 0).collect();
        if empty.is_empty() {
            return;
        }
        let at = empty[self.rng.below(empty.len() as u32) as usize];
        let exp = if self.rng.below(10) == 0 { 2 } else { 1 };
        self.cells[at] = exp;
        self.best_exp = self.best_exp.max(exp);
    }

    pub fn undos_left(&self) -> u32 {
        self.mode.undos().saturating_sub(self.undos_used)
    }

    /// Apply one move character: `U D L R` or `Z` (undo).
    pub fn step(&mut self, c: char) -> Result<(), ReplayError> {
        if c == UNDO {
            if self.undos_left() == 0 {
                return Err(ReplayError::NoUndoLeft);
            }
            let s = self.history.pop().ok_or(ReplayError::NothingToUndo)?;
            self.cells = s.cells;
            self.rng = s.rng;
            self.score = s.score;
            self.undos_used += 1;
            return Ok(());
        }
        let dir = Dir::from_char(c).ok_or(ReplayError::BadMove)?;
        let (next, gained) = slide(&self.cells, self.size, dir);
        if next == self.cells {
            return Err(ReplayError::NoChange);
        }
        if self.undos_left() > 0 {
            self.history.push(Snapshot { cells: self.cells.clone(), rng: self.rng, score: self.score });
            if self.history.len() > MAX_UNDOS as usize {
                self.history.remove(0);
            }
        }
        self.best_exp = self.best_exp.max(next.iter().copied().max().unwrap_or(0));
        self.cells = next;
        self.score += gained;
        self.moves += 1;
        self.spawn();
        Ok(())
    }

    /// True while some move still changes the board.
    pub fn can_move(&self) -> bool {
        let n = self.size;
        (0..n * n).any(|i| {
            let e = self.cells[i];
            e == 0
                || (i % n + 1 < n && self.cells[i + 1] == e)
                || (i + n < n * n && self.cells[i + n] == e)
        })
    }

    pub fn max_tile(&self) -> i64 {
        if self.best_exp == 0 {
            0
        } else {
            1i64 << self.best_exp
        }
    }

    pub fn summary(&self) -> Summary {
        Summary {
            score: self.score,
            points: self.score * self.mode.tenths() / 10,
            max_tile: self.max_tile(),
            moves: self.moves,
            undos_used: self.undos_used,
            game_over: !self.can_move(),
        }
    }
}

/// What a replay worked out.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct Summary {
    /// Merge points before the mode multiplier.
    pub score: i64,
    /// After the multiplier: this goes on the leaderboard.
    pub points: i64,
    pub max_tile: i64,
    pub moves: u32,
    pub undos_used: u32,
    pub game_over: bool,
}

/// Rebuild a game from its seed and move string.
pub fn replay(seed: u32, mode: Mode, moves: &str) -> Result<Game, ReplayError> {
    if moves.len() > MAX_MOVES {
        return Err(ReplayError::TooManyMoves);
    }
    let mut g = Game::new(seed, mode);
    for c in moves.chars() {
        g.step(c)?;
    }
    Ok(g)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Plays the first move of L, D, R, U that changes the board until none does.
    fn greedy(seed: u32, mode: Mode, max: usize) -> String {
        let mut g = Game::new(seed, mode);
        let mut out = String::new();
        while out.len() < max {
            let Some(c) = ['L', 'D', 'R', 'U'].into_iter().find(|&c| g.clone().step(c).is_ok()) else {
                break;
            };
            g.step(c).unwrap();
            out.push(c);
        }
        out
    }

    fn fingerprint(seed: u32, mode: Mode) -> [i64; 5] {
        let moves = greedy(seed, mode, 5_000);
        let s = replay(seed, mode, &moves).unwrap().summary();
        [s.score, s.points, s.max_tile, s.moves as i64, i64::from(s.game_over)]
    }

    #[test]
    fn rng_matches_the_shared_test_vector() {
        // Same numbers as Whack-a-Mole and frontend engine.test.ts.
        let mut r = Rng::new(12345);
        let v: Vec<u32> = (0..4).map(|_| r.next_u32()).collect();
        assert_eq!(v, vec![4207900869, 1317490944, 2079646450, 3513001552]);
    }

    /// Same values are asserted in frontend engine.test.ts.
    #[test]
    fn start_boards_match_the_shared_test_vector() {
        assert_eq!(Game::new(42, Mode::Classic).cells, SHARED_START_42.to_vec());
        assert_eq!(Game::new(7, Mode::Tiny).cells, SHARED_START_7_TINY.to_vec());
    }

    /// Same fingerprints are asserted in frontend engine.test.ts.
    #[test]
    fn replays_match_the_shared_test_vector() {
        assert_eq!(fingerprint(42, Mode::Classic), SHARED_REPLAYS[0]);
        assert_eq!(fingerprint(5, Mode::Big), SHARED_REPLAYS[1]);
        assert_eq!(fingerprint(9, Mode::Tiny), SHARED_REPLAYS[2]);
        assert_eq!(fingerprint(daily_seed(2026, 11, 13), Mode::Daily), SHARED_REPLAYS[3]);
    }

    const SHARED_START_42: [u8; 16] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 2, 0, 0, 0];
    const SHARED_START_7_TINY: [u8; 9] = [0, 0, 0, 0, 0, 0, 2, 2, 0];
    const SHARED_REPLAYS: [[i64; 5]; 4] =
        [[1620, 1620, 128, 162, 1], [3776, 3020, 256, 336, 1], [268, 536, 32, 44, 1], [660, 660, 64, 87, 1]];

    /// `slide` on one row: pad it to a 4×4 board and read the first row back.
    fn row(vals: [u8; 4], dir: Dir) -> (Vec<u8>, i64) {
        let mut b = vec![0u8; 16];
        b[..4].copy_from_slice(&vals);
        let (out, gained) = slide(&b, 4, dir);
        (out[..4].to_vec(), gained)
    }

    #[test]
    fn slides_and_merges_once_per_move() {
        // Row [2,2,2,2] left -> [4,4,0,0], +8.
        assert_eq!(row([1, 1, 1, 1], Dir::Left), (vec![2, 2, 0, 0], 8));
        assert_eq!(row([1, 1, 1, 1], Dir::Right), (vec![0, 0, 2, 2], 8));
        // [2,0,2,4] left -> [4,4,0,0]: the new 4 doesn't merge again.
        assert_eq!(row([1, 0, 1, 2], Dir::Left), (vec![2, 2, 0, 0], 4));
        // [4,2,2,0] right -> [0,0,4,4].
        assert_eq!(row([2, 1, 1, 0], Dir::Right), (vec![0, 0, 2, 2], 4));
    }

    #[test]
    fn slides_work_in_every_direction() {
        // Column 0 holds 2, 2, 0, 4 from top to bottom.
        let mut b = vec![0u8; 16];
        b[0] = 1;
        b[4] = 1;
        b[12] = 2;
        let (up, g) = slide(&b, 4, Dir::Up);
        assert_eq!((up[0], up[4], up[8], up[12], g), (2, 2, 0, 0, 4));
        let (down, _) = slide(&b, 4, Dir::Down);
        assert_eq!((down[0], down[4], down[8], down[12]), (0, 0, 2, 2));
    }

    #[test]
    fn new_games_have_two_small_tiles() {
        for seed in 0..200 {
            for mode in Mode::ALL {
                let g = Game::new(seed, mode);
                let tiles: Vec<u8> = g.cells.iter().copied().filter(|&e| e > 0).collect();
                assert_eq!(tiles.len(), 2);
                assert!(tiles.iter().all(|&e| e == 1 || e == 2));
                assert_eq!(g.cells.len(), mode.size() * mode.size());
            }
        }
    }

    #[test]
    fn moves_that_change_nothing_are_rejected() {
        let mut g = Game::new(1, Mode::Classic);
        g.cells = vec![0; 16];
        g.cells[0] = 1;
        assert_eq!(g.step('L'), Err(ReplayError::NoChange));
        assert_eq!(g.step('U'), Err(ReplayError::NoChange));
        assert_eq!(g.step('R'), Ok(()));
        assert_eq!(g.step('X'), Err(ReplayError::BadMove));
    }

    #[test]
    fn undo_restores_board_score_and_tile_drops() {
        let mut g = Game::new(3, Mode::Classic);
        let moves = greedy(3, Mode::Classic, 30);
        for c in moves.chars() {
            g.step(c).unwrap();
        }
        let before = (g.cells.clone(), g.score);
        let c = moves.chars().next().unwrap();
        let c = ['L', 'D', 'R', 'U'].into_iter().find(|&d| g.clone().step(d).is_ok()).unwrap_or(c);
        let mut once = g.clone();
        once.step(c).unwrap();
        g.step(c).unwrap();
        g.step(UNDO).unwrap();
        assert_eq!((g.cells.clone(), g.score), before);
        // Same move again gives the same tile drop.
        g.step(c).unwrap();
        assert_eq!(g.cells, once.cells);
        assert_eq!(g.undos_used, 1);
    }

    #[test]
    fn undos_are_limited() {
        let moves = greedy(11, Mode::Classic, 10);
        let mut g = replay(11, Mode::Classic, &moves).unwrap();
        for _ in 0..3 {
            g.step(UNDO).unwrap();
        }
        assert_eq!(g.step(UNDO), Err(ReplayError::NoUndoLeft));
        let mut fresh = Game::new(11, Mode::Classic);
        assert_eq!(fresh.step(UNDO), Err(ReplayError::NothingToUndo));
        let daily_moves = greedy(11, Mode::Daily, 5);
        let mut d = replay(11, Mode::Daily, &daily_moves).unwrap();
        assert_eq!(d.step(UNDO), Err(ReplayError::NoUndoLeft));
    }

    #[test]
    fn games_end_and_score_with_the_multiplier() {
        for mode in Mode::ALL {
            let moves = greedy(21, mode, 100_000);
            let s = replay(21, mode, &moves).unwrap().summary();
            assert!(s.game_over, "{mode:?}");
            assert_eq!(s.points, s.score * mode.tenths() / 10);
            assert!(s.max_tile >= 4);
        }
    }

    #[test]
    fn replay_rejects_bad_input() {
        assert_eq!(replay(1, Mode::Classic, "LQ").err(), Some(ReplayError::BadMove));
        let long = "L".repeat(MAX_MOVES + 1);
        assert_eq!(replay(1, Mode::Classic, &long).err(), Some(ReplayError::TooManyMoves));
    }

    #[test]
    fn daily_seed_is_stable_per_day() {
        assert_eq!(daily_seed(2026, 11, 13), daily_seed(2026, 11, 13));
        assert_ne!(daily_seed(2026, 11, 13), daily_seed(2026, 11, 14));
    }

    #[test]
    fn modes_round_trip() {
        for m in Mode::ALL {
            assert_eq!(Mode::parse(m.as_str()), Some(m));
        }
        assert_eq!(Mode::parse("huge"), None);
    }
}
