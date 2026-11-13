//! Character + shop HTTP API. Every price, unlock and drop is decided here
//! from the shared catalog; the client only says what it wants.

use axum::extract::{Path, State};
use axum::Json;
use serde::{Deserialize, Serialize};
use sqlx::types::Json as SqlJson;
use sqlx::PgExecutor;
use uuid::Uuid;

use super::catalog::{catalog, Loadout};
use super::shop::{self, BoxResult, MYSTERY_BOX_PRICE, WHEEL_TOKEN_COST};
use crate::auth::jwt::{AuthUser, Member};
use crate::economy::{self, Reward, WalletView};
use crate::error::{AppError, AppResult};
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Player state helpers
// ---------------------------------------------------------------------------

pub(crate) async fn level_of(ex: impl PgExecutor<'_>, user_id: Uuid) -> AppResult<i32> {
    let xp: Option<i64> = sqlx::query_scalar("SELECT xp FROM wallets WHERE user_id = $1")
        .bind(user_id)
        .fetch_optional(ex)
        .await?;
    Ok(economy::level_info(xp.unwrap_or(0)).level)
}

pub(crate) async fn inventory(ex: impl PgExecutor<'_>, user_id: Uuid) -> AppResult<Vec<String>> {
    Ok(sqlx::query_scalar("SELECT item_id FROM user_items WHERE user_id = $1")
        .bind(user_id)
        .fetch_all(ex)
        .await?)
}

pub(crate) async fn stored_loadout(ex: impl PgExecutor<'_>, user_id: Uuid) -> AppResult<Loadout> {
    let l: Option<SqlJson<Loadout>> =
        sqlx::query_scalar("SELECT loadout FROM avatars WHERE user_id = $1")
            .bind(user_id)
            .fetch_optional(ex)
            .await?;
    Ok(l.map(|j| j.0).unwrap_or_default())
}

/// Every item id the player owns (starter + level-reached + inventory).
fn owned_ids(level: i32, inv: &[String]) -> Vec<String> {
    let c = catalog();
    c.items.iter().filter(|i| c.owns(i, level, inv)).map(|i| i.id.clone()).collect()
}

// ---------------------------------------------------------------------------
// GET /api/me/character
// ---------------------------------------------------------------------------

#[derive(Serialize)]
pub struct Preset {
    pub slot_no: i16,
    pub name: String,
    pub loadout: Loadout,
}

#[derive(Serialize)]
pub struct CharacterView {
    pub loadout: Loadout,
    pub owned: Vec<String>,
    pub presets: Vec<Preset>,
    pub wallet: WalletView,
}

async fn character_view(state: &AppState, user_id: Uuid) -> AppResult<CharacterView> {
    let level = level_of(&state.pool, user_id).await?;
    let inv = inventory(&state.pool, user_id).await?;
    let c = catalog();
    let loadout = c.sanitize(&stored_loadout(&state.pool, user_id).await?, level, &inv);
    let rows: Vec<(i16, String, SqlJson<Loadout>)> = sqlx::query_as(
        "SELECT slot_no, name, loadout FROM outfit_presets WHERE user_id = $1 ORDER BY slot_no",
    )
    .bind(user_id)
    .fetch_all(&state.pool)
    .await?;
    let presets = rows
        .into_iter()
        .map(|(slot_no, name, l)| Preset { slot_no, name, loadout: c.sanitize(&l.0, level, &inv) })
        .collect();
    Ok(CharacterView {
        loadout,
        owned: owned_ids(level, &inv),
        presets,
        wallet: economy::wallet_view(state, user_id).await?,
    })
}

pub async fn get_character(
    State(state): State<AppState>,
    user: AuthUser,
) -> AppResult<Json<CharacterView>> {
    Ok(Json(character_view(&state, user.user_id).await?))
}

// ---------------------------------------------------------------------------
// Outfit + presets
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct LoadoutRequest {
    pub loadout: Loadout,
}

async fn validated(state: &AppState, user_id: Uuid, l: &Loadout) -> AppResult<Loadout> {
    let level = level_of(&state.pool, user_id).await?;
    let inv = inventory(&state.pool, user_id).await?;
    catalog().validate_loadout(l, level, &inv).map_err(AppError::Validation)
}

