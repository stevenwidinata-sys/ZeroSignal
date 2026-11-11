use axum::extract::{Path, State};
use axum::Json;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::auth::jwt::AuthUser;
use crate::birds;
use crate::economy::{self, Granted, Reward};
use crate::error::{AppError, AppResult};
use crate::games::{self, ANGRY_BIRD};
use crate::physics::engine::{score_shots, ShotInput};
use crate::physics::level;
use crate::quests;
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
    /// Coins, tokens and XP actually paid for this round.
    pub rewards: Granted,
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

    let mut tx = state.pool.begin().await?;
    sqlx::query(
        r#"INSERT INTO scores (user_id, game_id, score, level, bird_variant)
           VALUES ($1, $2, $3, $4, $5)"#,
    )
    .bind(user.user_id)
    .bind(ANGRY_BIRD)
    .bind(result.score)
    .bind(req.level)
    .bind(&primary_bird)
    .execute(&mut *tx)
    .await?;
    let reward = score_round_reward(result.score, &mut rand::thread_rng());
    let round = quests::Event::AngryBirdRound { score: result.score as i64 };
    quests::api::record(&mut tx, user.user_id, &[round]).await?;
    let rewards = economy::grant(&mut tx, user.user_id, reward, "angry_bird_round", true).await?;
    tx.commit().await?;

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
        rewards,
    }))
}

/// Reward for one scored round (Angry Bird, Whack-a-Mole).
/// Coins: 1 per 1,000 points. XP: 10 + up to 90 more for a big score.
/// Token: 3% chance, rising to 15% for a 20,000+ point round.
pub fn score_round_reward(score: i32, rng: &mut impl rand::Rng) -> Reward {
    let score = score.max(0) as i64;
    let chance = 0.03 + 0.12 * (score.min(20_000) as f64 / 20_000.0);
    Reward {
        coins: score / 1000,
        tokens: economy::roll_token(chance, rng),
        xp: 10 + (score / 250).min(90),
    }
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
    /// The player's saved outfit (validated when it was saved), if any.
    pub avatar: Option<serde_json::Value>,
}

pub async fn leaderboard(
    State(state): State<AppState>,
    Path(game_id): Path<String>,
) -> AppResult<Json<Vec<LeaderboardEntry>>> {
    let game = games::require(&game_id)?;
    let rows: Vec<LeaderboardEntry> = sqlx::query_as(
        r#"SELECT ROW_NUMBER() OVER (ORDER BY MAX(s.score) DESC, MIN(s.created_at) ASC) AS rank,
                  u.username AS username,
                  MAX(s.score) AS best_score,
                  (SELECT a.loadout FROM avatars a WHERE a.user_id = u.id) AS avatar
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

#[cfg(test)]
mod tests {
    use super::*;
    use rand::SeedableRng;
    use rand_chacha::ChaCha8Rng;

    #[test]
    fn score_round_pays_one_coin_per_thousand_points() {
        let mut r = ChaCha8Rng::seed_from_u64(1);
        assert_eq!(score_round_reward(0, &mut r).coins, 0);
        assert_eq!(score_round_reward(999, &mut r).coins, 0);
        assert_eq!(score_round_reward(4_500, &mut r).coins, 4);
        assert_eq!(score_round_reward(-10, &mut r).coins, 0);
    }

    #[test]
    fn score_round_xp_is_bounded() {
        let mut r = ChaCha8Rng::seed_from_u64(1);
        assert_eq!(score_round_reward(0, &mut r).xp, 10);
        assert_eq!(score_round_reward(1_000_000, &mut r).xp, 100);
    }

    #[test]
    fn bigger_rounds_drop_tokens_more_often() {
        let mut r = ChaCha8Rng::seed_from_u64(2);
        let drops = |score, r: &mut ChaCha8Rng| -> i32 {
            (0..5_000).map(|_| score_round_reward(score, r).tokens).sum()
        };
        let low = drops(0, &mut r);
        let high = drops(20_000, &mut r);
        assert!(high > low * 3, "low={low} high={high}");
    }
}
