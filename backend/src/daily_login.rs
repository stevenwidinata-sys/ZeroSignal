//! Daily login reward: a 7-day streak that pays more each day.
//!
//! - Day 1..7 pay 10/15/20/25/30/40/100 coins; day 7 also pays 1 token.
//! - After day 7 the streak starts again at day 1.
//! - Missing a WIB day resets the streak to day 1.
//! - Login coins don't count toward the daily game coin cap.

use axum::extract::State;
use axum::Json;
use chrono::{DateTime, NaiveDate, Utc};
use serde::Serialize;
use uuid::Uuid;

use crate::auth::jwt::{AuthUser, Member};
use crate::daily;
use crate::economy::{self, Granted, Reward};
use crate::error::{AppError, AppResult};
use crate::state::AppState;

pub const STREAK_LEN: i16 = 7;
const COINS: [i64; STREAK_LEN as usize] = [10, 15, 20, 25, 30, 40, 100];

/// What claiming on `streak_day` (1..=7) pays.
pub fn reward_for(streak_day: i16) -> Reward {
    let i = (streak_day.clamp(1, STREAK_LEN) - 1) as usize;
    Reward {
        coins: COINS[i],
        tokens: i32::from(streak_day == STREAK_LEN),
        xp: 0,
    }
}

/// The streak day the next claim pays, given the last claim (if any).
/// Returns `None` when today was already claimed.
pub fn next_streak_day(last: Option<(NaiveDate, i16)>, today: NaiveDate) -> Option<i16> {
    match last {
        Some((day, _)) if day >= today => None,
        Some((day, n)) if today.pred_opt() == Some(day) => Some(n % STREAK_LEN + 1),
        _ => Some(1),
    }
}

#[derive(Serialize)]
pub struct DayReward {
    pub day: i16,
    pub coins: i64,
    pub tokens: i32,
}

#[derive(Serialize)]
pub struct LoginStatus {
    /// True once today's reward has been claimed.
    pub claimed_today: bool,
    /// Streak day claimed today, or the one the next claim will pay.
    pub streak_day: i16,
    pub rewards: Vec<DayReward>,
    /// When the next WIB day starts (UTC timestamp).
    pub next_reset: DateTime<Utc>,
}

#[derive(Serialize)]
pub struct ClaimResponse {
    pub status: LoginStatus,
    pub granted: Granted,
}

fn reward_table() -> Vec<DayReward> {
    (1..=STREAK_LEN)
        .map(|d| {
            let r = reward_for(d);
            DayReward { day: d, coins: r.coins, tokens: r.tokens }
        })
        .collect()
}

async fn last_claim(
    ex: impl sqlx::PgExecutor<'_>,
    user_id: Uuid,
) -> AppResult<Option<(NaiveDate, i16)>> {
    Ok(sqlx::query_as(
        "SELECT day, streak_day FROM login_claims WHERE user_id = $1 ORDER BY day DESC LIMIT 1",
    )
    .bind(user_id)
    .fetch_optional(ex)
    .await?)
}

fn status_for(last: Option<(NaiveDate, i16)>, now: DateTime<Utc>) -> LoginStatus {
    let today = daily::wib_date(now);
    let (claimed_today, streak_day) = match next_streak_day(last, today) {
        Some(n) => (false, n),
        None => (true, last.map(|(_, n)| n).unwrap_or(1)),
    };
    let tomorrow = today.succ_opt().expect("date in range");
    LoginStatus {
        claimed_today,
        streak_day,
        rewards: reward_table(),
        next_reset: daily::wib_day_start(tomorrow),
    }
}

/// `GET /api/me/daily-login`
pub async fn status(State(state): State<AppState>, user: AuthUser) -> AppResult<Json<LoginStatus>> {
    let last = last_claim(&state.pool, user.user_id).await?;
    Ok(Json(status_for(last, Utc::now())))
}

/// `POST /api/me/daily-login/claim`
pub async fn claim(State(state): State<AppState>, user: Member) -> AppResult<Json<ClaimResponse>> {
    let now = Utc::now();
    let today = daily::wib_date(now);
    let mut tx = state.pool.begin().await?;
    let last = last_claim(&mut *tx, user.user_id).await?;
    let streak_day = next_streak_day(last, today)
        .ok_or_else(|| AppError::Validation("today's reward is already claimed".into()))?;

    // The (user_id, day) key stops a second claim, even from parallel requests.
    let inserted = sqlx::query(
        "INSERT INTO login_claims (user_id, day, streak_day) VALUES ($1, $2, $3) \
         ON CONFLICT DO NOTHING",
    )
    .bind(user.user_id)
    .bind(today)
    .bind(streak_day)
    .execute(&mut *tx)
    .await?
    .rows_affected();
    if inserted != 1 {
        return Err(AppError::Validation("today's reward is already claimed".into()));
    }
    let granted =
        economy::grant(&mut tx, user.user_id, reward_for(streak_day), "daily_login", false).await?;
    tx.commit().await?;

    Ok(Json(ClaimResponse {
        status: status_for(Some((today, streak_day)), now),
        granted,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn d(day: u32) -> NaiveDate {
        NaiveDate::from_ymd_opt(2026, 11, day).unwrap()
    }

    #[test]
    fn rewards_match_the_table() {
        let coins: Vec<i64> = (1..=7).map(|n| reward_for(n).coins).collect();
        assert_eq!(coins, vec![10, 15, 20, 25, 30, 40, 100]);
        assert!((1..=6).all(|n| reward_for(n).tokens == 0));
        assert_eq!(reward_for(7).tokens, 1);
    }

    #[test]
    fn first_claim_is_day_one() {
        assert_eq!(next_streak_day(None, d(6)), Some(1));
    }

    #[test]
    fn same_day_cannot_claim_twice() {
        assert_eq!(next_streak_day(Some((d(6), 3)), d(6)), None);
    }

    #[test]
    fn consecutive_days_grow_and_wrap_after_seven() {
        assert_eq!(next_streak_day(Some((d(5), 3)), d(6)), Some(4));
        assert_eq!(next_streak_day(Some((d(5), 6)), d(6)), Some(7));
        assert_eq!(next_streak_day(Some((d(5), 7)), d(6)), Some(1));
    }

    #[test]
    fn missing_a_day_resets() {
        assert_eq!(next_streak_day(Some((d(4), 5)), d(6)), Some(1));
    }

    #[test]
    fn status_reports_claimed_day_and_next_reset() {
        use chrono::TimeZone;
        // 03:00 UTC on Nov 6 = 10:00 WIB Nov 6.
        let now = Utc.with_ymd_and_hms(2026, 11, 6, 3, 0, 0).unwrap();
        let s = status_for(Some((d(6), 4)), now);
        assert!(s.claimed_today);
        assert_eq!(s.streak_day, 4);
        assert_eq!(s.next_reset, Utc.with_ymd_and_hms(2026, 11, 6, 17, 0, 0).unwrap());
        let s = status_for(Some((d(5), 4)), now);
        assert!(!s.claimed_today);
        assert_eq!(s.streak_day, 5);
        assert_eq!(s.rewards.len(), 7);
    }
}
