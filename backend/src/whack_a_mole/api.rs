//! Whack-a-Mole runs: `start` hands out a seed, `finish` replays the taps.

use axum::extract::{Path, State};
use axum::Json;
use chrono::{Datelike, Utc};
use rand::Rng as _;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::engine::{self, Mode, ReplayError, Summary, Tap};
use super::items::{self, Kind as ItemKind};
use crate::auth::jwt::AuthUser;
use crate::daily;
use crate::economy::{self, Granted};
use crate::error::{AppError, AppResult};
use crate::quests;
use crate::scores::score_round_reward;
use crate::state::AppState;

pub const GAME_ID: &str = "whack-a-mole";
/// A run must be finished within this many minutes of starting.
const RUN_EXPIRY_MIN: i64 = 15;
/// Allowed difference between the game clock and the server clock (ms).
const CLOCK_SLACK_MS: i64 = 2_000;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct StartRequest {
    pub mode: String,
    #[serde(default = "default_grid")]
    pub grid: u32,
    /// Cosmetics; you must own them. Default: the free ones.
    #[serde(default)]
    pub hammer: Option<String>,
    #[serde(default)]
    pub theme: Option<String>,
}

fn default_grid() -> u32 {
    3
}

#[derive(Serialize)]
pub struct StartResponse {
    pub run_id: Uuid,
    pub seed: u32,
    pub mode: Mode,
    pub grid: u32,
}

