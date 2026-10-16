use axum::extract::{Path, State};
use axum::Json;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::auth::jwt::AuthUser;
use crate::birds;
use crate::error::{AppError, AppResult};
use crate::games::{self, ANGRY_BIRD};
use crate::physics::engine::{score_shots, ShotInput};
use crate::physics::level;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Angry Bird: authoritative submit. The client sends only shot *inputs*; the
// server re-simulates them and computes the real score.
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SubmitRequest {
    pub level: i32,
    pub shots: Vec<ShotInput>,
}

#[derive(Serialize)]
pub struct SubmitResponse {
    pub score: i32,
    pub pigs_destroyed: usize,
    pub blocks_destroyed: usize,
    pub best_score: i32,
    pub newly_unlocked: Vec<String>,
}

/// Must match the client's birds-per-round (frontend engine.ts MAX_SHOTS).
const MAX_SHOTS: usize = 5;

pub async fn submit_angry_bird(
    State(state): State<AppState>,
    user: AuthUser,
    Json(req): Json<SubmitRequest>,
) -> AppResult<Json<SubmitResponse>> {
    if req.shots.is_empty() {
        return Err(AppError::Validation("no shots submitted".into()));
    }
    if req.shots.len() > MAX_SHOTS {
        return Err(AppError::Validation("too many shots".into()));
    }

    // Best score BEFORE this run: used for unlock checks and new unlocks.
    let prev_best = fetch_best_score(&state, ANGRY_BIRD, user.user_id).await?;

    for s in &req.shots {
        if !s.power.is_finite() || !s.angle.is_finite() {
            return Err(AppError::Validation("invalid shot values".into()));
        }
        if let Some(t) = s.ability_tap {
            if !t.is_finite() || t < 0.0 {
                return Err(AppError::Validation("invalid ability timing".into()));
            }
        }
        if birds::find(&s.bird).is_none() {
            return Err(AppError::Validation(format!("unknown bird: {}", s.bird)));
        }
        // Players can't use birds they haven't unlocked by calling the API directly.
        if !birds::is_unlocked(&s.bird, prev_best) {
            return Err(AppError::Validation(format!("bird locked: {}", s.bird)));
        }
    }

    let lvl = level::by_id(req.level)
        .ok_or_else(|| AppError::Validation("unknown level".into()))?;

    // Authoritative simulation.
    let result = score_shots(lvl, &req.shots);
    let primary_bird = req.shots[0].bird.clone();

    sqlx::query(
        r#"INSERT INTO scores (user_id, game_id, score, level, bird_variant)
           VALUES ($1, $2, $3, $4, $5)"#,
    )
    .bind(user.user_id)
    .bind(ANGRY_BIRD)
    .bind(result.score)
    .bind(req.level)
    .bind(&primary_bird)
    .execute(&state.pool)
    .await?;

    let new_best = prev_best.max(result.score);
    let newly_unlocked: Vec<String> = birds::BIRDS
        .iter()
        .filter(|b| {
            new_best >= b.unlock_score && prev_best < b.unlock_score && b.unlock_score > 0
        })
        .map(|b| b.id.to_string())
        .collect();

    Ok(Json(SubmitResponse {
        score: result.score,
        pigs_destroyed: result.pigs_destroyed,
        blocks_destroyed: result.blocks_destroyed,
        best_score: new_best,
        newly_unlocked,
    }))
}

// ---------------------------------------------------------------------------
// Generic, per-game leaderboards and history (work for every catalog game).
// ---------------------------------------------------------------------------

const LEADERBOARD_SIZE: i64 = 20;
const HISTORY_SIZE: i64 = 50;

#[derive(Serialize, sqlx::FromRow)]
pub struct LeaderboardEntry {
    pub rank: i64,
    pub username: String,
    pub best_score: i32,
}

pub async fn leaderboard(
    State(state): State<AppState>,
    Path(game_id): Path<String>,
) -> AppResult<Json<Vec<LeaderboardEntry>>> {
    let game = games::require(&game_id)?;
    let rows: Vec<LeaderboardEntry> = sqlx::query_as(
        r#"SELECT ROW_NUMBER() OVER (ORDER BY MAX(s.score) DESC, MIN(s.created_at) ASC) AS rank,
                  u.username AS username,
                  MAX(s.score) AS best_score
           FROM scores s JOIN users u ON u.id = s.user_id
           WHERE s.game_id = $1
           GROUP BY u.id, u.username
           ORDER BY rank
           LIMIT $2"#,
    )
    .bind(game.id)
    .bind(LEADERBOARD_SIZE)
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(rows))
}

#[derive(Serialize, sqlx::FromRow)]
pub struct MyScore {
    pub score: i32,
    pub level: i32,
    pub bird_variant: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Serialize)]
pub struct MyScoresResponse {
    pub game_id: String,
    pub best_score: i32,
    pub scores: Vec<MyScore>,
}

pub async fn my_scores(
    State(state): State<AppState>,
    Path(game_id): Path<String>,
    user: AuthUser,
) -> AppResult<Json<MyScoresResponse>> {
    let game = games::require(&game_id)?;
    let best = fetch_best_score(&state, game.id, user.user_id).await?;
    let scores: Vec<MyScore> = sqlx::query_as(
        r#"SELECT score, level, bird_variant, created_at
           FROM scores WHERE user_id = $1 AND game_id = $2
           ORDER BY created_at DESC LIMIT $3"#,
    )
    .bind(user.user_id)
    .bind(game.id)
    .bind(HISTORY_SIZE)
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(MyScoresResponse {
        game_id: game.id.to_string(),
        best_score: best,
        scores,
    }))
}

// Legacy routes (pre-platform clients) map to Angry Bird.
pub async fn legacy_leaderboard(state: State<AppState>) -> AppResult<Json<Vec<LeaderboardEntry>>> {
    leaderboard(state, Path(ANGRY_BIRD.to_string())).await
}

pub async fn legacy_my_scores(
    state: State<AppState>,
    user: AuthUser,
) -> AppResult<Json<MyScoresResponse>> {
    my_scores(state, Path(ANGRY_BIRD.to_string()), user).await
}

pub async fn fetch_best_score(state: &AppState, game_id: &str, user_id: Uuid) -> AppResult<i32> {
    let best: i32 = sqlx::query_scalar(
        r#"SELECT COALESCE(MAX(score), 0) FROM scores WHERE user_id = $1 AND game_id = $2"#,
    )
    .bind(user_id)
    .bind(game_id)
    .fetch_one(&state.pool)
    .await?;
    Ok(best)
}
