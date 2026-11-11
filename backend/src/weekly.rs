//! Weekly prizes: the top 3 of last week on each prize board win coins (and
//! #1 a token). Players claim them once; places are worked out from the
//! verified scores, so nothing has to run at the week change.

use axum::extract::State;
use axum::Json;
use chrono::{NaiveDate, Utc};
use serde::Serialize;

use crate::auth::jwt::AuthUser;
use crate::daily;
use crate::economy::{self, Granted, Reward};
use crate::error::{AppError, AppResult};
use crate::games::{self, GameStatus};
use crate::scores::{self, Window};
use crate::state::AppState;

/// Coins (and tokens) for places 1, 2 and 3.
pub fn prize(rank: i64) -> Option<Reward> {
    match rank {
        1 => Some(Reward { coins: 150, tokens: 1, xp: 0 }),
        2 => Some(Reward { coins: 100, tokens: 0, xp: 0 }),
        3 => Some(Reward { coins: 50, tokens: 0, xp: 0 }),
        _ => None,
    }
}

#[derive(Serialize, Clone)]
pub struct PrizeView {
    pub game_id: &'static str,
    /// Board within the game; null = the whole game.
    pub level: Option<i32>,
    pub rank: i64,
    pub coins: i64,
    pub tokens: i32,
    pub claimed: bool,
}

#[derive(Serialize)]
pub struct PrizesView {
    /// Monday (WIB) the prize week started.
    pub week: NaiveDate,
    pub prizes: Vec<PrizeView>,
}

/// Your top-3 places last week, with claim status.
async fn my_prizes(state: &AppState, user: &AuthUser) -> AppResult<(NaiveDate, Vec<PrizeView>)> {
    let now = Utc::now();
    let week = daily::week_monday(now) - chrono::Duration::days(7);
    let window = Window::parse(Some("last_week"), now).expect("valid period");
    let mut out = Vec::new();
    for game in games::GAMES.iter().filter(|g| g.status == GameStatus::Live) {
        let boards: Vec<Option<i32>> =
            if game.prize_boards.is_empty() { vec![None] } else { game.prize_boards.iter().map(|b| Some(*b)).collect() };
        for level in boards {
            let top = scores::top(&state.pool, game, level, window, 3).await?;
            if let Some(me) = top.iter().find(|e| e.username == user.username) {
                if let Some(r) = prize(me.rank) {
                    out.push(PrizeView {
                        game_id: game.id,
                        level,
                        rank: me.rank,
                        coins: r.coins,
                        tokens: r.tokens,
                        claimed: false,
                    });
                }
            }
        }
    }
    let claimed: Vec<(String, i32)> =
        sqlx::query_as("SELECT game_id, level FROM weekly_prize_claims WHERE user_id = $1 AND week = $2")
            .bind(user.user_id)
            .bind(week)
            .fetch_all(&state.pool)
            .await?;
    for p in &mut out {
        p.claimed = claimed.iter().any(|(g, l)| g == p.game_id && *l == p.level.unwrap_or(0));
    }
    Ok((week, out))
}

pub async fn list(State(state): State<AppState>, user: AuthUser) -> AppResult<Json<PrizesView>> {
    let (week, prizes) = my_prizes(&state, &user).await?;
    Ok(Json(PrizesView { week, prizes }))
}

#[derive(Serialize)]
pub struct ClaimView {
    pub claimed: Vec<PrizeView>,
    pub rewards: Granted,
}

/// Claim every unclaimed prize from last week at once.
pub async fn claim(State(state): State<AppState>, user: AuthUser) -> AppResult<Json<ClaimView>> {
    let (week, prizes) = my_prizes(&state, &user).await?;
    let open: Vec<PrizeView> = prizes.into_iter().filter(|p| !p.claimed).collect();
    if open.is_empty() {
        return Err(AppError::Conflict("no weekly prizes to claim".into()));
    }
    let mut tx = state.pool.begin().await?;
    let mut total = Reward::default();
    let mut claimed = Vec::new();
    for p in open {
        // The primary key makes a double claim impossible.
        let inserted = sqlx::query(
            "INSERT INTO weekly_prize_claims (user_id, week, game_id, level, rank) VALUES ($1, $2, $3, $4, $5) \
             ON CONFLICT DO NOTHING",
        )
        .bind(user.user_id)
        .bind(week)
        .bind(p.game_id)
        .bind(p.level.unwrap_or(0))
        .bind(p.rank as i16)
        .execute(&mut *tx)
        .await?
        .rows_affected();
        if inserted == 1 {
            total = total + Reward { coins: p.coins, tokens: p.tokens, xp: 0 };
            claimed.push(PrizeView { claimed: true, ..p });
        }
    }
    let rewards = economy::grant(&mut tx, user.user_id, total, "weekly_prize", false).await?;
    tx.commit().await?;
    Ok(Json(ClaimView { claimed, rewards }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prizes_for_top_three_only() {
        assert_eq!(prize(1), Some(Reward { coins: 150, tokens: 1, xp: 0 }));
        assert_eq!(prize(2).unwrap().coins, 100);
        assert_eq!(prize(3).unwrap().coins, 50);
        assert_eq!(prize(4), None);
        assert_eq!(prize(0), None);
    }
}