/// `PUT /api/me/character/loadout`
pub async fn put_loadout(
    State(state): State<AppState>,
    user: Member,
    Json(req): Json<LoadoutRequest>,
) -> AppResult<Json<CharacterView>> {
    let l = validated(&state, user.user_id, &req.loadout).await?;
    sqlx::query(
        r#"INSERT INTO avatars (user_id, loadout) VALUES ($1, $2)
           ON CONFLICT (user_id) DO UPDATE SET loadout = EXCLUDED.loadout, updated_at = now()"#,
    )
    .bind(user.user_id)
    .bind(SqlJson(&l))
    .execute(&state.pool)
    .await?;
    Ok(Json(character_view(&state, user.user_id).await?))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PresetRequest {
    pub name: String,
    pub loadout: Loadout,
}

/// `PUT /api/me/character/presets/:slot_no` (1..=3)
pub async fn put_preset(
    State(state): State<AppState>,
    user: Member,
    Path(slot_no): Path<i16>,
    Json(req): Json<PresetRequest>,
) -> AppResult<Json<CharacterView>> {
    if !(1..=3).contains(&slot_no) {
        return Err(AppError::Validation("preset must be 1, 2 or 3".into()));
    }
    let name = req.name.trim();
    if name.is_empty() || name.chars().count() > 24 {
        return Err(AppError::Validation("preset name must be 1-24 characters".into()));
    }
    let l = validated(&state, user.user_id, &req.loadout).await?;
    sqlx::query(
        r#"INSERT INTO outfit_presets (user_id, slot_no, name, loadout) VALUES ($1, $2, $3, $4)
           ON CONFLICT (user_id, slot_no) DO UPDATE
           SET name = EXCLUDED.name, loadout = EXCLUDED.loadout, updated_at = now()"#,
    )
    .bind(user.user_id)
    .bind(slot_no)
    .bind(name)
    .bind(SqlJson(&l))
    .execute(&state.pool)
    .await?;
    Ok(Json(character_view(&state, user.user_id).await?))
}

// ---------------------------------------------------------------------------
// Shop
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BuyRequest {
    pub item_id: String,
}

/// `POST /api/shop/buy` — buy one coin-shop item.
pub async fn buy(
    State(state): State<AppState>,
    user: Member,
    Json(req): Json<BuyRequest>,
) -> AppResult<Json<CharacterView>> {
    let item = catalog()
        .item(&req.item_id)
        .ok_or_else(|| AppError::Validation(format!("unknown item: {}", req.item_id)))?;
    let price = shop::price_of(item)
        .ok_or_else(|| AppError::Validation(format!("{} isn't sold in the shop", item.name)))?;

    let mut tx = state.pool.begin().await?;
    // The primary key makes buying the same item twice impossible.
    let inserted = sqlx::query(
        "INSERT INTO user_items (user_id, item_id, source) VALUES ($1, $2, 'shop') \
         ON CONFLICT DO NOTHING",
    )
    .bind(user.user_id)
    .bind(&item.id)
    .execute(&mut *tx)
    .await?
    .rows_affected();
    if inserted == 0 {
        return Err(AppError::Conflict(format!("you already own {}", item.name)));
    }
    economy::spend(&mut tx, user.user_id, price, 0, &format!("shop:{}", item.id)).await?;
    tx.commit().await?;
    Ok(Json(character_view(&state, user.user_id).await?))
}

#[derive(Serialize)]
pub struct BoxResponse {
    #[serde(flatten)]
    pub result: BoxResult,
    pub character: CharacterView,
}

/// `POST /api/shop/mystery-box` — random coin-shop item; duplicates refund 50%.
pub async fn mystery_box(
    State(state): State<AppState>,
    user: Member,
) -> AppResult<Json<BoxResponse>> {
    let mut tx = state.pool.begin().await?;
    // Quest progress first: the quest day row is always locked before the wallet.
    crate::quests::api::record(&mut tx, user.user_id, &[crate::quests::Event::MysteryBox]).await?;
    economy::spend(&mut tx, user.user_id, MYSTERY_BOX_PRICE, 0, "mystery_box").await?;
    let inv = inventory(&mut *tx, user.user_id).await?;
    let result = shop::open_box(catalog(), &inv, &mut rand::thread_rng());
    if result.duplicate {
        let refund = Reward { coins: result.refund, ..Reward::default() };
        economy::grant(&mut tx, user.user_id, refund, "mystery_box_refund", false).await?;
    } else {
        sqlx::query("INSERT INTO user_items (user_id, item_id, source) VALUES ($1, $2, 'box')")
            .bind(user.user_id)
            .bind(&result.item_id)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    Ok(Json(BoxResponse { result, character: character_view(&state, user.user_id).await? }))
}

#[derive(Serialize)]
pub struct WheelResponse {
    pub rolls: Vec<String>,
    pub won: String,
    pub character: CharacterView,
}

/// `POST /api/shop/wheel` — spend a token on a wheel-exclusive item.
pub async fn wheel(
    State(state): State<AppState>,
    user: Member,
) -> AppResult<Json<WheelResponse>> {
    let mut tx = state.pool.begin().await?;
    economy::spend(&mut tx, user.user_id, 0, WHEEL_TOKEN_COST, "token_wheel").await?;
    let inv = inventory(&mut *tx, user.user_id).await?;
    let res = shop::spin_wheel(catalog(), &inv, &mut rand::thread_rng()).ok_or_else(|| {
        // Returning early drops the transaction, so the token is not spent.
        AppError::Validation("you already own every wheel item. Legend!".into())
    })?;
    sqlx::query("INSERT INTO user_items (user_id, item_id, source) VALUES ($1, $2, 'wheel')")
        .bind(user.user_id)
        .bind(&res.won)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(Json(WheelResponse {
        rolls: res.rolls,
        won: res.won,
        character: character_view(&state, user.user_id).await?,
    }))
}

// ---------------------------------------------------------------------------
// Public profile
// ---------------------------------------------------------------------------

#[derive(Serialize, sqlx::FromRow)]
pub struct GameStat {
    pub game_id: String,
    pub best_score: i32,
    pub plays: i64,
}

#[derive(Serialize)]
pub struct PublicProfile {
    pub username: String,
    pub level: i32,
    pub loadout: Loadout,
    pub joined: chrono::DateTime<chrono::Utc>,
    pub items_owned: usize,
    pub stats: Vec<GameStat>,
    pub achievements: Vec<crate::achievements::PublicAchievement>,
}

/// `GET /api/users/:username/profile` — public. Never includes email,
/// coins or anything private.
pub async fn public_profile(
    State(state): State<AppState>,
    Path(username): Path<String>,
) -> AppResult<Json<PublicProfile>> {
    let (user_id, username, joined): (Uuid, String, chrono::DateTime<chrono::Utc>) =
        sqlx::query_as("SELECT id, username, created_at FROM users WHERE lower(username) = lower($1) AND NOT is_guest")
            .bind(username.trim())
            .fetch_optional(&state.pool)
            .await?
            .ok_or(AppError::NotFound)?;
    let level = level_of(&state.pool, user_id).await?;
    let inv = inventory(&state.pool, user_id).await?;
    let loadout = catalog().sanitize(&stored_loadout(&state.pool, user_id).await?, level, &inv);
    let stats: Vec<GameStat> = sqlx::query_as(
        r#"SELECT game_id, MAX(score) AS best_score, COUNT(*) AS plays
           FROM scores WHERE user_id = $1 GROUP BY game_id ORDER BY game_id"#,
    )
    .bind(user_id)
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(PublicProfile {
        username,
        level,
        loadout,
        joined,
        items_owned: owned_ids(level, &inv).len(),
        stats,
        achievements: crate::achievements::public_list(&state.pool, user_id).await?,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_players_own_only_starters() {
        let c = catalog();
        let owned = owned_ids(1, &[]);
        let starters = c
            .items
            .iter()
            .filter(|i| i.unlock == super::super::catalog::Unlock::Starter)
            .count();
        assert_eq!(owned.len(), starters);
        assert!(owned_ids(30, &[]).len() > owned.len());
    }
}
