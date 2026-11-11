//! Tic-Tac-Toe HTTP API. The server owns every AI match: it stores the
//! board, validates each move, plays the AI reply and decides results,
//! coins, points and reward spins. Clients only ever send a cell number.

use axum::extract::{Path, State};
use axum::Json;
use serde::{Deserialize, Serialize};
use sqlx::{Postgres, Transaction};
use uuid::Uuid;

use super::ai::{choose_move, Difficulty};
use super::board::{move_error_text, Board};
use super::items::{self, Kind};
use super::rewards::{self, SeriesState};
use crate::auth::jwt::AuthUser;
use crate::character::catalog::Rarity;
use crate::connect_four::board::{Outcome, Player};
use crate::economy::{self, Granted};
use crate::error::{AppError, AppResult};
use crate::quests;
use crate::state::AppState;

pub const GAME_ID: &str = "tic-tac-toe";
pub const MAX_UNDOS: i16 = 3;

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct MatchRow {
    pub id: Uuid,
    pub difficulty: String,
    pub best_of: i16,
    pub face: String,
    pub board: String,
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

const COLS: &str = "id, difficulty, best_of, face, board, user_wins, ai_wins, draws, moves, \
                    game_over, undos_used, used_undo, status, points";

impl MatchRow {
    fn difficulty(&self) -> Difficulty {
        Difficulty::parse(&self.difficulty).unwrap_or(Difficulty::Easy)
    }

    fn board_state(&self) -> AppResult<Board> {
        Board::from_move_string(&self.moves)
            .map_err(|e| AppError::Internal(anyhow::anyhow!("corrupt ttt board: {e}")))
    }

    fn undos_left(&self) -> i16 {
        if self.difficulty() == Difficulty::Hard {
            0
        } else {
            MAX_UNDOS - self.undos_used
        }
    }

    /// Count a finished game and settle the series if it is decided.
    fn record(&mut self, outcome: Outcome) -> SeriesState {
        match outcome {
            Outcome::Ongoing => return SeriesState::Ongoing,
            Outcome::Win(Player::P1) => self.user_wins += 1,
            Outcome::Win(Player::P2) => self.ai_wins += 1,
            Outcome::Draw => self.draws += 1,
        }
        self.game_over = true;
        let s = rewards::series_state(self.best_of, self.user_wins, self.ai_wins, self.draws);
        self.status = match s {
            SeriesState::Ongoing => "active",
            SeriesState::Won => "won",
            SeriesState::Lost => "lost",
            SeriesState::Drawn => "drawn",
        }
        .into();
        s
    }
}

#[derive(Serialize)]
pub struct MatchView {
    pub id: Uuid,
    pub difficulty: Difficulty,
    pub best_of: i16,
    pub face: String,
    pub board: String,
    pub user_wins: i16,
    pub ai_wins: i16,
    pub draws: i16,
    pub moves: String,
    /// 9 cells, row by row: 0 empty, 1 you (X), 2 AI (O).
    pub cells: [u8; 9],
    pub outcome: Outcome,
    pub winning_line: Option<[u8; 3]>,
    pub game_over: bool,
    pub undos_left: i16,
    pub used_undo: bool,
    pub status: String,
    pub points: i32,
    pub ai_move: Option<u8>,
    pub spin_granted: bool,
    pub rewards: Option<Granted>,
}

fn view(m: &MatchRow, ai_move: Option<u8>, spin_granted: bool) -> AppResult<MatchView> {
    let b = m.board_state()?;
    Ok(MatchView {
        id: m.id,
        difficulty: m.difficulty(),
        best_of: m.best_of,
        face: m.face.clone(),
        board: m.board.clone(),
        user_wins: m.user_wins,
        ai_wins: m.ai_wins,
        draws: m.draws,
        moves: m.moves.clone(),
        cells: b.cells(),
        outcome: b.outcome(),
        winning_line: b.winning_line(),
        game_over: m.game_over,
        undos_left: m.undos_left(),
        used_undo: m.used_undo,
        status: m.status.clone(),
        points: m.points,
        ai_move,
        spin_granted,
        rewards: None,
    })
}

async fn owned_keys(ex: impl sqlx::PgExecutor<'_>, user_id: Uuid) -> AppResult<Vec<String>> {
    Ok(sqlx::query_scalar("SELECT item_key FROM ttt_items WHERE user_id = $1")
        .bind(user_id)
        .fetch_all(ex)
        .await?)
}

async fn lock_match(tx: &mut Transaction<'_, Postgres>, id: Uuid, user_id: Uuid) -> AppResult<MatchRow> {
    sqlx::query_as(&format!("SELECT {COLS} FROM ttt_matches WHERE id = $1 AND user_id = $2 FOR UPDATE"))
        .bind(id)
        .bind(user_id)
        .fetch_optional(&mut **tx)
        .await?
        .ok_or(AppError::NotFound)
}

async fn save(tx: &mut Transaction<'_, Postgres>, m: &MatchRow) -> AppResult<()> {
    sqlx::query(
        r#"UPDATE ttt_matches SET user_wins = $2, ai_wins = $3, draws = $4, moves = $5,
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
// Matches
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CreateMatch {
    pub difficulty: Difficulty,
    pub best_of: i16,
    pub face: String,
    pub board: String,
}

pub async fn create_match(
    State(state): State<AppState>,
    user: AuthUser,
    Json(req): Json<CreateMatch>,
) -> AppResult<Json<MatchView>> {
    if req.best_of != 3 && req.best_of != 5 {
        return Err(AppError::Validation("best_of must be 3 or 5".into()));
    }
    let all = items::items();
    let face = all
        .find(Kind::Face, &req.face)
        .ok_or_else(|| AppError::Validation(format!("unknown face: {}", req.face)))?;
    let board = all
        .find(Kind::Board, &req.board)
        .ok_or_else(|| AppError::Validation(format!("unknown board: {}", req.board)))?;

    let mut tx = state.pool.begin().await?;
    let owned = owned_keys(&mut *tx, user.user_id).await?;
    for it in [face, board] {
        if !all.owns(it, &owned) {
            return Err(AppError::Validation(format!("{} is locked", it.name)));
        }
    }
    if face.id == "photo" {
        let has: bool = sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM user_photos WHERE user_id = $1)")
            .bind(user.user_id)
            .fetch_one(&mut *tx)
            .await?;
        if !has {
            return Err(AppError::Validation("add your photo first".into()));
        }
    }
    sqlx::query("UPDATE ttt_matches SET status = 'forfeited', updated_at = now() WHERE user_id = $1 AND status = 'active'")
        .bind(user.user_id)
        .execute(&mut *tx)
        .await?;
    let m: MatchRow = sqlx::query_as(&format!(
        "INSERT INTO ttt_matches (user_id, difficulty, best_of, face, board) VALUES ($1, $2, $3, $4, $5) RETURNING {COLS}"
    ))
    .bind(user.user_id)
    .bind(req.difficulty.as_str())
    .bind(req.best_of)
    .bind(&face.id)
    .bind(&board.id)
    .fetch_one(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(Json(view(&m, None, false)?))
}

pub async fn active_match(State(state): State<AppState>, user: AuthUser) -> AppResult<Json<MatchView>> {
    let m: MatchRow = sqlx::query_as(&format!("SELECT {COLS} FROM ttt_matches WHERE user_id = $1 AND status = 'active'"))
        .bind(user.user_id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or(AppError::NotFound)?;
    Ok(Json(view(&m, None, false)?))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MoveRequest {
    pub cell: u8,
}

/// Pay out a decided series: points, coins/XP/token, and a reward spin
/// (only if no undo was used). Returns the reward and whether a spin was granted.
async fn settle_series(
    tx: &mut Transaction<'_, Postgres>,
    user_id: Uuid,
    m: &mut MatchRow,
    s: SeriesState,
) -> AppResult<(economy::Reward, bool)> {
    let d = m.difficulty();
    let Some(p) = rewards::series_payout(d, m.best_of, s) else {
        return Ok((economy::Reward::default(), false));
    };
    m.points = p.points;
    let total: i32 =
        sqlx::query_scalar("SELECT COALESCE(MAX(score), 0) FROM scores WHERE user_id = $1 AND game_id = $2")
            .bind(user_id)
            .bind(GAME_ID)
            .fetch_one(&mut **tx)
            .await?;
    sqlx::query("INSERT INTO scores (user_id, game_id, score, level, gained) VALUES ($1, $2, $3, $4, $5)")
        .bind(user_id)
        .bind(GAME_ID)
        .bind(total + p.points)
        .bind(rewards::difficulty_mult(d) as i32)
        .bind(p.points)
        .execute(&mut **tx)
        .await?;
    let reward = rewards::payout_reward(&p, &mut rand::thread_rng());
    if !p.spin || m.used_undo {
        return Ok((reward, false));
    }
    let granted = sqlx::query(
        "INSERT INTO ttt_spins (user_id, match_id, difficulty) VALUES ($1, $2, $3) ON CONFLICT (match_id) DO NOTHING",
    )
    .bind(user_id)
    .bind(m.id)
    .bind(d.as_str())
    .execute(&mut **tx)
    .await?
    .rows_affected()
        == 1;
    Ok((reward, granted))
}

pub async fn play_move(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(req): Json<MoveRequest>,
) -> AppResult<Json<MatchView>> {
    let mut tx = state.pool.begin().await?;
    let mut m = lock_match(&mut tx, id, user.user_id).await?;
    require_playable(&m)?;
    let mut b = m.board_state()?;
    if b.to_move() != Player::P1 {
        return Err(AppError::Internal(anyhow::anyhow!("ttt match {} waiting on AI", m.id)));
    }
    b.play(req.cell).map_err(|e| AppError::Validation(move_error_text(e).into()))?;

    let mut ai_move = None;
    if b.outcome() == Outcome::Ongoing {
        let c = choose_move(&b, m.difficulty(), &mut rand::thread_rng())
            .ok_or_else(|| AppError::Internal(anyhow::anyhow!("ttt ai found no move")))?;
        b.play(c).map_err(|e| AppError::Internal(anyhow::anyhow!("ttt ai move: {e}")))?;
        ai_move = Some(c);
    }
    m.moves = b.move_string();

    let outcome = b.outcome();
    let mut spin_granted = false;
    let mut granted = None;
    if outcome != Outcome::Ongoing {
        let s = m.record(outcome);
        let level = rewards::difficulty_mult(m.difficulty());
        let mut events = vec![quests::Event::AiGame {
            game: quests::Game::TicTacToe,
            level,
            result: crate::connect_four::rewards::game_result(outcome),
        }];
        if s == SeriesState::Won {
            events.push(quests::Event::SeriesWon {
                game: quests::Game::TicTacToe,
                level,
                used_undo: m.used_undo,
            });
        }
        quests::api::record(&mut tx, user.user_id, &events).await?;
        let mut reward = rewards::game_reward(m.difficulty(), outcome);
        if s != SeriesState::Ongoing {
            let (bonus, spin) = settle_series(&mut tx, user.user_id, &mut m, s).await?;
            reward = reward + bonus;
            spin_granted = spin;
        }
        granted = Some(economy::grant(&mut tx, user.user_id, reward, "tic_tac_toe_game", true).await?);
    }
    save(&mut tx, &m).await?;
    tx.commit().await?;
    let mut v = view(&m, ai_move, spin_granted)?;
    v.rewards = granted;
    Ok(Json(v))
}

/// Undo your last move and the AI's reply. Max 3 per game, never on Hard,
/// and any undo cancels the series' reward spin.
pub async fn undo_move(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<MatchView>> {
    let mut tx = state.pool.begin().await?;
    let mut m = lock_match(&mut tx, id, user.user_id).await?;
    require_playable(&m)?;
    if m.difficulty() == Difficulty::Hard {
        return Err(AppError::Validation("undo is disabled on Hard".into()));
    }
    if m.undos_left() <= 0 {
        return Err(AppError::Validation("no undos left this game".into()));
    }
    let mut b = m.board_state()?;
    if b.moves().len() < 2 {
        return Err(AppError::Validation("nothing to undo".into()));
    }
    b.undo();
    b.undo();
    m.moves = b.move_string();
    m.undos_used += 1;
    m.used_undo = true;
    save(&mut tx, &m).await?;
    tx.commit().await?;
    Ok(Json(view(&m, None, false)?))
}

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
    save(&mut tx, &m).await?;
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
    save(&mut tx, &m).await?;
    tx.commit().await?;
    Ok(Json(view(&m, None, false)?))
}

// ---------------------------------------------------------------------------
// Collection, shop and reward spins
// ---------------------------------------------------------------------------

#[derive(Serialize)]
pub struct ItemView {
    pub id: String,
    pub name: String,
    pub rarity: Rarity,
    pub price: Option<i64>,
    pub owned: bool,
}

#[derive(Serialize)]
pub struct Collection {
    pub boards: Vec<ItemView>,
    pub faces: Vec<ItemView>,
    pub spins_available: i64,
    pub has_photo: bool,
}

async fn collection(state: &AppState, user_id: Uuid) -> AppResult<Collection> {
    let owned = owned_keys(&state.pool, user_id).await?;
    let all = items::items();
    let map = |list: &[items::Item]| -> Vec<ItemView> {
        list.iter()
            .map(|i| ItemView {
                id: i.id.clone(),
                name: i.name.clone(),
                rarity: i.rarity,
                price: i.price,
                owned: all.owns(i, &owned),
            })
            .collect()
    };
    let spins_available: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM ttt_spins WHERE user_id = $1 AND spun_at IS NULL")
            .bind(user_id)
            .fetch_one(&state.pool)
            .await?;
    let has_photo: bool = sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM user_photos WHERE user_id = $1)")
        .bind(user_id)
        .fetch_one(&state.pool)
        .await?;
    Ok(Collection { boards: map(&all.boards), faces: map(&all.faces), spins_available, has_photo })
}

pub async fn get_collection(State(state): State<AppState>, user: AuthUser) -> AppResult<Json<Collection>> {
    Ok(Json(collection(&state, user.user_id).await?))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BuyRequest {
    pub kind: Kind,
    pub id: String,
}

pub async fn buy(
    State(state): State<AppState>,
    user: AuthUser,
    Json(req): Json<BuyRequest>,
) -> AppResult<Json<Collection>> {
    let it = items::items()
        .find(req.kind, &req.id)
        .ok_or_else(|| AppError::Validation(format!("unknown item: {}", req.id)))?;
    let price = it.price.ok_or_else(|| AppError::Validation(format!("{} is already free", it.name)))?;
    let mut tx = state.pool.begin().await?;
    let inserted = sqlx::query(
        "INSERT INTO ttt_items (user_id, item_key, source) VALUES ($1, $2, 'shop') ON CONFLICT DO NOTHING",
    )
    .bind(user.user_id)
    .bind(it.key())
    .execute(&mut *tx)
    .await?
    .rows_affected();
    if inserted == 0 {
        return Err(AppError::Conflict(format!("you already own {}", it.name)));
    }
    economy::spend(&mut tx, user.user_id, price, 0, &format!("ttt_shop:{}", it.key())).await?;
    tx.commit().await?;
    Ok(Json(collection(&state, user.user_id).await?))
}

#[derive(Serialize)]
pub struct SpinResponse {
    pub difficulty: Difficulty,
    /// Item keys ("board:neon", "face:pig"); all but the last were owned.
    pub rolls: Vec<String>,
    pub won: Option<String>,
    pub collection: Collection,
}

pub async fn spin(State(state): State<AppState>, user: AuthUser) -> AppResult<Json<SpinResponse>> {
    let mut tx = state.pool.begin().await?;
    let (spin_id, difficulty): (Uuid, String) = sqlx::query_as(
        "SELECT id, difficulty FROM ttt_spins WHERE user_id = $1 AND spun_at IS NULL \
         ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED",
    )
    .bind(user.user_id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(|| AppError::Validation("no spins available: win a series first".into()))?;
    let d = Difficulty::parse(&difficulty).unwrap_or(Difficulty::Easy);
    let owned = owned_keys(&mut *tx, user.user_id).await?;
    let res = items::spin(d, &owned, &mut rand::thread_rng());
    sqlx::query("UPDATE ttt_spins SET result_key = $2, spun_at = now() WHERE id = $1")
        .bind(spin_id)
        .bind(&res.won)
        .execute(&mut *tx)
        .await?;
    if let Some(won) = &res.won {
        sqlx::query("INSERT INTO ttt_items (user_id, item_key, source) VALUES ($1, $2, 'spin') ON CONFLICT DO NOTHING")
            .bind(user.user_id)
            .bind(won)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    Ok(Json(SpinResponse {
        difficulty: d,
        rolls: res.rolls,
        won: res.won,
        collection: collection(&state, user.user_id).await?,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn row(d: &str, best_of: i16) -> MatchRow {
        MatchRow {
            id: Uuid::nil(),
            difficulty: d.into(),
            best_of,
            face: "x".into(),
            board: "classic".into(),
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
    fn hard_series_of_draws_ends_as_drawn() {
        let mut m = row("hard", 3);
        assert_eq!(m.record(Outcome::Draw), SeriesState::Ongoing);
        assert_eq!(m.record(Outcome::Draw), SeriesState::Ongoing);
        assert_eq!(m.record(Outcome::Draw), SeriesState::Drawn);
        assert_eq!(m.status, "drawn");
    }

    #[test]
    fn wins_and_losses_settle_the_series() {
        let mut m = row("easy", 3);
        m.record(Outcome::Win(Player::P1));
        assert_eq!(m.record(Outcome::Win(Player::P1)), SeriesState::Won);
        let mut m = row("medium", 5);
        for _ in 0..2 {
            m.record(Outcome::Win(Player::P2));
        }
        assert_eq!(m.record(Outcome::Win(Player::P2)), SeriesState::Lost);
        assert_eq!(m.record(Outcome::Ongoing), SeriesState::Ongoing);
    }

    #[test]
    fn undo_rules() {
        assert_eq!(row("easy", 3).undos_left(), 3);
        assert_eq!(row("hard", 3).undos_left(), 0);
    }
}
