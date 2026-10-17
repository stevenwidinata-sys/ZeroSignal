//! Game catalog. The server only accepts scores and serves leaderboards for
//! games listed here.
//!
//! Adding a game:
//!   1. Add a `GameInfo` entry below (status `ComingSoon` until it is playable).
//!   2. When it goes live, add a submit handler that computes the score
//!      server-side from player *inputs* (never trust a client-sent score),
//!      and route it at `POST /api/games/<id>/scores`.
//! Leaderboards and history work automatically for every game in this list.

use axum::Json;
use serde::Serialize;

use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum GameStatus {
    Live,
    ComingSoon,
}

#[derive(Debug, Clone, Serialize)]
pub struct GameInfo {
    pub id: &'static str,
    pub title: &'static str,
    pub status: GameStatus,
}

pub const ANGRY_BIRD: &str = "angry-bird";

pub const GAMES: &[GameInfo] = &[
    GameInfo {
        id: ANGRY_BIRD,
        title: "Angry Bird",
        status: GameStatus::Live,
    },
    GameInfo {
        id: "connect-four",
        title: "Connect Four",
        status: GameStatus::ComingSoon,
    },
    GameInfo {
        id: "tic-tac-toe",
        title: "Tic-Tac-Toe",
        status: GameStatus::ComingSoon,
    },
];

pub fn find(id: &str) -> Option<&'static GameInfo> {
    GAMES.iter().find(|g| g.id == id)
}

/// Resolve a game id from the URL, rejecting unknown games with 404.
pub fn require(id: &str) -> AppResult<&'static GameInfo> {
    find(id).ok_or(AppError::NotFound)
}

pub async fn list() -> Json<&'static [GameInfo]> {
    Json(GAMES)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ids_are_unique_and_url_safe() {
        for (i, g) in GAMES.iter().enumerate() {
            assert!(!g.id.is_empty() && g.id.len() <= 64);
            assert!(g
                .id
                .chars()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-'));
            assert!(GAMES[i + 1..].iter().all(|o| o.id != g.id), "duplicate id {}", g.id);
        }
    }

    #[test]
    fn unknown_games_are_rejected() {
        assert!(require(ANGRY_BIRD).is_ok());
        assert!(require("connect-four").is_ok());
        assert!(require("tic-tac-toe").is_ok());
        assert!(require("../etc").is_err());
        assert!(require("").is_err());
    }
}
