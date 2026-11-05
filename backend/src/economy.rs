//! Player economy shared by every game: coins, tokens, XP and levels.
//!
//! Rules:
//! - Only the server grants rewards, always from a server-verified result and
//!   inside the same transaction that records that result.
//! - Game coin rewards count toward a daily cap so nobody can farm forever.
//! - Tokens are rare, luck-based drops (higher chance against harder AI).

use axum::extract::State;
use axum::Json;
use rand::Rng;
use serde::Serialize;
use sqlx::{Postgres, Transaction};
use uuid::Uuid;

use crate::auth::jwt::AuthUser;
use crate::daily;
use crate::error::{AppError, AppResult};
use crate::state::AppState;

/// Max coins one account can earn from games per WIB day (see `daily`).
pub const DAILY_COIN_CAP: i64 = 1000;

// ---------------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------------

/// XP needed to go from `level` to `level + 1`. Each level needs a bit more.
pub fn xp_to_next(level: i32) -> i64 {
    100 + 50 * (level.max(1) as i64 - 1)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct LevelInfo {
    pub level: i32,
    /// XP earned inside the current level.
    pub xp_into_level: i64,
    /// XP the current level needs in total.
    pub xp_for_next: i64,
}

pub fn level_info(total_xp: i64) -> LevelInfo {
    let mut level = 1;
    let mut rest = total_xp.max(0);
    while rest >= xp_to_next(level) {
        rest -= xp_to_next(level);
        level += 1;
    }
    LevelInfo { level, xp_into_level: rest, xp_for_next: xp_to_next(level) }
}

// ---------------------------------------------------------------------------
// Rewards
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
pub struct Reward {
    pub coins: i64,
    pub tokens: i32,
    pub xp: i64,
}

impl Reward {
    pub fn is_empty(&self) -> bool {
        self.coins == 0 && self.tokens == 0 && self.xp == 0
    }
}

impl std::ops::Add for Reward {
    type Output = Reward;
    fn add(self, o: Reward) -> Reward {
        Reward { coins: self.coins + o.coins, tokens: self.tokens + o.tokens, xp: self.xp + o.xp }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GameResult {
    Win,
    Draw,
    Loss,
}

/// XP for one finished game, scaled by how hard the opponent was.
/// You always get some XP, even for a loss.
pub fn game_xp(result: GameResult, difficulty_mult: i64) -> i64 {
    let base = match result {
        GameResult::Win => 20,
        GameResult::Draw => 10,
        GameResult::Loss => 5,
    };
    base * difficulty_mult.max(1)
}

/// Roll a luck-based token drop.
pub fn roll_token(chance: f64, rng: &mut impl Rng) -> i32 {
    i32::from(rng.gen_bool(chance.clamp(0.0, 1.0)))
}

/// How much of `wanted` coins can still be paid today.
pub fn apply_daily_cap(wanted: i64, earned_today: i64) -> i64 {
    wanted.clamp(0, (DAILY_COIN_CAP - earned_today).max(0))
}

/// What a grant actually paid out (after the daily cap).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
pub struct Granted {
    pub coins: i64,
    pub tokens: i32,
    pub xp: i64,
    /// Coins withheld because the daily cap was reached.
    pub coins_capped: i64,
    pub level_before: i32,
    pub level_after: i32,
}

impl Granted {
    pub fn leveled_up(&self) -> bool {
        self.level_after > self.level_before
    }
}

#[derive(sqlx::FromRow)]
struct WalletRow {
    coins: i64,
    tokens: i32,
    xp: i64,
}

async fn lock_wallet(tx: &mut Transaction<'_, Postgres>, user_id: Uuid) -> AppResult<WalletRow> {
    sqlx::query("INSERT INTO wallets (user_id) VALUES ($1) ON CONFLICT DO NOTHING")
        .bind(user_id)
        .execute(&mut **tx)
        .await?;
    Ok(sqlx::query_as("SELECT coins, tokens, xp FROM wallets WHERE user_id = $1 FOR UPDATE")
        .bind(user_id)
        .fetch_one(&mut **tx)
        .await?)
}

/// Coins earned from capped game rewards since 00:00 WIB.
async fn coins_earned_today(
    ex: impl sqlx::PgExecutor<'_>,
    user_id: Uuid,
) -> AppResult<i64> {
    Ok(sqlx::query_scalar(
        r#"SELECT COALESCE(SUM(coins), 0)::BIGINT FROM wallet_ledger
           WHERE user_id = $1 AND counts_to_cap AND coins > 0 AND created_at >= $2"#,
    )
    .bind(user_id)
    .bind(daily::today_start(chrono::Utc::now()))
    .fetch_one(ex)
    .await?)
}

/// Pay a reward into the user's wallet. Call inside the transaction that
/// records the verified result, so the payout can't happen twice.
pub async fn grant(
    tx: &mut Transaction<'_, Postgres>,
    user_id: Uuid,
    reward: Reward,
    reason: &str,
    counts_to_cap: bool,
) -> AppResult<Granted> {
    let w = lock_wallet(tx, user_id).await?;
    let level_before = level_info(w.xp).level;

    let coins = if counts_to_cap {
        apply_daily_cap(reward.coins, coins_earned_today(&mut **tx, user_id).await?)
    } else {
        reward.coins.max(0)
    };
    let tokens = reward.tokens.max(0);
    let xp = reward.xp.max(0);

    if coins != 0 || tokens != 0 || xp != 0 {
        sqlx::query(
            r#"UPDATE wallets SET coins = coins + $2, tokens = tokens + $3, xp = xp + $4,
                   updated_at = now()
               WHERE user_id = $1"#,
        )
        .bind(user_id)
        .bind(coins)
        .bind(tokens)
        .bind(xp)
        .execute(&mut **tx)
        .await?;
        sqlx::query(
            r#"INSERT INTO wallet_ledger (user_id, reason, coins, tokens, xp, counts_to_cap)
               VALUES ($1, $2, $3, $4, $5, $6)"#,
        )
        .bind(user_id)
        .bind(reason)
        .bind(coins)
        .bind(tokens)
        .bind(xp)
        .bind(counts_to_cap)
        .execute(&mut **tx)
        .await?;
    }

    Ok(Granted {
        coins,
        tokens,
        xp,
        coins_capped: reward.coins.max(0) - coins,
        level_before,
        level_after: level_info(w.xp + xp).level,
    })
}

/// Spend coins and/or tokens. Fails without changing anything if the
/// balance is too low.
pub async fn spend(
    tx: &mut Transaction<'_, Postgres>,
    user_id: Uuid,
    coins: i64,
    tokens: i32,
    reason: &str,
) -> AppResult<()> {
    let w = lock_wallet(tx, user_id).await?;
    if coins < 0 || tokens < 0 {
        return Err(AppError::Internal(anyhow::anyhow!("negative spend")));
    }
    if w.coins < coins {
        return Err(AppError::Validation("not enough coins".into()));
    }
    if w.tokens < tokens {
        return Err(AppError::Validation("not enough tokens".into()));
    }
    sqlx::query(
        r#"UPDATE wallets SET coins = coins - $2, tokens = tokens - $3, updated_at = now()
           WHERE user_id = $1"#,
    )
    .bind(user_id)
    .bind(coins)
    .bind(tokens)
    .execute(&mut **tx)
    .await?;
    sqlx::query(
        r#"INSERT INTO wallet_ledger (user_id, reason, coins, tokens) VALUES ($1, $2, $3, $4)"#,
    )
    .bind(user_id)
    .bind(reason)
    .bind(-coins)
    .bind(-tokens)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

#[derive(Serialize)]
pub struct WalletView {
    pub coins: i64,
    pub tokens: i32,
    pub xp: i64,
    #[serde(flatten)]
    pub level: LevelInfo,
    pub coins_today: i64,
    pub daily_cap: i64,
}

pub async fn wallet_view(state: &AppState, user_id: Uuid) -> AppResult<WalletView> {
    let w: Option<WalletRow> =
        sqlx::query_as("SELECT coins, tokens, xp FROM wallets WHERE user_id = $1")
            .bind(user_id)
            .fetch_optional(&state.pool)
            .await?;
    let w = w.unwrap_or(WalletRow { coins: 0, tokens: 0, xp: 0 });
    Ok(WalletView {
        coins: w.coins,
        tokens: w.tokens,
        xp: w.xp,
        level: level_info(w.xp),
        coins_today: coins_earned_today(&state.pool, user_id).await?,
        daily_cap: DAILY_COIN_CAP,
    })
}

/// `GET /api/me/wallet`
pub async fn wallet(State(state): State<AppState>, user: AuthUser) -> AppResult<Json<WalletView>> {
    Ok(Json(wallet_view(&state, user.user_id).await?))
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand::SeedableRng;
    use rand_chacha::ChaCha8Rng;

    #[test]
    fn level_curve_grows() {
        assert_eq!(level_info(0), LevelInfo { level: 1, xp_into_level: 0, xp_for_next: 100 });
        assert_eq!(level_info(99).level, 1);
        assert_eq!(level_info(100), LevelInfo { level: 2, xp_into_level: 0, xp_for_next: 150 });
        assert_eq!(level_info(249).level, 2);
        assert_eq!(level_info(250).level, 3);
        assert_eq!(level_info(-5).level, 1);
        // Each level needs more XP than the last.
        assert!((1..50).all(|l| xp_to_next(l + 1) > xp_to_next(l)));
    }

    #[test]
    fn daily_cap_limits_game_coins() {
        assert_eq!(apply_daily_cap(50, 0), 50);
        assert_eq!(apply_daily_cap(50, DAILY_COIN_CAP - 20), 20);
        assert_eq!(apply_daily_cap(50, DAILY_COIN_CAP), 0);
        assert_eq!(apply_daily_cap(50, DAILY_COIN_CAP + 300), 0);
        assert_eq!(apply_daily_cap(-5, 0), 0);
    }

    #[test]
    fn losing_still_gives_xp_and_harder_gives_more() {
        assert!(game_xp(GameResult::Loss, 1) > 0);
        assert!(game_xp(GameResult::Win, 1) > game_xp(GameResult::Draw, 1));
        assert!(game_xp(GameResult::Draw, 1) > game_xp(GameResult::Loss, 1));
        assert_eq!(game_xp(GameResult::Win, 3), 3 * game_xp(GameResult::Win, 1));
    }

    #[test]
    fn token_drops_follow_the_chance() {
        let mut r = ChaCha8Rng::seed_from_u64(7);
        assert_eq!((0..100).map(|_| roll_token(0.0, &mut r)).sum::<i32>(), 0);
        assert_eq!((0..100).map(|_| roll_token(1.0, &mut r)).sum::<i32>(), 100);
        let hits: i32 = (0..10_000).map(|_| roll_token(0.2, &mut r)).sum();
        assert!((1700..2300).contains(&hits), "{hits}");
    }

    #[test]
    fn rewards_add_up() {
        let a = Reward { coins: 3, tokens: 1, xp: 10 };
        let b = Reward { coins: 2, tokens: 0, xp: 5 };
        assert_eq!(a + b, Reward { coins: 5, tokens: 1, xp: 15 });
        assert!(Reward::default().is_empty());
    }
}
