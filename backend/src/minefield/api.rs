//! Minefield games API. The server owns the board: the client sends a cell,
//! the server opens it and replies with what is now visible.

use axum::extract::{Path, State};
use axum::Json;
use chrono::{DateTime, Datelike, Utc};
use rand::seq::SliceRandom;
use rand::Rng as _;
use serde::{Deserialize, Serialize};
use sqlx::{Postgres, Transaction};
use uuid::Uuid;

use super::board::{self, Board, Difficulty};
use crate::auth::jwt::AuthUser;
use crate::daily;
use crate::economy::{self, Granted, Reward};
use crate::error::{AppError, AppResult};
use crate::quests;
use crate::state::AppState;

pub const GAME_ID: &str = "minefield";
pub const MAX_HINTS: i16 = 3;
pub const HINT_PENALTY_MS: i64 = 20_000;

/// Cell values sent to the client.
pub const HIDDEN: i8 = -1;
pub const MINE: i8 = 9;
pub const EXPLODED: i8 = 10;

// ---------------------------------------------------------------------------
// Rewards
// ---------------------------------------------------------------------------

/// Win: coins + XP by size, small token chance. Loss: a little XP.
pub fn reward(d: Difficulty, won: bool, rng: &mut impl rand::Rng) -> Reward {
    if !won {
        return Reward { coins: 0, tokens: 0, xp: 5 };
    }
    let (coins, mult, chance) = match d {
        Difficulty::Beginner => (5, 1, 0.02),
        Difficulty::Intermediate => (20, 2, 0.08),
        Difficulty::Expert => (60, 4, 0.25),
        Difficulty::Daily => (25, 2, 0.10),
    };
    Reward { coins, tokens: economy::roll_token(chance, rng), xp: 20 * mult }
}

/// Quest level: 1 Beginner, 2 Intermediate/Daily, 3 Expert.
fn quest_level(d: Difficulty) -> i64 {
    match d {
        Difficulty::Beginner => 1,
        Difficulty::Intermediate | Difficulty::Daily => 2,
        Difficulty::Expert => 3,
    }
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

#[derive(sqlx::FromRow)]
struct Row {
    id: Uuid,
    difficulty: String,
    status: String,
    mines: Option<Vec<u8>>,
    opened: Vec<u8>,
    hints: i16,
    clicks: i32,
    three_bv: Option<i32>,
    exploded: Option<i32>,
    time_ms: Option<i32>,
    score: Option<i32>,
    started_at: Option<DateTime<Utc>>,
}

impl Row {
    fn diff(&self) -> AppResult<Difficulty> {
        Difficulty::parse(&self.difficulty).ok_or_else(|| AppError::Internal(anyhow::anyhow!("bad difficulty")))
    }

    fn board(&self) -> AppResult<Option<Board>> {
        let s = self.diff()?.spec();
        Ok(self.mines.as_ref().map(|m| Board::from_mines(s.rows, s.cols, m.iter().map(|b| *b == 1).collect())))
    }

    fn open_flags(&self) -> Vec<bool> {
        self.opened.iter().map(|b| *b == 1).collect()
    }

    fn finished(&self) -> bool {
        self.status == "won" || self.status == "lost"
    }
}

const COLUMNS: &str = "id, difficulty, status, mines, opened, hints, clicks, three_bv, exploded, time_ms, score, started_at";

async fn lock(tx: &mut Transaction<'_, Postgres>, id: Uuid, user_id: Uuid) -> AppResult<Row> {
    sqlx::query_as(&format!("SELECT {COLUMNS} FROM mf_games WHERE id = $1 AND user_id = $2 FOR UPDATE"))
        .bind(id)
        .bind(user_id)
        .fetch_optional(&mut **tx)
        .await?
        .ok_or(AppError::NotFound)
}

fn to_bytes(v: &[bool]) -> Vec<u8> {
    v.iter().map(|b| u8::from(*b)).collect()
}

/// Make a board in a worker thread (Expert can take ~0.1 s).
async fn make_board(seed: u64, d: Difficulty, start: usize) -> AppResult<Board> {
    tokio::task::spawn_blocking(move || board::no_guess_board(seed, d, start).0)
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("board generation failed: {e}")))
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

