//! Connect Four HTTP API. The server owns every AI match: it stores the board,
//! validates each move, plays the AI reply and decides results, points and
//! reward spins. Clients only ever send a column number.

use axum::extract::{Path, State};
use axum::Json;
use serde::{Deserialize, Serialize};
use sqlx::{Postgres, Transaction};
use uuid::Uuid;

use super::ai::{choose_move, Difficulty};
use super::board::{Board, Outcome, Player};
use super::skins::{self, Rarity};
use crate::auth::jwt::AuthUser;
use crate::error::{AppError, AppResult};
use crate::state::AppState;

pub const GAME_ID: &str = "connect-four";
pub const MAX_UNDOS: i16 = 3;

// ---------------------------------------------------------------------------
// Match state
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct MatchRow {
    pub id: Uuid,
    pub difficulty: String,
    pub best_of: i16,
    pub skin: String,
    pub user_wins: i16,
    pub ai_wins: i16,
    pub draws: i16,
    pub moves: String,
    pub game_over: bool,
    pub undos_used: i16,
    pub used_undo: bool,
    pub status: String,
    pub points: i32,
}

const MATCH_COLS: &str = "id, difficulty, best_of, skin, user_wins, ai_wins, draws, moves, \
                          game_over, undos_used, used_undo, status, points";

impl MatchRow {
    fn difficulty(&self) -> Difficulty {
        Difficulty::parse(&self.difficulty).unwrap_or(Difficulty::Easy)
    }

    fn board(&self) -> AppResult<Board> {
        Board::from_move_string(&self.moves)
            .map_err(|e| AppError::Internal(anyhow::anyhow!("corrupt match board: {e}")))
    }

    fn undos_left(&self) -> i16 {
        if self.difficulty() == Difficulty::Impossible {
            0
        } else {
            MAX_UNDOS - self.undos_used
        }
    }
}

/// How a finished game changed the series.
#[derive(Debug, PartialEq, Eq)]
pub enum SeriesEnd {
    Won,
    Lost,
}

/// Record a finished game on the series. The user is always player 1.
/// Draws don't count toward the series; it continues until someone reaches a
/// majority of `best_of`.
pub fn record_game(m: &mut MatchRow, outcome: Outcome) -> Option<SeriesEnd> {
    match outcome {
        Outcome::Ongoing => return None,
        Outcome::Win(Player::P1) => m.user_wins += 1,
        Outcome::Win(Player::P2) => m.ai_wins += 1,
        Outcome::Draw => m.draws += 1,
    }
    m.game_over = true;
    let need = m.best_of / 2 + 1;
    if m.user_wins >= need {
        m.status = "won".into();
        Some(SeriesEnd::Won)
    } else if m.ai_wins >= need {
        m.status = "lost".into();
        Some(SeriesEnd::Lost)
    } else {
        None
    }
}

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

#[derive(Serialize)]
pub struct MatchView {
    pub id: Uuid,
    pub difficulty: Difficulty,
    pub best_of: i16,
    pub skin: String,
    pub user_wins: i16,
    pub ai_wins: i16,
    pub draws: i16,
    pub moves: String,
    /// `cells[col][row]`, row 0 = bottom. 0 empty, 1 you, 2 AI.
    pub cells: Vec<Vec<u8>>,
    pub outcome: Outcome,
    pub winning_cells: Vec<[u8; 2]>,
    pub game_over: bool,
    pub undos_left: i16,
    pub used_undo: bool,
    pub status: String,
    pub points: i32,
    /// Column the AI just played (move responses only).
    pub ai_move: Option<u8>,
    /// True when this response finished the series and granted a spin.
    pub spin_granted: bool,
}