pub async fn start(
    State(state): State<AppState>,
    user: AuthUser,
    Json(req): Json<StartRequest>,
) -> AppResult<Json<StartResponse>> {
    let mode = Mode::parse(&req.mode).ok_or_else(|| AppError::Validation("unknown mode".into()))?;
    if req.grid != 3 && req.grid != 4 {
        return Err(AppError::Validation("grid must be 3 or 4".into()));
    }
    // The Daily Challenge is the same 3x3 board for everyone.
    let (seed, grid) = if mode == Mode::Daily {
        let d = daily::wib_date(Utc::now());
        (engine::daily_seed(d.year(), d.month(), d.day()), 3)
    } else {
        (rand::thread_rng().gen::<u32>(), req.grid)
    };

    let cat = items::items();
    let owned = owned_keys(&state.pool, user.user_id).await?;
    let hammer = req.hammer.unwrap_or_else(|| cat.default_id(ItemKind::Hammer).to_string());
    let theme = req.theme.unwrap_or_else(|| cat.default_id(ItemKind::Theme).to_string());
    if !cat.owns(ItemKind::Hammer, &hammer, &owned) {
        return Err(AppError::Validation("you don't own that hammer".into()));
    }
    if !cat.owns(ItemKind::Theme, &theme, &owned) {
        return Err(AppError::Validation("you don't own that board theme".into()));
    }

    let run_id: Uuid = sqlx::query_scalar(
        "INSERT INTO wam_runs (user_id, mode, grid, seed, hammer, theme) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
    )
    .bind(user.user_id)
    .bind(mode.as_str())
    .bind(grid as i16)
    .bind(i64::from(seed))
    .bind(&hammer)
    .bind(&theme)
    .fetch_one(&state.pool)
    .await?;

    Ok(Json(StartResponse { run_id, seed, mode, grid }))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FinishRequest {
    pub taps: Vec<Tap>,
}

#[derive(Serialize)]
pub struct FinishResponse {
    pub mode: Mode,
    pub summary: Summary,
    /// Best score in this mode before the run (today only for Daily).
    pub previous_best: i32,
    pub new_best: bool,
    pub rewards: Granted,
    /// Lucky drop: an item key ("hammer:pan") you just got, if any.
    pub drop: Option<String>,
}

#[derive(sqlx::FromRow)]
struct RunRow {
    mode: String,
    grid: i16,
    seed: i64,
    finished_at: Option<chrono::DateTime<Utc>>,
    elapsed_ms: f64,
}

pub async fn finish(
    State(state): State<AppState>,
    user: AuthUser,
    Path(run_id): Path<Uuid>,
    Json(req): Json<FinishRequest>,
) -> AppResult<Json<FinishResponse>> {
    let mut tx = state.pool.begin().await?;
    let run: RunRow = sqlx::query_as(
        r#"SELECT mode, grid, seed, finished_at,
                  EXTRACT(EPOCH FROM (now() - started_at))::FLOAT8 * 1000 AS elapsed_ms
           FROM wam_runs WHERE id = $1 AND user_id = $2 FOR UPDATE"#,
    )
    .bind(run_id)
    .bind(user.user_id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or(AppError::NotFound)?;

    if run.finished_at.is_some() {
        return Err(AppError::Conflict("this run is already finished".into()));
    }
    if run.elapsed_ms > (RUN_EXPIRY_MIN * 60_000) as f64 {
        return Err(AppError::Validation("this run has expired".into()));
    }
    let mode = Mode::parse(&run.mode).ok_or_else(|| AppError::Validation("unknown mode".into()))?;
    let grid = run.grid as u32;

    let summary = engine::replay(run.seed as u32, mode, grid, &req.taps).map_err(|e| {
        AppError::Validation(
            match e {
                ReplayError::TooManyTaps => "too many taps",
                ReplayError::Unsorted => "taps are out of order",
                ReplayError::BadHole => "tap on a hole that doesn't exist",
                ReplayError::AfterEnd => "tap after the round ended",
            }
            .into(),
        )
    })?;
    // The round can't be over before that much real time has passed.
    if (run.elapsed_ms as i64) + CLOCK_SLACK_MS < i64::from(summary.ended_ms) {
        return Err(AppError::Validation("round finished too fast".into()));
    }

    let previous_best = mode_best(&mut tx, user.user_id, mode).await?;
    let score = summary.score.clamp(0, i32::MAX as i64) as i32;

    sqlx::query(
        r#"UPDATE wam_runs SET finished_at = now(), score = $2, best_streak = $3,
               golden_hits = $4, fever = $5, ended_ms = $6, bosses_beaten = $7
           WHERE id = $1"#,
    )
    .bind(run_id)
    .bind(score)
    .bind(summary.best_streak as i32)
    .bind(summary.golden_hits as i32)
    .bind(summary.fever)
    .bind(summary.ended_ms as i32)
    .bind(summary.bosses_beaten as i32)
    .execute(&mut *tx)
    .await?;
    sqlx::query("INSERT INTO scores (user_id, game_id, score, level) VALUES ($1, $2, $3, $4)")
        .bind(user.user_id)
        .bind(GAME_ID)
        .bind(score)
        .bind(mode.board_id())
        .execute(&mut *tx)
        .await?;

    let round = quests::Event::WhackRound { score: score as i64, golden_hits: summary.golden_hits as i64 };
    quests::api::record(&mut tx, user.user_id, &[round]).await?;
    let reward = score_round_reward(score, &mut rand::thread_rng());
    let rewards = economy::grant(&mut tx, user.user_id, reward, "whack_a_mole_round", true).await?;

    // Lucky drop: a good round may give a hammer or theme you don't own.
    let mut drop = None;
    if i64::from(score) >= items::DROP_MIN_SCORE {
        let roll: f64 = rand::thread_rng().gen();
        if roll < items::DROP_CHANCE {
            let owned = owned_keys(&mut *tx, user.user_id).await?;
            let pick = items::items().random_unowned(&owned, &mut rand::thread_rng());
            if let Some(k) = pick {
                sqlx::query("INSERT INTO wam_items (user_id, item_key, source) VALUES ($1, $2, 'drop') ON CONFLICT DO NOTHING")
                    .bind(user.user_id)
                    .bind(&k)
                    .execute(&mut *tx)
                    .await?;
                drop = Some(k);
            }
        }
    }
    tx.commit().await?;

    Ok(Json(FinishResponse { mode, summary, previous_best, new_best: score > previous_best, rewards, drop }))
}

/// Best score in a mode's leaderboard (Daily: today only).
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

// ---------------------------------------------------------------------------
// Hammers and board themes
// ---------------------------------------------------------------------------

async fn owned_keys(ex: impl sqlx::PgExecutor<'_>, user_id: Uuid) -> AppResult<Vec<String>> {
    Ok(sqlx::query_scalar("SELECT item_key FROM wam_items WHERE user_id = $1")
        .bind(user_id)
        .fetch_all(ex)
        .await?)
}

#[derive(Serialize)]
pub struct ItemView {
    pub id: String,
    pub name: String,
    pub rarity: crate::character::catalog::Rarity,
    pub price: Option<i64>,
    pub owned: bool,
}

#[derive(Serialize)]
pub struct Collection {
    pub hammers: Vec<ItemView>,
    pub themes: Vec<ItemView>,
}

async fn collection_of(state: &AppState, user_id: Uuid) -> AppResult<Collection> {
    let owned = owned_keys(&state.pool, user_id).await?;
    let cat = items::items();
    let view = |kind| {
        cat.list(kind)
            .iter()
            .map(|i| ItemView {
                id: i.id.clone(),
                name: i.name.clone(),
                rarity: i.rarity,
                price: i.price,
                owned: cat.owns(kind, &i.id, &owned),
            })
            .collect()
    };
    Ok(Collection { hammers: view(ItemKind::Hammer), themes: view(ItemKind::Theme) })
}

pub async fn collection(State(state): State<AppState>, user: AuthUser) -> AppResult<Json<Collection>> {
    Ok(Json(collection_of(&state, user.user_id).await?))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BuyRequest {
    pub kind: ItemKind,
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
    let key = items::key(req.kind, &it.id);
    let mut tx = state.pool.begin().await?;
    let inserted = sqlx::query(
        "INSERT INTO wam_items (user_id, item_key, source) VALUES ($1, $2, 'shop') ON CONFLICT DO NOTHING",
    )
    .bind(user.user_id)
    .bind(&key)
    .execute(&mut *tx)
    .await?
    .rows_affected();
    if inserted == 0 {
        return Err(AppError::Conflict(format!("you already own {}", it.name)));
    }
    economy::spend(&mut tx, user.user_id, price, 0, &format!("wam_shop:{key}")).await?;
    tx.commit().await?;
    Ok(Json(collection_of(&state, user.user_id).await?))
}
