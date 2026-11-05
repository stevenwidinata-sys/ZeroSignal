//! Daily quest storage, progress hooks and HTTP handlers.
//!
//! Lock order: the day row (`daily_quest_days`) is always locked before the
//! wallet, so game handlers call [`record`] before `economy::grant`.

use axum::extract::{Path, State};
use axum::Json;
use chrono::{DateTime, NaiveDate, Utc};
use serde::Serialize;
use sqlx::{Postgres, Transaction};
use uuid::Uuid;

use super::{find, pick, Event, BONUS_TOKENS, QUESTS_PER_DAY};
use crate::auth::jwt::AuthUser;
use crate::daily;
use crate::economy::{self, Granted, Reward};
use crate::error::{AppError, AppResult};
use crate::state::AppState;

#[derive(sqlx::FromRow)]
struct DayRow {
    rerolled: bool,
    bonus_claimed: bool,
}

#[derive(sqlx::FromRow)]
struct SlotRow {
    slot: i16,
    quest_id: String,
    progress: i32,
    target: i32,
    claimed_at: Option<DateTime<Utc>>,
}

/// Create today's quests if needed, then lock the day row.
async fn lock_today(
    tx: &mut Transaction<'_, Postgres>,
    user_id: Uuid,
    today: NaiveDate,
) -> AppResult<DayRow> {
    // The primary key makes a parallel request wait here, then skip.
    let created = sqlx::query(
        "INSERT INTO daily_quest_days (user_id, day) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    )
    .bind(user_id)
    .bind(today)
    .execute(&mut **tx)
    .await?
    .rows_affected()
        == 1;
    if created {
        let picks = pick(QUESTS_PER_DAY, &[], &mut rand::thread_rng());
        for (slot, q) in picks.iter().enumerate() {
            sqlx::query(
                "INSERT INTO daily_quests (user_id, day, slot, quest_id, target) VALUES ($1, $2, $3, $4, $5)",
            )
            .bind(user_id)
            .bind(today)
            .bind(slot as i16)
            .bind(q.id)
            .bind(q.target)
            .execute(&mut **tx)
            .await?;
        }
    }
    Ok(sqlx::query_as(
        "SELECT rerolled, bonus_claimed FROM daily_quest_days WHERE user_id = $1 AND day = $2 FOR UPDATE",
    )
    .bind(user_id)
    .bind(today)
    .fetch_one(&mut **tx)
    .await?)
}

async fn slots(
    tx: &mut Transaction<'_, Postgres>,
    user_id: Uuid,
    today: NaiveDate,
) -> AppResult<Vec<SlotRow>> {
    Ok(sqlx::query_as(
        "SELECT slot, quest_id, progress, target, claimed_at FROM daily_quests \
         WHERE user_id = $1 AND day = $2 ORDER BY slot",
    )
    .bind(user_id)
    .bind(today)
    .fetch_all(&mut **tx)
    .await?)
}

/// Move today's quests forward. Call inside the transaction that records the
/// verified result, before paying the game reward.
pub async fn record(
    tx: &mut Transaction<'_, Postgres>,
    user_id: Uuid,
    events: &[Event],
) -> AppResult<()> {
    let today = daily::wib_date(Utc::now());
    lock_today(tx, user_id, today).await?;
    for s in slots(tx, user_id, today).await? {
        let Some(q) = find(&s.quest_id) else { continue };
        if s.claimed_at.is_some() || s.progress >= s.target {
            continue;
        }
        let delta: i64 = events.iter().map(|e| q.progress(e) as i64).sum();
        if delta == 0 {
            continue;
        }
        let progress = (s.progress as i64 + delta).min(s.target as i64) as i32;
        sqlx::query("UPDATE daily_quests SET progress = $4 WHERE user_id = $1 AND day = $2 AND slot = $3")
            .bind(user_id)
            .bind(today)
            .bind(s.slot)
            .bind(progress)
            .execute(&mut **tx)
            .await?;
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

#[derive(Serialize)]
pub struct QuestView {
    pub slot: i16,
    pub id: String,
    pub title: &'static str,
    pub progress: i32,
    pub target: i32,
    pub coins: i64,
    pub xp: i64,
    pub done: bool,
    pub claimed: bool,
}

#[derive(Serialize)]
pub struct QuestsView {
    pub quests: Vec<QuestView>,
    pub reroll_available: bool,
    pub bonus_tokens: i32,
    pub bonus_claimed: bool,
    /// When the next WIB day (and a new set of quests) starts.
    pub next_reset: DateTime<Utc>,
}

#[derive(Serialize)]
pub struct ClaimResponse {
    pub quests: QuestsView,
    pub granted: Granted,
    /// True when this claim finished all 3 and paid the bonus token.
    pub bonus: bool,
}

async fn view(
    tx: &mut Transaction<'_, Postgres>,
    user_id: Uuid,
    today: NaiveDate,
    day: &DayRow,
) -> AppResult<QuestsView> {
    let quests = slots(tx, user_id, today)
        .await?
        .into_iter()
        .filter_map(|s| {
            let q = find(&s.quest_id)?;
            Some(QuestView {
                slot: s.slot,
                id: s.quest_id,
                title: q.title,
                progress: s.progress,
                target: s.target,
                coins: q.coins,
                xp: q.xp,
                done: s.progress >= s.target,
                claimed: s.claimed_at.is_some(),
            })
        })
        .collect();
    Ok(QuestsView {
        quests,
        reroll_available: !day.rerolled,
        bonus_tokens: BONUS_TOKENS,
        bonus_claimed: day.bonus_claimed,
        next_reset: daily::wib_day_start(today.succ_opt().expect("date in range")),
    })
}

fn slot_of(rows: &[SlotRow], slot: i16) -> AppResult<&SlotRow> {
    rows.iter().find(|s| s.slot == slot).ok_or(AppError::NotFound)
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/// `GET /api/me/quests`
pub async fn get_quests(State(state): State<AppState>, user: AuthUser) -> AppResult<Json<QuestsView>> {
    let today = daily::wib_date(Utc::now());
    let mut tx = state.pool.begin().await?;
    let day = lock_today(&mut tx, user.user_id, today).await?;
    let v = view(&mut tx, user.user_id, today, &day).await?;
    tx.commit().await?;
    Ok(Json(v))
}

/// `POST /api/me/quests/:slot/claim` - pay a finished quest (and the bonus
/// token once all 3 are claimed). Quest coins don't count toward the cap.
pub async fn claim(
    State(state): State<AppState>,
    user: AuthUser,
    Path(slot): Path<i16>,
) -> AppResult<Json<ClaimResponse>> {
    let today = daily::wib_date(Utc::now());
    let mut tx = state.pool.begin().await?;
    let mut day = lock_today(&mut tx, user.user_id, today).await?;
    let rows = slots(&mut tx, user.user_id, today).await?;
    let s = slot_of(&rows, slot)?;
    let q = find(&s.quest_id).ok_or(AppError::NotFound)?;
    if s.claimed_at.is_some() {
        return Err(AppError::Validation("quest already claimed".into()));
    }
    if s.progress < s.target {
        return Err(AppError::Validation("quest not finished yet".into()));
    }
    sqlx::query("UPDATE daily_quests SET claimed_at = now() WHERE user_id = $1 AND day = $2 AND slot = $3")
        .bind(user.user_id)
        .bind(today)
        .bind(slot)
        .execute(&mut *tx)
        .await?;

    let mut reward = q.reward();
    let all_claimed = rows.iter().all(|r| r.slot == slot || r.claimed_at.is_some());
    let bonus = all_claimed && !day.bonus_claimed;
    if bonus {
        reward = reward + Reward { tokens: BONUS_TOKENS, ..Reward::default() };
        sqlx::query("UPDATE daily_quest_days SET bonus_claimed = TRUE WHERE user_id = $1 AND day = $2")
            .bind(user.user_id)
            .bind(today)
            .execute(&mut *tx)
            .await?;
        day.bonus_claimed = true;
    }
    let reason = if bonus { "daily_quest_bonus" } else { "daily_quest" };
    let granted = economy::grant(&mut tx, user.user_id, reward, reason, false).await?;
    let quests = view(&mut tx, user.user_id, today, &day).await?;
    tx.commit().await?;
    Ok(Json(ClaimResponse { quests, granted, bonus }))
}

/// `POST /api/me/quests/:slot/reroll` - swap one unfinished quest for a new
/// random one (not already in today's list). Once per day.
pub async fn reroll(
    State(state): State<AppState>,
    user: AuthUser,
    Path(slot): Path<i16>,
) -> AppResult<Json<QuestsView>> {
    let today = daily::wib_date(Utc::now());
    let mut tx = state.pool.begin().await?;
    let mut day = lock_today(&mut tx, user.user_id, today).await?;
    if day.rerolled {
        return Err(AppError::Validation("you already used today's reroll".into()));
    }
    let rows = slots(&mut tx, user.user_id, today).await?;
    let s = slot_of(&rows, slot)?;
    if s.claimed_at.is_some() || s.progress >= s.target {
        return Err(AppError::Validation("this quest is finished: claim it instead".into()));
    }
    let current: Vec<&str> = rows.iter().map(|r| r.quest_id.as_str()).collect();
    let new = *pick(1, &current, &mut rand::thread_rng())
        .first()
        .ok_or_else(|| AppError::Internal(anyhow::anyhow!("quest pool too small")))?;
    sqlx::query(
        "UPDATE daily_quests SET quest_id = $4, target = $5, progress = 0 \
         WHERE user_id = $1 AND day = $2 AND slot = $3",
    )
    .bind(user.user_id)
    .bind(today)
    .bind(slot)
    .bind(new.id)
    .bind(new.target)
    .execute(&mut *tx)
    .await?;
    sqlx::query("UPDATE daily_quest_days SET rerolled = TRUE WHERE user_id = $1 AND day = $2")
        .bind(user.user_id)
        .bind(today)
        .execute(&mut *tx)
        .await?;
    day.rerolled = true;
    let v = view(&mut tx, user.user_id, today, &day).await?;
    tx.commit().await?;
    Ok(Json(v))
}
