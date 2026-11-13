//! 2048 runs: `start` hands out a seed, `save` keeps the moves so far, and
//! `finish` replays them and pays the reward. One unfinished game per player.

use axum::extract::{Path, State};
use axum::Json;
use chrono::{Datelike, NaiveDate, Utc};
use rand::Rng as _;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::engine::{self, Game, Mode, ReplayError, Summary};
use crate::auth::jwt::AuthUser;
use crate::daily;
use crate::economy::{self, Granted, Reward};
use crate::error::{AppError, AppResult};
use crate::quests;
use crate::scores::score_round_reward;
use crate::state::AppState;

pub const GAME_ID: &str = "2048";
/// An unfinished game is kept this long after its last save.
const KEEP_HOURS: i64 = 24;
/// Most moves a person can make per second, plus a small allowance.
const MOVES_PER_SEC: f64 = 25.0;
const MOVE_SLACK: f64 = 50.0;
/// Games shorter than this pay nothing and don't count for quests.
pub const MIN_REWARD_MOVES: u32 = 20;

/// Extra coins for big tiles (on top of the score reward).
pub const BONUS_2048: i64 = 30;
pub const BONUS_4096: i64 = 80;
pub const TOKEN_CHANCE_4096: f64 = 0.5;

/// Reward for a finished game: the score reward plus tile bonuses.
pub fn reward(s: &Summary, rng: &mut impl rand::Rng) -> Reward {
    if s.moves < MIN_REWARD_MOVES {
        return Reward::default();
    }
    let mut r = score_round_reward(s.points.clamp(0, i32::MAX as i64) as i32, rng);
    if s.max_tile >= 2048 {
        r.coins += BONUS_2048;
    }
    if s.max_tile >= 4096 {
        r.coins += BONUS_4096;
        r.tokens += economy::roll_token(TOKEN_CHANCE_4096, rng);
    }
    r
}

#[derive(Serialize)]
pub struct RunView {
    pub run_id: Uuid,
    pub seed: u32,
    pub mode: Mode,
    pub size: usize,
    /// Undos allowed in this game.
    pub undos: u32,
    /// Moves saved so far (continue from here).
    pub moves: String,
}

#[derive(sqlx::FromRow)]
struct RunRow {
    id: Uuid,
    mode: String,
    seed: i64,
    moves: String,
    finished_at: Option<chrono::DateTime<Utc>>,
    /// Since the game started, ms.
    elapsed_ms: f64,
    /// Not saved for KEEP_HOURS.
    stale: bool,
}

/// Columns of `RunRow`.
fn run_columns() -> String {
    format!(
        r#"id, mode, seed, moves, finished_at,
           EXTRACT(EPOCH FROM (now() - started_at))::FLOAT8 * 1000 AS elapsed_ms,
           updated_at < now() - INTERVAL '{KEEP_HOURS} hours' AS stale"#
    )
}

impl RunRow {
    fn mode(&self) -> AppResult<Mode> {
        Mode::parse(&self.mode).ok_or_else(|| AppError::Validation("unknown mode".into()))
    }

    fn view(&self) -> AppResult<RunView> {
        let mode = self.mode()?;
        Ok(RunView {
            run_id: self.id,
            seed: self.seed as u32,
            mode,
            size: mode.size(),
            undos: mode.undos(),
            moves: self.moves.clone(),
        })
    }
}

