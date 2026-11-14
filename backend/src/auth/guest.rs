//! Guest play: a quiet, temporary account for people who haven't registered.
//!
//! - `POST /api/auth/guest` creates one (rate-limited per IP).
//! - Registering with a guest token turns the guest into the real account.
//! - Logging in with a guest token moves the guest's results into that
//!   account (`merge_into`) and deletes the guest.
//! - Guests not seen for `KEEP_DAYS` days are deleted (`cleanup`).

use std::collections::{HashMap, VecDeque};
use std::net::{IpAddr, SocketAddr};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use axum::extract::{ConnectInfo, State};
use axum::Json;
use chrono::NaiveDate;
use serde::Serialize;
use sqlx::{Postgres, Transaction};
use uuid::Uuid;

use super::handlers::{AuthResponse, UserDto};
use super::jwt::issue_token;
use crate::economy::{self, Reward};
use crate::error::{AppError, AppResult};
use crate::state::AppState;

/// Guests not seen for this many days are deleted.
pub const KEEP_DAYS: i64 = 30;
/// A guest token lasts this long (it's refreshed on every visit).
pub const TOKEN_HOURS: i64 = KEEP_DAYS * 24;
/// New guests allowed per IP address per hour.
pub const GUESTS_PER_HOUR: usize = 20;

// ---------------------------------------------------------------------------
// Rate limit
// ---------------------------------------------------------------------------

/// Sliding-window counter of guest creations per IP address.
#[derive(Default)]
pub struct GuestLimiter {
    hits: Mutex<HashMap<IpAddr, VecDeque<Instant>>>,
}

