//! Connect Four rules on a bitboard (7 columns x 6 rows).
//!
//! Bit layout: column `c` uses bits `c*7 .. c*7+6`, bottom row first. Bit
//! `c*7+6` is an always-empty sentinel so shifts never wrap between columns.
//! `Position` is the compact `Copy` state used by the AI; `Board` adds the move
//! history so the server can replay, validate and undo games.

use serde::Serialize;

pub const WIDTH: u8 = 7;
pub const HEIGHT: u8 = 6;
pub const CELLS: u8 = WIDTH * HEIGHT;
const H1: u8 = HEIGHT + 1;

const fn bottom_row() -> u64 {
    let mut m = 0u64;
    let mut c = 0;
    while c < WIDTH {
        m |= 1 << (c * H1);
        c += 1;
    }
    m
}
const BOTTOM: u64 = bottom_row();
const BOARD_MASK: u64 = BOTTOM * ((1 << HEIGHT) - 1);

#[inline]
pub(crate) const fn bottom_mask_col(c: u8) -> u64 {
    1 << (c * H1)
}
#[inline]
const fn top_mask_col(c: u8) -> u64 {
    1 << (HEIGHT - 1 + c * H1)
}
#[inline]
pub(crate) const fn column_mask(c: u8) -> u64 {
    ((1 << HEIGHT) - 1) << (c * H1)
}

/// True if the stones in `m` contain four in a row in any direction.
pub(crate) fn alignment(m: u64) -> bool {
    // horizontal, diagonal (\), diagonal (/), vertical
    for shift in [H1, HEIGHT, H1 + 1, 1] {
        let x = m & (m >> shift);
        if x & (x >> (2 * shift)) != 0 {
            return true;
        }
    }
    false
}

