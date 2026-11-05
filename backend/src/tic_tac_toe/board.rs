//! Tic-Tac-Toe rules (3x3). Cells are numbered 0..8, row by row from the top.
//! Moves are stored as a digit string ("402" = cells 4, 0, 2).

use crate::connect_four::board::{MoveError, Outcome, Player};

pub const CELLS: usize = 9;

pub const LINES: [[u8; 3]; 8] = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
];

/// 0 empty, 1 player one (X), 2 player two (O).
pub type Cells = [u8; CELLS];

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct Board {
    cells: Cells,
    moves: Vec<u8>,
}

/// The line `p` completed, if any.
pub fn line_of(cells: &Cells, p: u8) -> Option<[u8; 3]> {
    LINES.iter().copied().find(|l| l.iter().all(|&i| cells[i as usize] == p))
}

impl Board {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn from_move_string(s: &str) -> Result<Self, MoveError> {
        let mut b = Board::new();
        for ch in s.bytes() {
            let c = ch.checked_sub(b'0').filter(|&c| (c as usize) < CELLS).ok_or(MoveError::InvalidColumn)?;
            b.play(c)?;
        }
        Ok(b)
    }

    pub fn move_string(&self) -> String {
        self.moves.iter().map(|&c| char::from(b'0' + c)).collect()
    }

    pub fn moves(&self) -> &[u8] {
        &self.moves
    }

    pub fn cells(&self) -> Cells {
        self.cells
    }

    pub fn to_move(&self) -> Player {
        if self.moves.len() % 2 == 0 {
            Player::P1
        } else {
            Player::P2
        }
    }

    fn mark(p: Player) -> u8 {
        match p {
            Player::P1 => 1,
            Player::P2 => 2,
        }
    }

    pub fn legal_moves(&self) -> Vec<u8> {
        if self.outcome() != Outcome::Ongoing {
            return Vec::new();
        }
        (0..CELLS as u8).filter(|&c| self.cells[c as usize] == 0).collect()
    }

    pub fn play(&mut self, c: u8) -> Result<(), MoveError> {
        if c as usize >= CELLS {
            return Err(MoveError::InvalidColumn);
        }
        if self.outcome() != Outcome::Ongoing {
            return Err(MoveError::GameOver);
        }
        if self.cells[c as usize] != 0 {
            return Err(MoveError::ColumnFull);
        }
        self.cells[c as usize] = Self::mark(self.to_move());
        self.moves.push(c);
        Ok(())
    }

    pub fn undo(&mut self) -> Option<u8> {
        let c = self.moves.pop()?;
        self.cells[c as usize] = 0;
        Some(c)
    }

    pub fn outcome(&self) -> Outcome {
        for (p, m) in [(Player::P1, 1), (Player::P2, 2)] {
            if line_of(&self.cells, m).is_some() {
                return Outcome::Win(p);
            }
        }
        if self.moves.len() == CELLS {
            Outcome::Draw
        } else {
            Outcome::Ongoing
        }
    }

    pub fn winning_line(&self) -> Option<[u8; 3]> {
        line_of(&self.cells, 1).or_else(|| line_of(&self.cells, 2))
    }
}

/// Human-readable error for the API (Connect Four's says "column").
pub fn move_error_text(e: MoveError) -> &'static str {
    match e {
        MoveError::InvalidColumn => "cell must be between 0 and 8",
        MoveError::ColumnFull => "that cell is taken",
        MoveError::GameOver => "the game is already over",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn b(s: &str) -> Board {
        Board::from_move_string(s).unwrap()
    }

    #[test]
    fn empty_board() {
        let x = Board::new();
        assert_eq!(x.outcome(), Outcome::Ongoing);
        assert_eq!(x.to_move(), Player::P1);
        assert_eq!(x.legal_moves().len(), 9);
    }

    #[test]
    fn detects_rows_columns_and_diagonals() {
        // X: 0,1,2 (top row); O: 3,4
        assert_eq!(b("03142").outcome(), Outcome::Win(Player::P1));
        assert_eq!(b("03142").winning_line(), Some([0, 1, 2]));
        // X: 0,3,6 (left column)
        assert_eq!(b("01326").outcome(), Outcome::Win(Player::P1));
        // X: 0,4,8 diagonal
        assert_eq!(b("01428").winning_line(), Some([0, 4, 8]));
        // X: 2,4,6 anti-diagonal
        assert_eq!(b("20416").winning_line(), Some([2, 4, 6]));
    }

    #[test]
    fn player_two_can_win() {
        // X: 0,1,8  O: 2,4,6
        let x = b("021486");
        assert_eq!(x.outcome(), Outcome::Win(Player::P2));
        assert_eq!(x.winning_line(), Some([2, 4, 6]));
    }

    #[test]
    fn full_board_draw() {
        // X O X / X O O / O X X
        let x = b("014352687");
        assert_eq!(x.moves().len(), 9);
        assert_eq!(x.outcome(), Outcome::Draw);
        assert!(x.legal_moves().is_empty());
    }

    #[test]
    fn rejects_illegal_moves_and_undoes() {
        let mut x = b("4");
        assert_eq!(x.play(4), Err(MoveError::ColumnFull));
        assert_eq!(x.play(9), Err(MoveError::InvalidColumn));
        assert_eq!(Board::from_move_string("9"), Err(MoveError::InvalidColumn));
        assert_eq!(Board::from_move_string("44"), Err(MoveError::ColumnFull));
        let mut won = b("03142");
        assert_eq!(won.play(8), Err(MoveError::GameOver));
        assert_eq!(x.undo(), Some(4));
        assert_eq!(x, Board::new());
        assert_eq!(b("4021").move_string(), "4021");
    }
}