fn view(m: &MatchRow, ai_move: Option<u8>, spin_granted: bool) -> AppResult<MatchView> {
    let b = m.board()?;
    Ok(MatchView {
        id: m.id,
        difficulty: m.difficulty(),
        best_of: m.best_of,
        skin: m.skin.clone(),
        user_wins: m.user_wins,
        ai_wins: m.ai_wins,
        draws: m.draws,
        moves: m.moves.clone(),
        cells: b.cells(),
        outcome: b.outcome(),
        winning_cells: b.winning_cells(),
        game_over: m.game_over,
        undos_left: m.undos_left(),
        used_undo: m.used_undo,
        status: m.status.clone(),
        points: m.points,
        ai_move,
        spin_granted,
    })
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

async fn owned_skins(tx: &mut Transaction<'_, Postgres>, user_id: Uuid) -> AppResult<Vec<String>> {
    Ok(sqlx::query_scalar("SELECT skin_id FROM user_skins WHERE user_id = $1")
        .bind(user_id)
        .fetch_all(&mut **tx)
        .await?)
}

/// Lock the user's match row for the rest of the transaction.
async fn lock_match(
    tx: &mut Transaction<'_, Postgres>,
    id: Uuid,
    user_id: Uuid,
) -> AppResult<MatchRow> {
    sqlx::query_as(&format!(
        "SELECT {MATCH_COLS} FROM cf_matches WHERE id = $1 AND user_id = $2 FOR UPDATE"
    ))
    .bind(id)
    .bind(user_id)
    .fetch_optional(&mut **tx)
    .await?
    .ok_or(AppError::NotFound)
}

async fn save_match(tx: &mut Transaction<'_, Postgres>, m: &MatchRow) -> AppResult<()> {
    sqlx::query(
        r#"UPDATE cf_matches SET user_wins = $2, ai_wins = $3, draws = $4, moves = $5,
               game_over = $6, undos_used = $7, used_undo = $8, status = $9, points = $10,
               updated_at = now()
           WHERE id = $1"#,
    )
    .bind(m.id)
    .bind(m.user_wins)
    .bind(m.ai_wins)
    .bind(m.draws)
    .bind(&m.moves)
    .bind(m.game_over)
    .bind(m.undos_used)
    .bind(m.used_undo)
    .bind(&m.status)
    .bind(m.points)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

fn level_of(d: Difficulty) -> i32 {
    match d {
        Difficulty::Easy => 1,
        Difficulty::Medium => 2,
        Difficulty::Hard => 3,
        Difficulty::Impossible => 4,
    }
}

/// Pay out a won series: leaderboard points and (if no undo) a reward spin.
/// Returns whether a spin was granted.
async fn reward_series(
    tx: &mut Transaction<'_, Postgres>,
    user_id: Uuid,
    m: &mut MatchRow,
) -> AppResult<bool> {
    let d = m.difficulty();
    m.points = skins::series_points(d, m.best_of);

    // Leaderboards rank by MAX(score), so each row stores the running total.
    let total: i32 = sqlx::query_scalar(
        "SELECT COALESCE(MAX(score), 0) FROM scores WHERE user_id = $1 AND game_id = $2",
    )
    .bind(user_id)
    .bind(GAME_ID)
    .fetch_one(&mut **tx)
    .await?;
    sqlx::query("INSERT INTO scores (user_id, game_id, score, level) VALUES ($1, $2, $3, $4)")
        .bind(user_id)
        .bind(GAME_ID)
        .bind(total + m.points)
        .bind(level_of(d))
        .execute(&mut **tx)
        .await?;

    if m.used_undo {
        return Ok(false);
    }
    // UNIQUE(match_id) makes a double payout impossible.
    let granted = sqlx::query(
        r#"INSERT INTO cf_spins (user_id, match_id, difficulty) VALUES ($1, $2, $3)
           ON CONFLICT (match_id) DO NOTHING"#,
    )
    .bind(user_id)
    .bind(m.id)
    .bind(d.as_str())
    .execute(&mut **tx)
    .await?
    .rows_affected()
        == 1;
    Ok(granted)
}

fn require_playable(m: &MatchRow) -> AppResult<()> {
    if m.status != "active" {
        return Err(AppError::Validation("this series is finished".into()));
    }
    if m.game_over {
        return Err(AppError::Validation("game over: start the next game".into()));
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CreateMatch {
    pub difficulty: Difficulty,
    pub best_of: i16,
    pub skin: String,
}

/// Start a new series. Any unfinished series is forfeited.
pub async fn create_match(
    State(state): State<AppState>,
    user: AuthUser,
    Json(req): Json<CreateMatch>,
) -> AppResult<Json<MatchView>> {
    if req.best_of != 3 && req.best_of != 5 {
        return Err(AppError::Validation("best_of must be 3 or 5".into()));
    }
    let skin = skins::find(&req.skin)
        .ok_or_else(|| AppError::Validation(format!("unknown skin: {}", req.skin)))?;

    let mut tx = state.pool.begin().await?;
    if !skin.free && !owned_skins(&mut tx, user.user_id).await?.iter().any(|s| s == skin.id) {
        return Err(AppError::Validation(format!("skin locked: {}", skin.id)));
    }
    sqlx::query(
        "UPDATE cf_matches SET status = 'forfeited', updated_at = now() \
         WHERE user_id = $1 AND status = 'active'",
    )
    .bind(user.user_id)
    .execute(&mut *tx)
    .await?;
    let m: MatchRow = sqlx::query_as(&format!(
        "INSERT INTO cf_matches (user_id, difficulty, best_of, skin) VALUES ($1, $2, $3, $4) \
         RETURNING {MATCH_COLS}"
    ))
    .bind(user.user_id)
    .bind(req.difficulty.as_str())
    .bind(req.best_of)
    .bind(skin.id)
    .fetch_one(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(Json(view(&m, None, false)?))
}

/// The user's unfinished series, if any (lets players resume after reload).
pub async fn active_match(
    State(state): State<AppState>,
    user: AuthUser,
) -> AppResult<Json<MatchView>> {
    let m: MatchRow = sqlx::query_as(&format!(
        "SELECT {MATCH_COLS} FROM cf_matches WHERE user_id = $1 AND status = 'active'"
    ))
    .bind(user.user_id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or(AppError::NotFound)?;
    Ok(Json(view(&m, None, false)?))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MoveRequest {
    pub column: u8,
}

/// Play the user's move; the server answers with the AI's move.
pub async fn play_move(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(req): Json<MoveRequest>,
) -> AppResult<Json<MatchView>> {
    let mut tx = state.pool.begin().await?;
    let mut m = lock_match(&mut tx, id, user.user_id).await?;
    require_playable(&m)?;

    let mut board = m.board()?;
    if board.to_move() != Player::P1 {
        return Err(AppError::Internal(anyhow::anyhow!("match {} waiting on AI", m.id)));
    }
    board.play(req.column).map_err(|e| AppError::Validation(e.to_string()))?;

    let mut ai_move = None;
    if board.outcome() == Outcome::Ongoing {
        // Search is CPU-bound: keep it off the async runtime threads.
        let snapshot = board.clone();
        let d = m.difficulty();
        let c = tokio::task::spawn_blocking(move || choose_move(&snapshot, d, &mut rand::thread_rng()))
            .await
            .map_err(|e| AppError::Internal(anyhow::anyhow!("ai task failed: {e}")))?
            .ok_or_else(|| AppError::Internal(anyhow::anyhow!("ai found no move")))?;
        board.play(c).map_err(|e| AppError::Internal(anyhow::anyhow!("ai move: {e}")))?;
        ai_move = Some(c);
    }
    m.moves = board.move_string();

    let mut spin_granted = false;
    if record_game(&mut m, board.outcome()) == Some(SeriesEnd::Won) {
        spin_granted = reward_series(&mut tx, user.user_id, &mut m).await?;
    }
    save_match(&mut tx, &m).await?;
    tx.commit().await?;
    Ok(Json(view(&m, ai_move, spin_granted)?))
}

/// Take back the user's last move and the AI's reply. Max 3 per game, never
/// on Impossible, and any undo forfeits the series' reward spin.
pub async fn undo_move(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<MatchView>> {
    let mut tx = state.pool.begin().await?;
    let mut m = lock_match(&mut tx, id, user.user_id).await?;
    require_playable(&m)?;
    if m.difficulty() == Difficulty::Impossible {
        return Err(AppError::Validation("undo is disabled on Impossible".into()));
    }
    if m.undos_left() <= 0 {
        return Err(AppError::Validation("no undos left this game".into()));
    }
    let mut board = m.board()?;
    if board.moves().len() < 2 {
        return Err(AppError::Validation("nothing to undo".into()));
    }
    board.undo();
    board.undo();
    m.moves = board.move_string();
    m.undos_used += 1;
    m.used_undo = true;
    save_match(&mut tx, &m).await?;
    tx.commit().await?;
    Ok(Json(view(&m, None, false)?))
}

/// Start the next game of an undecided series.
pub async fn next_game(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<MatchView>> {
    let mut tx = state.pool.begin().await?;
    let mut m = lock_match(&mut tx, id, user.user_id).await?;
    if m.status != "active" || !m.game_over {
        return Err(AppError::Validation("the current game is not over".into()));
    }
    m.moves.clear();
    m.game_over = false;
    m.undos_used = 0;
    save_match(&mut tx, &m).await?;
    tx.commit().await?;
    Ok(Json(view(&m, None, false)?))
}

pub async fn forfeit_match(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<MatchView>> {
    let mut tx = state.pool.begin().await?;
    let mut m = lock_match(&mut tx, id, user.user_id).await?;
    if m.status != "active" {
        return Err(AppError::Validation("this series is finished".into()));
    }
    m.status = "forfeited".into();
    save_match(&mut tx, &m).await?;
    tx.commit().await?;
    Ok(Json(view(&m, None, false)?))
}

// ---------------------------------------------------------------------------
// Skins + spins
// ---------------------------------------------------------------------------

#[derive(Serialize)]
pub struct SkinView {
    pub id: &'static str,
    pub name: &'static str,
    pub rarity: Rarity,
    pub free: bool,
    pub owned: bool,
}

#[derive(Serialize)]
pub struct Collection {
    pub skins: Vec<SkinView>,
    pub spins_available: i64,
}

async fn collection(state: &AppState, user_id: Uuid) -> AppResult<Collection> {
    let mut tx = state.pool.begin().await?;
    let owned = owned_skins(&mut tx, user_id).await?;
    let spins_available: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM cf_spins WHERE user_id = $1 AND spun_at IS NULL",
    )
    .bind(user_id)
    .fetch_one(&mut *tx)
    .await?;
    tx.commit().await?;
    let skins = skins::SKINS
        .iter()
        .map(|s| SkinView {
            id: s.id,
            name: s.name,
            rarity: s.rarity,
            free: s.free,
            owned: s.free || owned.iter().any(|o| o == s.id),
        })
        .collect();
    Ok(Collection { skins, spins_available })
}

pub async fn list_skins(
    State(state): State<AppState>,
    user: AuthUser,
) -> AppResult<Json<Collection>> {
    Ok(Json(collection(&state, user.user_id).await?))
}

#[derive(Serialize)]
pub struct SpinResponse {
    pub difficulty: Difficulty,
    /// Every landing in order; all but the last were owned (free re-spins).
    pub rolls: Vec<&'static str>,
    pub won: Option<&'static str>,
    pub collection: Collection,
}

/// Spend the oldest unspent reward spin. The result is rolled on the server.
pub async fn spin(State(state): State<AppState>, user: AuthUser) -> AppResult<Json<SpinResponse>> {
    let mut tx = state.pool.begin().await?;
    let (spin_id, difficulty): (Uuid, String) = sqlx::query_as(
        r#"SELECT id, difficulty FROM cf_spins
           WHERE user_id = $1 AND spun_at IS NULL
           ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED"#,
    )
    .bind(user.user_id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(|| AppError::Validation("no spins available: win a series first".into()))?;

    let d = Difficulty::parse(&difficulty).unwrap_or(Difficulty::Easy);
    let owned = owned_skins(&mut tx, user.user_id).await?;
    let result = skins::spin(d, &owned, &mut rand::thread_rng());

    sqlx::query("UPDATE cf_spins SET result_skin = $2, spun_at = now() WHERE id = $1")
        .bind(spin_id)
        .bind(result.won)
        .execute(&mut *tx)
        .await?;
    if let Some(won) = result.won {
        sqlx::query(
            "INSERT INTO user_skins (user_id, skin_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        )
        .bind(user.user_id)
        .bind(won)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;

    Ok(Json(SpinResponse {
        difficulty: d,
        rolls: result.rolls,
        won: result.won,
        collection: collection(&state, user.user_id).await?,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn row(best_of: i16) -> MatchRow {
        MatchRow {
            id: Uuid::nil(),
            difficulty: "hard".into(),
            best_of,
            skin: "red".into(),
            user_wins: 0,
            ai_wins: 0,
            draws: 0,
            moves: String::new(),
            game_over: false,
            undos_used: 0,
            used_undo: false,
            status: "active".into(),
            points: 0,
        }
    }

    #[test]
    fn best_of_three_needs_two_wins() {
        let mut m = row(3);
        assert_eq!(record_game(&mut m, Outcome::Win(Player::P1)), None);
        assert!(m.game_over);
        assert_eq!(record_game(&mut m, Outcome::Win(Player::P2)), None);
        assert_eq!(record_game(&mut m, Outcome::Win(Player::P1)), Some(SeriesEnd::Won));
        assert_eq!(m.status, "won");
    }

    #[test]
    fn best_of_five_needs_three_and_draws_dont_count() {
        let mut m = row(5);
        for _ in 0..4 {
            assert_eq!(record_game(&mut m, Outcome::Draw), None);
        }
        assert_eq!(record_game(&mut m, Outcome::Win(Player::P2)), None);
        assert_eq!(record_game(&mut m, Outcome::Win(Player::P2)), None);
        assert_eq!(record_game(&mut m, Outcome::Win(Player::P2)), Some(SeriesEnd::Lost));
        assert_eq!((m.draws, m.ai_wins, m.status.as_str()), (4, 3, "lost"));
    }

    #[test]
    fn ongoing_changes_nothing() {
        let mut m = row(3);
        assert_eq!(record_game(&mut m, Outcome::Ongoing), None);
        assert!(!m.game_over);
    }

    #[test]
    fn undos_are_limited_and_disabled_on_impossible() {
        let mut m = row(3);
        assert_eq!(m.undos_left(), 3);
        m.undos_used = 3;
        assert_eq!(m.undos_left(), 0);
        m.undos_used = 0;
        m.difficulty = "impossible".into();
        assert_eq!(m.undos_left(), 0);
    }
}
