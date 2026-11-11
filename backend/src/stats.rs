//! Your stats page: totals and per-game records, all read from results the
//! server already verified. Private (`/api/me/stats`).

use axum::extract::State;
use axum::Json;
use chrono::{DateTime, Utc};
use serde::Serialize;

use crate::auth::jwt::AuthUser;
use crate::economy::level_info;
use crate::error::AppResult;
use crate::state::AppState;

#[derive(Serialize, sqlx::FromRow)]
pub struct SeriesRow {
    /// "connect-four" or "tic-tac-toe".
    pub game: String,
    pub difficulty: String,
    pub played: i64,
    pub won: i64,
    pub lost: i64,
    pub drawn: i64,
}

#[derive(Serialize, sqlx::FromRow)]
pub struct BoardRow {
    pub game_id: String,
    /// Board within the game (Whack-a-Mole mode, Minefield size, Angry Bird level).
    pub level: i32,
    pub rounds: i64,
    pub best: i32,
    pub average: i64,
}

#[derive(Serialize, sqlx::FromRow)]
pub struct MinefieldRow {
    pub difficulty: String,
    pub played: i64,
    pub won: i64,
    pub best_time_ms: Option<i32>,
}

#[derive(Serialize, sqlx::FromRow, Default)]
pub struct WhackRow {
    pub rounds: i64,
    pub best_streak: Option<i32>,
    pub fever_rounds: i64,
    pub golden_hits: Option<i64>,
    pub longest_survival_ms: Option<i32>,
}

#[derive(Serialize)]
pub struct StatsView {
    pub joined: DateTime<Utc>,
    pub level: i32,
    pub xp: i64,
    pub coins_earned: i64,
    pub coins_spent: i64,
    pub tokens_earned: i64,
    pub best_login_streak: i64,
    pub quests_claimed: i64,
    pub achievements_claimed: i64,
    pub series: Vec<SeriesRow>,
    pub boards: Vec<BoardRow>,
    pub minefield: Vec<MinefieldRow>,
    pub whack: WhackRow,
}

pub async fn my_stats(State(state): State<AppState>, user: AuthUser) -> AppResult<Json<StatsView>> {
    let pool = &state.pool;
    let id = user.user_id;

    let joined: DateTime<Utc> = sqlx::query_scalar("SELECT created_at FROM users WHERE id = $1")
        .bind(id)
        .fetch_one(pool)
        .await?;
    let xp: i64 = sqlx::query_scalar("SELECT COALESCE((SELECT xp FROM wallets WHERE user_id = $1), 0)")
        .bind(id)
        .fetch_one(pool)
        .await?;
    let (coins_earned, coins_spent, tokens_earned): (i64, i64, i64) = sqlx::query_as(
        r#"SELECT COALESCE(SUM(coins) FILTER (WHERE coins > 0), 0)::BIGINT,
                  COALESCE(SUM(-coins) FILTER (WHERE coins < 0), 0)::BIGINT,
                  COALESCE(SUM(tokens) FILTER (WHERE tokens > 0), 0)::BIGINT
           FROM wallet_ledger WHERE user_id = $1"#,
    )
    .bind(id)
    .fetch_one(pool)
    .await?;
    let count = |sql: &'static str| async move {
        sqlx::query_scalar::<_, Option<i64>>(sql).bind(id).fetch_one(pool).await.map(|v| v.unwrap_or(0))
    };
    let best_login_streak = count("SELECT MAX(streak_day)::BIGINT FROM login_claims WHERE user_id = $1").await?;
    let quests_claimed =
        count("SELECT COUNT(*) FROM daily_quests WHERE user_id = $1 AND claimed_at IS NOT NULL").await?;
    let achievements_claimed = count("SELECT COUNT(*) FROM user_achievements WHERE user_id = $1").await?;

    // Finished AI series. Forfeits count as losses.
    let series: Vec<SeriesRow> = sqlx::query_as(
        r#"SELECT game, difficulty, COUNT(*) AS played,
                  COUNT(*) FILTER (WHERE status = 'won') AS won,
                  COUNT(*) FILTER (WHERE status IN ('lost', 'forfeited')) AS lost,
                  COUNT(*) FILTER (WHERE status = 'drawn') AS drawn
           FROM (SELECT 'connect-four' AS game, difficulty, status FROM cf_matches WHERE user_id = $1
                 UNION ALL
                 SELECT 'tic-tac-toe', difficulty, status FROM ttt_matches WHERE user_id = $1) m
           WHERE status <> 'active'
           GROUP BY game, difficulty
           ORDER BY game, CASE difficulty WHEN 'easy' THEN 1 WHEN 'medium' THEN 2 WHEN 'hard' THEN 3 ELSE 4 END"#,
    )
    .bind(id)
    .fetch_all(pool)
    .await?;

    let boards: Vec<BoardRow> = sqlx::query_as(
        r#"SELECT game_id, level, COUNT(*) AS rounds, MAX(score) AS best,
                  ROUND(AVG(score))::BIGINT AS average
           FROM scores WHERE user_id = $1
           GROUP BY game_id, level ORDER BY game_id, level"#,
    )
    .bind(id)
    .fetch_all(pool)
    .await?;

    let minefield: Vec<MinefieldRow> = sqlx::query_as(
        r#"SELECT difficulty, COUNT(*) AS played,
                  COUNT(*) FILTER (WHERE status = 'won') AS won,
                  MIN(time_ms) FILTER (WHERE status = 'won') AS best_time_ms
           FROM mf_games WHERE user_id = $1 AND status IN ('won', 'lost')
           GROUP BY difficulty
           ORDER BY CASE difficulty WHEN 'beginner' THEN 1 WHEN 'intermediate' THEN 2 WHEN 'expert' THEN 3 ELSE 4 END"#,
    )
    .bind(id)
    .fetch_all(pool)
    .await?;

    let whack: WhackRow = sqlx::query_as(
        r#"SELECT COUNT(*) AS rounds, MAX(best_streak) AS best_streak,
                  COUNT(*) FILTER (WHERE fever) AS fever_rounds,
                  SUM(golden_hits)::BIGINT AS golden_hits,
                  MAX(ended_ms) FILTER (WHERE mode = 'survival') AS longest_survival_ms
           FROM wam_runs WHERE user_id = $1 AND finished_at IS NOT NULL"#,
    )
    .bind(id)
    .fetch_one(pool)
    .await?;

    Ok(Json(StatsView {
        joined,
        level: level_info(xp).level,
        xp,
        coins_earned,
        coins_spent,
        tokens_earned,
        best_login_streak,
        quests_claimed,
        achievements_claimed,
        series,
        boards,
        minefield,
        whack,
    }))
}