/// Close games nobody saved for a day, without a score.
async fn abandon_stale(ex: impl sqlx::PgExecutor<'_>, user_id: Uuid) -> AppResult<()> {
    sqlx::query(
        r#"UPDATE g2048_runs SET finished_at = now(), abandoned = TRUE
           WHERE user_id = $1 AND finished_at IS NULL
             AND updated_at < now() - make_interval(hours => $2)"#,
    )
    .bind(user_id)
    .bind(KEEP_HOURS as i32)
    .execute(ex)
    .await?;
    Ok(())
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct StartRequest {
    pub mode: String,
}

pub async fn start(
    State(state): State<AppState>,
    user: AuthUser,
    Json(req): Json<StartRequest>,
) -> AppResult<Json<RunView>> {
    let mode = Mode::parse(&req.mode).ok_or_else(|| AppError::Validation("unknown mode".into()))?;
    let mut tx = state.pool.begin().await?;
    abandon_stale(&mut *tx, user.user_id).await?;

    let (seed, day): (u32, Option<NaiveDate>) = if mode == Mode::Daily {
        let d = daily::wib_date(Utc::now());
        // One Daily per day: continue today's if it's still open.
        let today: Option<RunRow> = sqlx::query_as(&format!(
            "SELECT {} FROM g2048_runs WHERE user_id = $1 AND mode = 'daily' AND day = $2",
            run_columns()
        ))
        .bind(user.user_id)
        .bind(d)
        .fetch_optional(&mut *tx)
        .await?;
        if let Some(run) = today {
            if run.finished_at.is_some() {
                return Err(AppError::Conflict("you already played today's Daily. Come back tomorrow!".into()));
            }
            tx.commit().await?;
            return Ok(Json(run.view()?));
        }
        (engine::daily_seed(d.year(), d.month(), d.day()), Some(d))
    } else {
        (rand::thread_rng().gen::<u32>(), None)
    };

    let id: Option<Uuid> = sqlx::query_scalar(
        r#"INSERT INTO g2048_runs (user_id, mode, seed, day) VALUES ($1, $2, $3, $4)
           ON CONFLICT DO NOTHING RETURNING id"#,
    )
    .bind(user.user_id)
    .bind(mode.as_str())
    .bind(i64::from(seed))
    .bind(day)
    .fetch_optional(&mut *tx)
    .await?;
    let run_id = id.ok_or_else(|| AppError::Conflict("finish your current game first".into()))?;
    tx.commit().await?;

    Ok(Json(RunView { run_id, seed, mode, size: mode.size(), undos: mode.undos(), moves: String::new() }))
}

/// `GET .../runs/active`: your unfinished game, if any.
pub async fn active(State(state): State<AppState>, user: AuthUser) -> AppResult<Json<Option<RunView>>> {
    abandon_stale(&state.pool, user.user_id).await?;
    let run: Option<RunRow> = sqlx::query_as(&format!(
        "SELECT {} FROM g2048_runs WHERE user_id = $1 AND finished_at IS NULL",
        run_columns()
    ))
    .bind(user.user_id)
    .fetch_optional(&state.pool)
    .await?;
    Ok(Json(run.map(|r| r.view()).transpose()?))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MovesRequest {
    pub moves: String,
}

/// Lock a run and check that `moves` can follow what was saved.
async fn load_checked(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    user_id: Uuid,
    run_id: Uuid,
    moves: &str,
) -> AppResult<(RunRow, Game)> {
    let run: RunRow = sqlx::query_as(&format!(
        "SELECT {} FROM g2048_runs WHERE id = $1 AND user_id = $2 FOR UPDATE",
        run_columns()
    ))
    .bind(run_id)
    .bind(user_id)
    .fetch_optional(&mut **tx)
    .await?
    .ok_or(AppError::NotFound)?;

    if run.finished_at.is_some() {
        return Err(AppError::Conflict("this game is already finished".into()));
    }
    if run.stale {
        return Err(AppError::Validation("this game has expired".into()));
    }
    if !moves.starts_with(&run.moves) {
        return Err(AppError::Conflict("these moves don't match the saved game. Reload to continue.".into()));
    }
    let seconds = run.elapsed_ms / 1000.0;
    if moves.len() as f64 > seconds * MOVES_PER_SEC + MOVE_SLACK {
        return Err(AppError::Validation("moves came in faster than anyone can play".into()));
    }
    let game = engine::replay(run.seed as u32, run.mode()?, moves).map_err(|e| {
        AppError::Validation(
            match e {
                ReplayError::TooManyMoves => "too many moves",
                ReplayError::BadMove => "unknown move",
                ReplayError::NoChange => "a move that changes nothing",
                ReplayError::NoUndoLeft => "no undos left",
                ReplayError::NothingToUndo => "nothing to undo",
            }
            .into(),
        )
    })?;
    Ok((run, game))
}

#[derive(Serialize)]
pub struct SaveResponse {
    pub saved: usize,
}

/// `POST .../runs/:id/save`: store the moves so far (append-only).
pub async fn save(
    State(state): State<AppState>,
    user: AuthUser,
    Path(run_id): Path<Uuid>,
    Json(req): Json<MovesRequest>,
) -> AppResult<Json<SaveResponse>> {
    let mut tx = state.pool.begin().await?;
    let (_, game) = load_checked(&mut tx, user.user_id, run_id, &req.moves).await?;
    let s = game.summary();
    sqlx::query(
        r#"UPDATE g2048_runs SET moves = $2, score = $3, points = $4, max_tile = $5,
               undos_used = $6, updated_at = now()
           WHERE id = $1"#,
    )
    .bind(run_id)
    .bind(&req.moves)
    .bind(clamp(s.score))
    .bind(clamp(s.points))
    .bind(clamp(s.max_tile))
    .bind(s.undos_used as i16)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(Json(SaveResponse { saved: req.moves.len() }))
}

fn clamp(v: i64) -> i32 {
    v.clamp(0, i32::MAX as i64) as i32
}

#[derive(Serialize)]
pub struct FinishResponse {
    pub mode: Mode,
    pub summary: Summary,
    /// Best points in this mode before the game (today only for Daily).
    pub previous_best: i32,
    pub new_best: bool,
    pub rewards: Granted,
}

/// `POST .../runs/:id/finish`: replay the moves, record the score, pay.
pub async fn finish(
    State(state): State<AppState>,
    user: AuthUser,
    Path(run_id): Path<Uuid>,
    Json(req): Json<MovesRequest>,
) -> AppResult<Json<FinishResponse>> {
    let mut tx = state.pool.begin().await?;
    let (run, game) = load_checked(&mut tx, user.user_id, run_id, &req.moves).await?;
    let mode = run.mode()?;
    let summary = game.summary();
    let points = clamp(summary.points);

    let previous_best = mode_best(&mut tx, user.user_id, mode).await?;
    sqlx::query(
        r#"UPDATE g2048_runs SET moves = $2, score = $3, points = $4, max_tile = $5,
               undos_used = $6, game_over = $7, updated_at = now(), finished_at = now()
           WHERE id = $1"#,
    )
    .bind(run_id)
    .bind(&req.moves)
    .bind(clamp(summary.score))
    .bind(points)
    .bind(clamp(summary.max_tile))
    .bind(summary.undos_used as i16)
    .bind(summary.game_over)
    .execute(&mut *tx)
    .await?;
    sqlx::query(
        "INSERT INTO scores (user_id, game_id, score, level, gained, detail) VALUES ($1, $2, $3, $4, $3, $5)",
    )
    .bind(user.user_id)
    .bind(GAME_ID)
    .bind(points)
    .bind(mode.board_id())
    .bind(summary.max_tile.to_string())
    .execute(&mut *tx)
    .await?;

    if summary.moves >= MIN_REWARD_MOVES {
        let ev = quests::Event::Game2048 { points: summary.points, max_tile: summary.max_tile };
        quests::api::record(&mut tx, user.user_id, &[ev]).await?;
    }
    let reward = reward(&summary, &mut rand::thread_rng());
    let rewards = economy::grant(&mut tx, user.user_id, reward, "2048_game", true).await?;
    tx.commit().await?;

    Ok(Json(FinishResponse { mode, summary, previous_best, new_best: points > previous_best, rewards }))
}

/// Best points on a mode's leaderboard (Daily: today only).
async fn mode_best(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    user_id: Uuid,
    mode: Mode,
) -> AppResult<i32> {
    let since = if mode == Mode::Daily {
        daily::today_start(Utc::now())
    } else {
        chrono::DateTime::<Utc>::UNIX_EPOCH
    };
    Ok(sqlx::query_scalar(
        r#"SELECT COALESCE(MAX(score), 0) FROM scores
           WHERE user_id = $1 AND game_id = $2 AND level = $3 AND created_at >= $4"#,
    )
    .bind(user_id)
    .bind(GAME_ID)
    .bind(mode.board_id())
    .bind(since)
    .fetch_one(&mut **tx)
    .await?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand::SeedableRng;
    use rand_chacha::ChaCha8Rng;

    fn summary(points: i64, max_tile: i64, moves: u32) -> Summary {
        Summary { score: points, points, max_tile, moves, undos_used: 0, game_over: true }
    }

    #[test]
    fn short_games_pay_nothing() {
        let mut r = ChaCha8Rng::seed_from_u64(1);
        assert_eq!(reward(&summary(50_000, 4096, MIN_REWARD_MOVES - 1), &mut r), Reward::default());
        assert!(reward(&summary(0, 8, MIN_REWARD_MOVES), &mut r).xp >= 10);
    }

    #[test]
    fn big_tiles_pay_bonus_coins() {
        let mut r = ChaCha8Rng::seed_from_u64(2);
        assert_eq!(reward(&summary(9_000, 1024, 500), &mut r).coins, 9);
        assert_eq!(reward(&summary(21_000, 2048, 900), &mut r).coins, 21 + BONUS_2048);
        assert_eq!(reward(&summary(50_000, 4096, 2000), &mut r).coins, 50 + BONUS_2048 + BONUS_4096);
    }

    #[test]
    fn a_4096_tile_often_drops_a_token() {
        let mut r = ChaCha8Rng::seed_from_u64(3);
        let tokens: i32 = (0..2_000).map(|_| reward(&summary(0, 4096, 100), &mut r).tokens).sum();
        // 50% bonus chance plus the small score chance.
        assert!((900..1300).contains(&tokens), "{tokens}");
    }
}