impl GuestLimiter {
    /// Count one creation; false if this IP already made `limit` in `window`.
    pub fn allow(&self, ip: IpAddr, now: Instant, limit: usize, window: Duration) -> bool {
        let mut hits = self.hits.lock().unwrap_or_else(|e| e.into_inner());
        // Forget IPs that have been quiet for a whole window.
        hits.retain(|_, q| q.back().is_some_and(|t| now.duration_since(*t) < window));
        let q = hits.entry(ip).or_default();
        while q.front().is_some_and(|t| now.duration_since(*t) >= window) {
            q.pop_front();
        }
        if q.len() >= limit {
            return false;
        }
        q.push_back(now);
        true
    }
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

/// The visitor's IP. Behind a trusted proxy it's the first address in
/// `X-Forwarded-For` (the proxy adds the real client there); otherwise the
/// connection's own address, so the header can't be faked.
pub fn client_ip(peer: IpAddr, forwarded: Option<&str>, trust_proxy: bool) -> IpAddr {
    if !trust_proxy {
        return peer;
    }
    forwarded
        .and_then(|f| f.split(',').next())
        .and_then(|first| first.trim().parse().ok())
        .unwrap_or(peer)
}

/// Usernames starting with this are reserved for guests.
pub const GUEST_PREFIX: &str = "guest";

pub fn is_reserved_name(name: &str) -> bool {
    name.trim().to_lowercase().starts_with(GUEST_PREFIX)
}

/// `POST /api/auth/guest`: start playing without an account.
pub async fn create(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: axum::http::HeaderMap,
) -> AppResult<Json<AuthResponse>> {
    let forwarded = headers.get("x-forwarded-for").and_then(|v| v.to_str().ok());
    let ip = client_ip(addr.ip(), forwarded, state.config.trust_proxy);
    if !state.guests.allow(ip, Instant::now(), GUESTS_PER_HOUR, Duration::from_secs(3600)) {
        return Err(AppError::Validation("too many guest sessions from your network. Try again later or register.".into()));
    }
    let id = Uuid::new_v4();
    let username = format!("{GUEST_PREFIX}-{}", &id.simple().to_string()[..10]);
    // Placeholder email (`.invalid` never resolves) and a hash no password matches.
    let user: UserDto = sqlx::query_as(
        r#"INSERT INTO users (id, username, email, password_hash, is_guest)
           VALUES ($1, $2, $3, '!', TRUE)
           RETURNING id, username, email, is_guest"#,
    )
    .bind(id)
    .bind(&username)
    .bind(format!("{id}@guest.invalid"))
    .fetch_one(&state.pool)
    .await?;
    let token = guest_token(&state, &user)?;
    Ok(Json(AuthResponse { token, user, merged: None, kept_guest_progress: false, deletion_cancelled: false }))
}

pub fn guest_token(state: &AppState, user: &UserDto) -> AppResult<String> {
    issue_token(user.id, &user.username, true, &state.config.jwt_secret, TOKEN_HOURS).map_err(AppError::Internal)
}

// ---------------------------------------------------------------------------
// Merge into an existing account
// ---------------------------------------------------------------------------

/// What moved from the guest into the account.
#[derive(Debug, Default, Serialize)]
pub struct MergeSummary {
    pub scores: i64,
    pub games: i64,
    pub items: i64,
    pub coins: i64,
    /// Guest coins that didn't fit under today's daily cap.
    pub coins_capped: i64,
    pub tokens: i32,
    pub xp: i64,
}

/// Unfinished-game condition per table (the account keeps its own).
const ACTIVE: [(&str, &str); 4] = [
    ("cf_matches", "status = 'active'"),
    ("ttt_matches", "status = 'active'"),
    ("mf_games", "status IN ('new', 'playing')"),
    ("g2048_runs", "finished_at IS NULL"),
];
/// Game history tables moved as a whole.
const GAME_TABLES: [&str; 5] = ["cf_matches", "ttt_matches", "wam_runs", "mf_games", "g2048_runs"];
/// Owned items: (table, item key). The account keeps its own copy.
const ITEM_TABLES: [(&str, &str); 4] =
    [("user_skins", "skin_id"), ("ttt_items", "item_key"), ("wam_items", "item_key"), ("user_items", "item_id")];
/// Games whose score rows hold a running total.
const TOTAL_GAMES: [&str; 2] = ["connect-four", "tic-tac-toe"];

/// Move a guest's results into `account` and delete the guest. Returns None
/// when `guest` isn't (or is no longer) a guest. Call inside a transaction.
pub async fn merge_into(
    tx: &mut Transaction<'_, Postgres>,
    guest: Uuid,
    account: Uuid,
) -> AppResult<Option<MergeSummary>> {
    if guest == account {
        return Ok(None);
    }
    let is_guest: Option<bool> = sqlx::query_scalar("SELECT is_guest FROM users WHERE id = $1 FOR UPDATE")
        .bind(guest)
        .fetch_optional(&mut **tx)
        .await?;
    if is_guest != Some(true) {
        return Ok(None);
    }
    let mut sum = MergeSummary::default();

    // 1. One unfinished game of each kind, and one Daily per day: the account's wins.
    for (table, cond) in ACTIVE {
        sqlx::query(&format!(
            "DELETE FROM {table} WHERE user_id = $1 AND {cond} AND EXISTS (SELECT 1 FROM {table} a WHERE a.user_id = $2 AND {cond})"
        ))
        .bind(guest)
        .bind(account)
        .execute(&mut **tx)
        .await?;
    }
    for (table, cond) in [("mf_games", "difficulty = 'daily'"), ("g2048_runs", "mode = 'daily'")] {
        sqlx::query(&format!(
            "DELETE FROM {table} WHERE user_id = $1 AND {cond} AND day IN (SELECT day FROM {table} WHERE user_id = $2 AND {cond})"
        ))
        .bind(guest)
        .bind(account)
        .execute(&mut **tx)
        .await?;
    }

    // 2. Scores and game history.
    sum.scores = move_rows(tx, "scores", guest, account).await?;
    for table in GAME_TABLES {
        sum.games += move_rows(tx, table, guest, account).await?;
    }
    for table in ["cf_spins", "ttt_spins"] {
        move_rows(tx, table, guest, account).await?;
    }

    // 3. Items the account doesn't own yet.
    for (table, key) in ITEM_TABLES {
        sum.items += sqlx::query(&format!(
            r#"UPDATE {table} g SET user_id = $2 WHERE g.user_id = $1
               AND NOT EXISTS (SELECT 1 FROM {table} a WHERE a.user_id = $2 AND a.{key} = g.{key})"#
        ))
        .bind(guest)
        .bind(account)
        .execute(&mut **tx)
        .await?
        .rows_affected() as i64;
    }

    // 4. Quest days the account doesn't have (e.g. the guest's earlier days).
    let days: Vec<NaiveDate> = sqlx::query_scalar(
        r#"INSERT INTO daily_quest_days (user_id, day, rerolled, bonus_claimed)
           SELECT $2, g.day, g.rerolled, g.bonus_claimed FROM daily_quest_days g
           WHERE g.user_id = $1
             AND NOT EXISTS (SELECT 1 FROM daily_quest_days a WHERE a.user_id = $2 AND a.day = g.day)
           RETURNING day"#,
    )
    .bind(guest)
    .bind(account)
    .fetch_all(&mut **tx)
    .await?;
    sqlx::query(
        r#"INSERT INTO daily_quests (user_id, day, slot, quest_id, progress, target, claimed_at)
           SELECT $2, day, slot, quest_id, progress, target, claimed_at FROM daily_quests
           WHERE user_id = $1 AND day = ANY($3)"#,
    )
    .bind(guest)
    .bind(account)
    .bind(&days)
    .execute(&mut **tx)
    .await?;

    // 5. Running totals: rebuild them from each row's `gained`, in order.
    sqlx::query(
        r#"UPDATE scores s SET score = t.total
           FROM (SELECT id, SUM(COALESCE(gained, 0)) OVER (PARTITION BY game_id ORDER BY created_at, id)::INT AS total
                 FROM scores WHERE user_id = $1 AND game_id = ANY($2)) t
           WHERE s.id = t.id"#,
    )
    .bind(account)
    .bind(&TOTAL_GAMES[..])
    .execute(&mut **tx)
    .await?;

    // 6. Wallet: paid like any reward, so coins count toward today's cap.
    let wallet: Option<(i64, i32, i64)> =
        sqlx::query_as("SELECT coins, tokens, xp FROM wallets WHERE user_id = $1")
            .bind(guest)
            .fetch_optional(&mut **tx)
            .await?;
    if let Some((coins, tokens, xp)) = wallet {
        let g = economy::grant(tx, account, Reward { coins, tokens, xp }, "guest_merge", true).await?;
        sum.coins = g.coins;
        sum.coins_capped = g.coins_capped;
        sum.tokens = g.tokens;
        sum.xp = g.xp;
    }

    // 7. Everything else (ledger, quests, the wallet) goes with the guest.
    sqlx::query("DELETE FROM users WHERE id = $1 AND is_guest")
        .bind(guest)
        .execute(&mut **tx)
        .await?;
    Ok(Some(sum))
}

async fn move_rows(tx: &mut Transaction<'_, Postgres>, table: &str, from: Uuid, to: Uuid) -> AppResult<i64> {
    Ok(sqlx::query(&format!("UPDATE {table} SET user_id = $2 WHERE user_id = $1"))
        .bind(from)
        .bind(to)
        .execute(&mut **tx)
        .await?
        .rows_affected() as i64)
}

// ---------------------------------------------------------------------------
// Clean-up
// ---------------------------------------------------------------------------

/// Delete guests not seen for `KEEP_DAYS` days. Returns how many.
pub async fn cleanup(pool: &sqlx::PgPool) -> AppResult<u64> {
    Ok(sqlx::query("DELETE FROM users WHERE is_guest AND last_seen_at < now() - make_interval(days => $1)")
        .bind(KEEP_DAYS as i32)
        .execute(pool)
        .await?
        .rows_affected())
}

/// Delete old guests and accounts whose grace period is over.
pub async fn housekeeping(pool: &sqlx::PgPool) -> AppResult<(u64, u64)> {
    let guests = cleanup(pool).await?;
    let accounts = super::account::purge_deleted(pool).await?;
    if guests + accounts > 0 {
        tracing::info!("housekeeping: deleted {guests} old guests, {accounts} accounts after their grace period");
    }
    Ok((guests, accounts))
}

/// Run `housekeeping` now and then once a day, while the server keeps
/// running. Hosts that stop idle servers (Vercel) also call
/// `/api/internal/cleanup` from a daily cron job.
pub fn spawn_cleanup(pool: sqlx::PgPool) {
    tokio::spawn(async move {
        loop {
            if let Err(e) = housekeeping(&pool).await {
                tracing::warn!("housekeeping failed: {e}");
            }
            tokio::time::sleep(Duration::from_secs(24 * 3600)).await;
        }
    });
}

#[derive(Serialize)]
pub struct CleanupView {
    pub guests_deleted: u64,
    pub accounts_deleted: u64,
}

/// True when the request carries `Authorization: Bearer <secret>`.
pub fn cron_authorized(header: Option<&str>, secret: Option<&str>) -> bool {
    match (header, secret) {
        (Some(h), Some(s)) if !s.is_empty() => h.strip_prefix("Bearer ").is_some_and(|t| t == s),
        _ => false,
    }
}

/// `GET /api/internal/cleanup`: the daily cron job (Vercel sends
/// `Authorization: Bearer $CRON_SECRET`). Not found without the secret.
pub async fn cron_cleanup(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
) -> AppResult<Json<CleanupView>> {
    let auth = headers.get(axum::http::header::AUTHORIZATION).and_then(|v| v.to_str().ok());
    if !cron_authorized(auth, state.config.cron_secret.as_deref()) {
        return Err(AppError::NotFound);
    }
    let (guests_deleted, accounts_deleted) = housekeeping(&state.pool).await?;
    Ok(Json(CleanupView { guests_deleted, accounts_deleted }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn limiter_allows_up_to_the_limit_per_ip_and_window() {
        let l = GuestLimiter::default();
        let a: IpAddr = "10.0.0.1".parse().unwrap();
        let b: IpAddr = "10.0.0.2".parse().unwrap();
        let t0 = Instant::now();
        let hour = Duration::from_secs(3600);
        for _ in 0..3 {
            assert!(l.allow(a, t0, 3, hour));
        }
        assert!(!l.allow(a, t0, 3, hour));
        assert!(l.allow(b, t0, 3, hour), "other IPs are not affected");
        assert!(l.allow(a, t0 + hour, 3, hour), "the window slides");
    }

    #[test]
    fn client_ip_trusts_the_proxy_header_only_when_told() {
        let peer: IpAddr = "10.0.0.9".parse().unwrap();
        let fwd = Some("203.0.113.7, 10.0.0.1");
        assert_eq!(client_ip(peer, fwd, true), "203.0.113.7".parse::<IpAddr>().unwrap());
        assert_eq!(client_ip(peer, fwd, false), peer);
        assert_eq!(client_ip(peer, None, true), peer);
        assert_eq!(client_ip(peer, Some("junk"), true), peer);
    }

    #[test]
    fn cron_needs_the_exact_secret() {
        assert!(cron_authorized(Some("Bearer s3cret"), Some("s3cret")));
        assert!(!cron_authorized(Some("Bearer wrong"), Some("s3cret")));
        assert!(!cron_authorized(Some("s3cret"), Some("s3cret")));
        assert!(!cron_authorized(None, Some("s3cret")));
        assert!(!cron_authorized(Some("Bearer "), Some("")), "no secret set = disabled");
        assert!(!cron_authorized(Some("Bearer x"), None));
    }

    #[test]
    fn guest_names_are_reserved() {
        assert!(is_reserved_name("guest-12ab"));
        assert!(is_reserved_name("  GuestStar"));
        assert!(!is_reserved_name("steven"));
        assert!(!is_reserved_name("myguest"));
    }
}