#[derive(Serialize)]
pub struct ResultView {
    pub won: bool,
    pub time_ms: Option<i32>,
    pub score: Option<i32>,
    pub three_bv: Option<i32>,
    pub clicks: i32,
    /// Only in the reply to the move that ended the game.
    pub previous_best: Option<i32>,
    pub new_best: Option<bool>,
    pub rewards: Option<Granted>,
}

#[derive(Serialize)]
pub struct GameView {
    pub id: Uuid,
    pub difficulty: Difficulty,
    pub rows: usize,
    pub cols: usize,
    pub mines: usize,
    pub status: String,
    /// -1 hidden, 0-8 opened number, 9 mine (after the game), 10 the mine you hit.
    pub cells: Vec<i8>,
    /// Game time so far, including hint penalties.
    pub elapsed_ms: i64,
    pub hints_used: i16,
    pub hints_left: i16,
    pub result: Option<ResultView>,
}

fn view(row: &Row, finish: Option<(Option<i32>, Option<bool>, Granted)>) -> AppResult<GameView> {
    let d = row.diff()?;
    let s = d.spec();
    let open = row.open_flags();
    let b = row.board()?;
    let done = row.finished();
    let cells = (0..s.rows * s.cols)
        .map(|i| match &b {
            Some(_) if done && row.exploded == Some(i as i32) => EXPLODED,
            Some(b) if done && b.mines[i] => MINE,
            Some(b) if open[i] => b.counts[i] as i8,
            _ => HIDDEN,
        })
        .collect();
    let elapsed_ms = match (row.time_ms, row.started_at) {
        (Some(t), _) => i64::from(t),
        (None, Some(start)) if !done => {
            (Utc::now() - start).num_milliseconds() + i64::from(row.hints) * HINT_PENALTY_MS
        }
        _ => 0,
    };
    let result = done.then(|| ResultView {
        won: row.status == "won",
        time_ms: row.time_ms,
        score: row.score,
        three_bv: row.three_bv,
        clicks: row.clicks,
        previous_best: finish.and_then(|f| f.0),
        new_best: finish.and_then(|f| f.1),
        rewards: finish.map(|f| f.2),
    });
    Ok(GameView {
        id: row.id,
        difficulty: d,
        rows: s.rows,
        cols: s.cols,
        mines: s.mines,
        status: row.status.clone(),
        cells,
        elapsed_ms,
        hints_used: row.hints,
        hints_left: MAX_HINTS - row.hints,
        result,
    })
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CreateRequest {
    pub difficulty: String,
}

pub async fn create(
    State(state): State<AppState>,
    user: AuthUser,
    Json(req): Json<CreateRequest>,
) -> AppResult<Json<GameView>> {
    let d = Difficulty::parse(&req.difficulty).ok_or_else(|| AppError::Validation("unknown difficulty".into()))?;
    let s = d.spec();
    let mut tx = state.pool.begin().await?;

    if d == Difficulty::Daily {
        let today = daily::wib_date(Utc::now());
        let existing: Option<Row> = sqlx::query_as(&format!(
            "SELECT {COLUMNS} FROM mf_games WHERE user_id = $1 AND difficulty = 'daily' AND day = $2 FOR UPDATE"
        ))
        .bind(user.user_id)
        .bind(today)
        .fetch_optional(&mut *tx)
        .await?;
        if let Some(row) = existing {
            if row.finished() {
                return Err(AppError::Conflict("you already played today's Daily board".into()));
            }
            return Ok(Json(view(&row, None)?));
        }
        // Same board and same opening for everyone; the clock starts now.
        let start = board::daily_start(d);
        let b = make_board(board::daily_seed(today.year(), today.month(), today.day()), d, start).await?;
        let mut open = vec![false; b.len()];
        b.flood(start, &mut open);
        let row: Row = sqlx::query_as(&format!(
            r#"INSERT INTO mf_games (user_id, difficulty, status, day, mines, opened, three_bv, started_at)
               VALUES ($1, 'daily', 'playing', $2, $3, $4, $5, now()) RETURNING {COLUMNS}"#
        ))
        .bind(user.user_id)
        .bind(today)
        .bind(to_bytes(&b.mines))
        .bind(to_bytes(&open))
        .bind(b.three_bv() as i32)
        .fetch_one(&mut *tx)
        .await?;
        tx.commit().await?;
        return Ok(Json(view(&row, None)?));
    }

    let row: Row = sqlx::query_as(&format!(
        "INSERT INTO mf_games (user_id, difficulty, opened) VALUES ($1, $2, $3) RETURNING {COLUMNS}"
    ))
    .bind(user.user_id)
    .bind(d.as_str())
    .bind(vec![0u8; s.rows * s.cols])
    .fetch_one(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(Json(view(&row, None)?))
}

/// Your most recent unfinished game (to resume after a reload).
pub async fn active(State(state): State<AppState>, user: AuthUser) -> AppResult<Json<Option<GameView>>> {
    let row: Option<Row> = sqlx::query_as(&format!(
        "SELECT {COLUMNS} FROM mf_games WHERE user_id = $1 AND status IN ('new', 'playing') \
         ORDER BY created_at DESC LIMIT 1"
    ))
    .bind(user.user_id)
    .fetch_optional(&state.pool)
    .await?;
    Ok(Json(row.map(|r| view(&r, None)).transpose()?))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CellRequest {
    pub cell: usize,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ChordRequest {
    pub cell: usize,
    /// The flags you placed around `cell`.
    pub flags: Vec<usize>,
}

/// What a move did to the game.
enum Outcome {
    Continue,
    Won,
    Lost { exploded: usize },
}

pub async fn reveal(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(req): Json<CellRequest>,
) -> AppResult<Json<GameView>> {
    let mut tx = state.pool.begin().await?;
    let mut row = lock(&mut tx, id, user.user_id).await?;
    if row.finished() {
        return Err(AppError::Conflict("this game is over".into()));
    }
    let d = row.diff()?;
    if req.cell >= d.spec().rows * d.spec().cols {
        return Err(AppError::Validation("no such cell".into()));
    }

    // First click: make a no-guess board that opens right here.
    if row.status == "new" {
        let seed: u64 = rand::thread_rng().gen();
        let b = make_board(seed, d, req.cell).await?;
        row.mines = Some(to_bytes(&b.mines));
        row.three_bv = Some(b.three_bv() as i32);
        row.status = "playing".into();
        row.started_at = Some(Utc::now());
    }
    let b = row.board()?.expect("playing games have a board");
    let mut open = row.open_flags();
    let outcome = if open[req.cell] {
        Outcome::Continue
    } else {
        row.clicks += 1;
        open_cells(&b, &[req.cell], &mut open)
    };
    row.opened = to_bytes(&open);
    let res = finish_move(&mut tx, &user, row, outcome).await;
    commit(tx, res).await
}

pub async fn chord(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(req): Json<ChordRequest>,
) -> AppResult<Json<GameView>> {
    let mut tx = state.pool.begin().await?;
    let mut row = lock(&mut tx, id, user.user_id).await?;
    if row.status != "playing" {
        return Err(AppError::Conflict("this game isn't in progress".into()));
    }
    let b = row.board()?.expect("playing games have a board");
    let mut open = row.open_flags();
    if req.cell >= b.len() || !open[req.cell] || b.counts[req.cell] == 0 {
        return Err(AppError::Validation("chord a revealed number".into()));
    }
    let around: Vec<usize> = b.neighbors(req.cell).collect();
    let mut flags = req.flags.clone();
    flags.sort_unstable();
    flags.dedup();
    if flags.iter().any(|f| !around.contains(f) || open[*f]) {
        return Err(AppError::Validation("flags must be hidden cells next to the number".into()));
    }
    // Like the classic game: chording only works when the flag count matches.
    let outcome = if flags.len() != b.counts[req.cell] as usize {
        Outcome::Continue
    } else {
        row.clicks += 1;
        let targets: Vec<usize> = around.into_iter().filter(|n| !open[*n] && !flags.contains(n)).collect();
        open_cells(&b, &targets, &mut open)
    };
    row.opened = to_bytes(&open);
    let res = finish_move(&mut tx, &user, row, outcome).await;
    commit(tx, res).await
}

pub async fn hint(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<GameView>> {
    let mut tx = state.pool.begin().await?;
    let mut row = lock(&mut tx, id, user.user_id).await?;
    if row.status != "playing" {
        return Err(AppError::Conflict("open a cell first".into()));
    }
    if row.hints >= MAX_HINTS {
        return Err(AppError::Conflict("no hints left".into()));
    }
    let b = row.board()?.expect("playing games have a board");
    let mut open = row.open_flags();
    // Prefer a safe cell touching what you've already opened.
    let safe: Vec<usize> = (0..b.len()).filter(|&i| !open[i] && !b.mines[i]).collect();
    let near: Vec<usize> = safe.iter().copied().filter(|&i| b.neighbors(i).any(|n| open[n])).collect();
    let pool = if near.is_empty() { &safe } else { &near };
    let picked = pool.choose(&mut rand::thread_rng()).copied();
    let Some(cell) = picked else {
        return Err(AppError::Conflict("nothing left to hint".into()));
    };
    row.hints += 1;
    let outcome = open_cells(&b, &[cell], &mut open);
    row.opened = to_bytes(&open);
    let res = finish_move(&mut tx, &user, row, outcome).await;
    commit(tx, res).await
}

pub async fn forfeit(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<Option<GameView>>> {
    let mut tx = state.pool.begin().await?;
    let row = lock(&mut tx, id, user.user_id).await?;
    if row.finished() {
        return Err(AppError::Conflict("this game is over".into()));
    }
    if row.status == "new" {
        // Nothing was played: just drop it.
        sqlx::query("DELETE FROM mf_games WHERE id = $1").bind(row.id).execute(&mut *tx).await?;
        tx.commit().await?;
        return Ok(Json(None));
    }
    let res = finish_move(&mut tx, &user, row, Outcome::Lost { exploded: usize::MAX }).await;
    let Json(v) = commit(tx, res).await?;
    Ok(Json(Some(v)))
}

/// Open `cells` (the player says they're safe). Hitting a mine loses.
fn open_cells(b: &Board, cells: &[usize], open: &mut [bool]) -> Outcome {
    if let Some(&m) = cells.iter().find(|c| b.mines[**c]) {
        return Outcome::Lost { exploded: m };
    }
    for &c in cells {
        b.flood(c, open);
    }
    if b.is_cleared(open) {
        Outcome::Won
    } else {
        Outcome::Continue
    }
}

/// Save the move; on a win or loss record the result and pay rewards.
async fn finish_move(
    tx: &mut Transaction<'_, Postgres>,
    user: &AuthUser,
    mut row: Row,
    outcome: Outcome,
) -> AppResult<Json<GameView>> {
    let d = row.diff()?;
    let mut finish = None;

    match outcome {
        Outcome::Continue => {}
        Outcome::Lost { exploded } => {
            row.status = "lost".into();
            row.exploded = (exploded != usize::MAX).then_some(exploded as i32);
            let pay = reward(d, false, &mut rand::thread_rng());
            let granted = economy::grant(tx, user.user_id, pay, "minefield_game", true).await?;
            finish = Some((None, None, granted));
        }
        Outcome::Won => {
            let started = row.started_at.unwrap_or_else(Utc::now);
            let time_ms = (Utc::now() - started).num_milliseconds() + i64::from(row.hints) * HINT_PENALTY_MS;
            let score = board::score(d, time_ms) as i32;
            row.status = "won".into();
            row.time_ms = Some(time_ms.clamp(0, i32::MAX as i64) as i32);
            row.score = Some(score);

            let previous_best = best_score(tx, user.user_id, d).await?;
            sqlx::query("INSERT INTO scores (user_id, game_id, score, level, gained) VALUES ($1, $2, $3, $4, $3)")
                .bind(user.user_id)
                .bind(GAME_ID)
                .bind(score)
                .bind(d.board_id())
                .execute(&mut **tx)
                .await?;
            let ev = quests::Event::MinefieldWin { level: quest_level(d), hints: i64::from(row.hints) };
            quests::api::record(tx, user.user_id, &[ev]).await?;
            let pay = reward(d, true, &mut rand::thread_rng());
            let granted = economy::grant(tx, user.user_id, pay, "minefield_game", true).await?;
            finish = Some((Some(previous_best), Some(score > previous_best), granted));
        }
    }

    sqlx::query(
        r#"UPDATE mf_games SET status = $2, mines = $3, opened = $4, hints = $5, clicks = $6,
               three_bv = $7, exploded = $8, time_ms = $9, score = $10, started_at = $11,
               finished_at = CASE WHEN $2 IN ('won', 'lost') THEN now() ELSE NULL END
           WHERE id = $1"#,
    )
    .bind(row.id)
    .bind(&row.status)
    .bind(&row.mines)
    .bind(&row.opened)
    .bind(row.hints)
    .bind(row.clicks)
    .bind(row.three_bv)
    .bind(row.exploded)
    .bind(row.time_ms)
    .bind(row.score)
    .bind(row.started_at)
    .execute(&mut **tx)
    .await?;

    let v = view(&row, finish)?;
    Ok(Json(v))
}

/// Commit a move's transaction if it succeeded.
async fn commit(tx: Transaction<'_, Postgres>, res: AppResult<Json<GameView>>) -> AppResult<Json<GameView>> {
    let v = res?;
    tx.commit().await?;
    Ok(v)
}

/// Best score on this difficulty's board (Daily: today only).
async fn best_score(tx: &mut Transaction<'_, Postgres>, user_id: Uuid, d: Difficulty) -> AppResult<i32> {
    let since = if d == Difficulty::Daily { daily::today_start(Utc::now()) } else { DateTime::<Utc>::UNIX_EPOCH };
    Ok(sqlx::query_scalar(
        "SELECT COALESCE(MAX(score), 0) FROM scores WHERE user_id = $1 AND game_id = $2 AND level = $3 AND created_at >= $4",
    )
    .bind(user_id)
    .bind(GAME_ID)
    .bind(d.board_id())
    .bind(since)
    .fetch_one(&mut **tx)
    .await?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand::SeedableRng;
    use rand_chacha::ChaCha8Rng;

    #[test]
    fn rewards_scale_with_size_and_losses_pay_xp_only() {
        let mut r = ChaCha8Rng::seed_from_u64(1);
        assert_eq!(reward(Difficulty::Expert, false, &mut r), Reward { coins: 0, tokens: 0, xp: 5 });
        let b = reward(Difficulty::Beginner, true, &mut r);
        let e = reward(Difficulty::Expert, true, &mut r);
        assert_eq!((b.coins, b.xp), (5, 20));
        assert_eq!((e.coins, e.xp), (60, 80));
        assert_eq!(reward(Difficulty::Daily, true, &mut r).coins, 25);
    }

    #[test]
    fn opening_a_mine_loses_and_clearing_wins() {
        let mut m = vec![false; 5];
        m[4] = true;
        let b = Board::from_mines(1, 5, m);
        let mut open = vec![false; 5];
        assert!(matches!(open_cells(&b, &[4], &mut open), Outcome::Lost { exploded: 4 }));
        assert!(matches!(open_cells(&b, &[0], &mut open), Outcome::Won));
    }
}