/// Empty cells that would complete four in a row for `position`.
pub(crate) fn winning_cells_for(position: u64, mask: u64) -> u64 {
    // vertical
    let mut r = (position << 1) & (position << 2) & (position << 3);
    for s in [H1, HEIGHT, H1 + 1] {
        let p = (position << s) & (position << (2 * s));
        r |= p & (position << (3 * s));
        r |= p & (position >> s);
        let p = (position >> s) & (position >> (2 * s));
        r |= p & (position << s);
        r |= p & (position >> (3 * s));
    }
    r & (BOARD_MASK ^ mask)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Player {
    P1,
    P2,
}

impl Player {
    pub fn other(self) -> Self {
        match self {
            Player::P1 => Player::P2,
            Player::P2 => Player::P1,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case", tag = "kind", content = "winner")]
pub enum Outcome {
    Ongoing,
    Win(Player),
    Draw,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum MoveError {
    #[error("column must be between 0 and 6")]
    InvalidColumn,
    #[error("that column is full")]
    ColumnFull,
    #[error("the game is already over")]
    GameOver,
}

/// Compact position: stones of the player to move + occupied mask.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct Position {
    pub(crate) current: u64,
    pub(crate) mask: u64,
    pub(crate) nb_moves: u8,
}

impl Position {
    #[inline]
    pub fn can_play(&self, c: u8) -> bool {
        c < WIDTH && self.mask & top_mask_col(c) == 0
    }

    /// Play column `c` (caller must check `can_play`).
    #[inline]
    pub fn play(&self, c: u8) -> Position {
        let current = self.current ^ self.mask;
        let mask = self.mask | (self.mask + bottom_mask_col(c));
        Position { current, mask, nb_moves: self.nb_moves + 1 }
    }

    #[inline]
    pub fn is_winning_move(&self, c: u8) -> bool {
        let pos = self.current | ((self.mask + bottom_mask_col(c)) & column_mask(c));
        alignment(pos)
    }

    #[inline]
    pub fn nb_moves(&self) -> u8 {
        self.nb_moves
    }

    /// Unique key for transposition tables.
    #[inline]
    pub fn key(&self) -> u64 {
        self.current + self.mask
    }

    /// Bitmask of the lowest empty cell of every non-full column.
    #[inline]
    pub(crate) fn possible(&self) -> u64 {
        (self.mask + BOTTOM) & BOARD_MASK
    }

    #[inline]
    pub(crate) fn own_threats(&self) -> u64 {
        winning_cells_for(self.current, self.mask)
    }

    #[inline]
    pub(crate) fn opponent_threats(&self) -> u64 {
        winning_cells_for(self.current ^ self.mask, self.mask)
    }

    /// Playable cells that don't hand the opponent an immediate win.
    /// Returns 0 if every move loses. Assumes we have no immediate win.
    pub(crate) fn non_losing_moves(&self) -> u64 {
        let mut possible = self.possible();
        let opp = self.opponent_threats();
        let forced = possible & opp;
        if forced != 0 {
            if forced & (forced - 1) != 0 {
                return 0; // two threats: can't block both
            }
            possible = forced;
        }
        possible & !(opp >> 1) // don't play directly below an opponent threat
    }

    fn last_mover_stones(&self) -> u64 {
        self.current ^ self.mask
    }
}

/// A game with full move history.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct Board {
    pos: Position,
    moves: Vec<u8>,
}

impl Board {
    pub fn new() -> Self {
        Self::default()
    }

    /// Replay a move list, validating every move.
    pub fn from_moves(moves: &[u8]) -> Result<Self, MoveError> {
        let mut b = Board::new();
        for &c in moves {
            b.play(c)?;
        }
        Ok(b)
    }

    /// Moves are stored compactly as a digit string, e.g. "3324".
    pub fn from_move_string(s: &str) -> Result<Self, MoveError> {
        let moves: Vec<u8> = s
            .bytes()
            .map(|b| b.checked_sub(b'0').filter(|&c| c < WIDTH).ok_or(MoveError::InvalidColumn))
            .collect::<Result<_, _>>()?;
        Self::from_moves(&moves)
    }

    pub fn move_string(&self) -> String {
        self.moves.iter().map(|&c| char::from(b'0' + c)).collect()
    }

    pub fn moves(&self) -> &[u8] {
        &self.moves
    }

    pub fn position(&self) -> Position {
        self.pos
    }

    pub fn to_move(&self) -> Player {
        if self.moves.len() % 2 == 0 {
            Player::P1
        } else {
            Player::P2
        }
    }

    pub fn can_play(&self, c: u8) -> bool {
        self.pos.can_play(c)
    }

    pub fn legal_moves(&self) -> Vec<u8> {
        if self.outcome() != Outcome::Ongoing {
            return Vec::new();
        }
        (0..WIDTH).filter(|&c| self.pos.can_play(c)).collect()
    }

    pub fn play(&mut self, c: u8) -> Result<(), MoveError> {
        if c >= WIDTH {
            return Err(MoveError::InvalidColumn);
        }
        if self.outcome() != Outcome::Ongoing {
            return Err(MoveError::GameOver);
        }
        if !self.pos.can_play(c) {
            return Err(MoveError::ColumnFull);
        }
        self.pos = self.pos.play(c);
        self.moves.push(c);
        Ok(())
    }

    /// Take back the last move. Returns the column it was played in.
    pub fn undo(&mut self) -> Option<u8> {
        let moves = std::mem::take(&mut self.moves);
        let (&last, rest) = moves.split_last()?;
        // Replaying is simple and cheap (at most 41 moves).
        *self = Board::from_moves(rest).expect("prefix of a legal game is legal");
        Some(last)
    }

    pub fn outcome(&self) -> Outcome {
        if self.moves.is_empty() {
            return Outcome::Ongoing;
        }
        if alignment(self.pos.last_mover_stones()) {
            return Outcome::Win(self.to_move().other());
        }
        if self.moves.len() == CELLS as usize {
            return Outcome::Draw;
        }
        Outcome::Ongoing
    }

    /// Stones of `p` as a bitmask.
    fn stones(&self, p: Player) -> u64 {
        if p == self.to_move() {
            self.pos.current
        } else {
            self.pos.last_mover_stones()
        }
    }

    /// `cells[col][row]`, row 0 = bottom. 0 empty, 1 player one, 2 player two.
    pub fn cells(&self) -> Vec<Vec<u8>> {
        let p1 = self.stones(Player::P1);
        (0..WIDTH)
            .map(|c| {
                (0..HEIGHT)
                    .map(|r| {
                        let bit = 1u64 << (c * H1 + r);
                        if self.pos.mask & bit == 0 {
                            0
                        } else if p1 & bit != 0 {
                            1
                        } else {
                            2
                        }
                    })
                    .collect()
            })
            .collect()
    }

    /// The `[col, row]` cells of every winning line (empty if no winner).
    pub fn winning_cells(&self) -> Vec<[u8; 2]> {
        let Outcome::Win(p) = self.outcome() else {
            return Vec::new();
        };
        let bits = self.stones(p);
        let has = |c: i8, r: i8| {
            (0..WIDTH as i8).contains(&c)
                && (0..HEIGHT as i8).contains(&r)
                && bits & (1u64 << (c as u8 * H1 + r as u8)) != 0
        };
        let mut out: Vec<[u8; 2]> = Vec::new();
        for c in 0..WIDTH as i8 {
            for r in 0..HEIGHT as i8 {
                for (dc, dr) in [(1, 0), (0, 1), (1, 1), (1, -1)] {
                    if (0..4).all(|i| has(c + dc * i, r + dr * i)) {
                        for i in 0..4 {
                            let cell = [(c + dc * i) as u8, (r + dr * i) as u8];
                            if !out.contains(&cell) {
                                out.push(cell);
                            }
                        }
                    }
                }
            }
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn board(s: &str) -> Board {
        Board::from_move_string(s).unwrap()
    }

    #[test]
    fn empty_board() {
        let b = Board::new();
        assert_eq!(b.outcome(), Outcome::Ongoing);
        assert_eq!(b.to_move(), Player::P1);
        assert_eq!(b.legal_moves(), vec![0, 1, 2, 3, 4, 5, 6]);
        assert!(b.cells().iter().flatten().all(|&v| v == 0));
    }

    #[test]
    fn vertical_win() {
        let b = board("3434343");
        assert_eq!(b.outcome(), Outcome::Win(Player::P1));
        let mut w = b.winning_cells();
        w.sort();
        assert_eq!(w, vec![[3, 0], [3, 1], [3, 2], [3, 3]]);
    }

    #[test]
    fn horizontal_win() {
        let b = board("0011223");
        assert_eq!(b.outcome(), Outcome::Win(Player::P1));
        assert_eq!(b.winning_cells().len(), 4);
    }

    #[test]
    fn diagonal_wins_both_directions() {
        let b = board("01126223333");
        assert_eq!(b.outcome(), Outcome::Win(Player::P1));
        let mut w = b.winning_cells();
        w.sort();
        assert_eq!(w, vec![[0, 0], [1, 1], [2, 2], [3, 3]]);

        let b = board("65540443333");
        assert_eq!(b.outcome(), Outcome::Win(Player::P1));
        let mut w = b.winning_cells();
        w.sort();
        assert_eq!(w, vec![[3, 3], [4, 2], [5, 1], [6, 0]]);
    }

    #[test]
    fn player_two_can_win() {
        assert_eq!(board("1020102").outcome(), Outcome::Ongoing);
        let b = board("10201020"); // P2 stacks column 0
        assert_eq!(b.outcome(), Outcome::Win(Player::P2));
        assert_eq!(b.cells()[0], vec![2, 2, 2, 2, 0, 0]);
    }

    #[test]
    fn full_board_without_line_is_a_draw() {
        let s = "022002200220133113311331466446644664555555";
        assert_eq!(s.len(), 42);
        let b = board(s);
        assert_eq!(b.outcome(), Outcome::Draw);
        assert!(b.legal_moves().is_empty());
        // Every prefix was a legal, unfinished game.
        for i in 0..42 {
            assert_eq!(board(&s[..i]).outcome(), Outcome::Ongoing, "prefix {i}");
        }
    }

    #[test]
    fn rejects_illegal_moves() {
        let mut b = board("000000");
        assert_eq!(b.play(0), Err(MoveError::ColumnFull));
        assert_eq!(b.play(7), Err(MoveError::InvalidColumn));
        let mut won = board("3434343");
        assert_eq!(won.play(0), Err(MoveError::GameOver));
        assert_eq!(Board::from_move_string("38"), Err(MoveError::InvalidColumn));
        assert_eq!(Board::from_move_string("a"), Err(MoveError::InvalidColumn));
        assert!(b.play(1).is_ok());
    }

    #[test]
    fn undo_restores_previous_position() {
        let mut b = board("3324");
        let before = board("332");
        assert_eq!(b.undo(), Some(4));
        assert_eq!(b, before);
        assert_eq!(b.to_move(), Player::P2);
        assert_eq!(Board::new().undo(), None);
    }

    #[test]
    fn cells_layout_is_col_then_row_from_bottom() {
        let c = board("33").cells();
        assert_eq!(c[3][0], 1);
        assert_eq!(c[3][1], 2);
        assert_eq!(c[3][2], 0);
        assert_eq!(c.len(), 7);
        assert_eq!(c[0].len(), 6);
    }

    #[test]
    fn move_string_round_trip() {
        assert_eq!(board("0123456").move_string(), "0123456");
    }

    #[test]
    fn lines_do_not_wrap_between_columns() {
        // col 0 rows 3..5 + col 1 row 0 are adjacent bits only via the sentinel.
        let m = (1 << 3) | (1 << 4) | (1 << 5) | (1 << 7);
        assert!(!alignment(m));
    }

    #[test]
    fn winning_move_and_threat_detection() {
        let p = board("343434").position(); // P1 has 3 in col 3
        assert!(p.is_winning_move(3));
        assert!(!p.is_winning_move(0));
        assert_ne!(p.own_threats(), 0);
    }
}
