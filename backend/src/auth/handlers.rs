use axum::extract::State;
use axum::Json;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::guest::{self, MergeSummary};
use super::jwt::{issue_token, AuthUser};
use super::password::{hash_password, verify_password};
use crate::error::{AppError, AppResult};
use crate::state::AppState;

#[derive(Deserialize)]
pub struct RegisterRequest {
    pub username: String,
    pub email: String,
    pub password: String,
}

#[derive(Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Serialize)]
pub struct AuthResponse {
    pub token: String,
    pub user: UserDto,
    /// Login with a guest token: what moved from the guest into this account.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub merged: Option<MergeSummary>,
    /// Register with a guest token: the guest became this account.
    pub kept_guest_progress: bool,
    /// Logging in cancelled a pending account deletion.
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub deletion_cancelled: bool,
}

#[derive(Serialize, sqlx::FromRow)]
pub struct UserDto {
    pub id: Uuid,
    pub username: String,
    pub email: String,
    pub is_guest: bool,
}

#[derive(sqlx::FromRow)]
struct UserAuthRow {
    id: Uuid,
    username: String,
    email: String,
    password_hash: String,
    delete_requested_at: Option<chrono::DateTime<chrono::Utc>>,
}

pub fn validate_username(name: &str) -> AppResult<()> {
    let n = name.trim().chars().count();
    if n < 3 {
        return Err(AppError::Validation("username must be at least 3 characters".into()));
    }
    if n > 32 {
        return Err(AppError::Validation("username can be at most 32 characters".into()));
    }
    if guest::is_reserved_name(name) {
        return Err(AppError::Validation("usernames can't start with \"guest\"".into()));
    }
    Ok(())
}

pub fn validate_email(email: &str) -> AppResult<()> {
    let e = email.trim();
    if !e.contains('@') || e.len() < 3 || e.len() > 255 {
        return Err(AppError::Validation("invalid email".into()));
    }
    Ok(())
}

pub fn validate_password(password: &str) -> AppResult<()> {
    if password.len() < 8 {
        return Err(AppError::Validation("password must be at least 8 characters".into()));
    }
    Ok(())
}

fn validate_register(req: &RegisterRequest) -> AppResult<()> {
    validate_username(&req.username)?;
    validate_email(&req.email)?;
    validate_password(&req.password)
}

fn member_token(state: &AppState, user: &UserDto) -> AppResult<String> {
    issue_token(
        user.id,
        &user.username,
        false,
        &state.config.jwt_secret,
        state.config.jwt_expiry_hours,
    )
    .map_err(AppError::Internal)
}

fn taken(e: sqlx::Error) -> AppError {
    match &e {
        sqlx::Error::Database(db) if db.is_unique_violation() => {
            AppError::Conflict("username or email already taken".into())
        }
        _ => AppError::Database(e),
    }
}

/// `POST /api/auth/register`. With a guest token, the guest account becomes
/// the new account, so everything played as a guest is kept.
pub async fn register(
    State(state): State<AppState>,
    current: Option<AuthUser>,
    Json(req): Json<RegisterRequest>,
) -> AppResult<Json<AuthResponse>> {
    validate_register(&req)?;

    let password_hash = hash_password(&req.password)?;

    let mut upgraded: Option<UserDto> = None;
    if let Some(g) = current.filter(|u| u.is_guest) {
        upgraded = sqlx::query_as(
            r#"UPDATE users SET username = $2, email = $3, password_hash = $4,
                   is_guest = FALSE, last_seen_at = now()
               WHERE id = $1 AND is_guest
               RETURNING id, username, email, is_guest"#,
        )
        .bind(g.user_id)
        .bind(req.username.trim())
        .bind(req.email.trim())
        .bind(&password_hash)
        .fetch_optional(&state.pool)
        .await
        .map_err(taken)?;
    }
    let kept_guest_progress = upgraded.is_some();

    let user = match upgraded {
        Some(u) => u,
        None => sqlx::query_as(
            r#"INSERT INTO users (username, email, password_hash)
               VALUES ($1, $2, $3)
               RETURNING id, username, email, is_guest"#,
        )
        .bind(req.username.trim())
        .bind(req.email.trim())
        .bind(&password_hash)
        .fetch_one(&state.pool)
        .await
        .map_err(taken)?,
    };

    let token = member_token(&state, &user)?;
    Ok(Json(AuthResponse { token, user, merged: None, kept_guest_progress, deletion_cancelled: false }))
}

/// `POST /api/auth/login`. With a guest token, the guest's results move
/// into the account and the guest is deleted.
pub async fn login(
    State(state): State<AppState>,
    current: Option<AuthUser>,
    Json(req): Json<LoginRequest>,
) -> AppResult<Json<AuthResponse>> {
    let row: UserAuthRow = sqlx::query_as(
        r#"SELECT id, username, email, password_hash, delete_requested_at
           FROM users WHERE lower(username) = lower($1) AND NOT is_guest"#,
    )
    .bind(req.username.trim())
    .fetch_optional(&state.pool)
    .await?
    .ok_or(AppError::Unauthorized)?;

    if !verify_password(&req.password, &row.password_hash)? {
        return Err(AppError::Unauthorized);
    }

    // Logging in during the grace period cancels a deletion.
    let deletion_cancelled = row.delete_requested_at.is_some();
    if deletion_cancelled {
        sqlx::query("UPDATE users SET delete_requested_at = NULL WHERE id = $1")
            .bind(row.id)
            .execute(&state.pool)
            .await?;
    }

    let mut merged = None;
    if let Some(g) = current.filter(|u| u.is_guest) {
        let mut tx = state.pool.begin().await?;
        merged = guest::merge_into(&mut tx, g.user_id, row.id).await?;
        tx.commit().await?;
    }

    let user = UserDto { id: row.id, username: row.username, email: row.email, is_guest: false };
    let token = member_token(&state, &user)?;
    Ok(Json(AuthResponse { token, user, merged, kept_guest_progress: false, deletion_cancelled }))
}

#[derive(Serialize)]
pub struct MeResponse {
    #[serde(flatten)]
    pub user: UserDto,
    /// Guests get a fresh token on every visit, so active guests never expire.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token: Option<String>,
}

pub async fn me(
    State(state): State<AppState>,
    user: AuthUser,
) -> AppResult<Json<MeResponse>> {
    let dto: UserDto = sqlx::query_as(
        r#"UPDATE users SET last_seen_at = now() WHERE id = $1 AND delete_requested_at IS NULL
           RETURNING id, username, email, is_guest"#,
    )
    .bind(user.user_id)
    .fetch_optional(&state.pool)
    .await?
    // Missing, or waiting to be deleted: signed out everywhere.
    .ok_or(AppError::Unauthorized)?;

    let token = if dto.is_guest { Some(guest::guest_token(&state, &dto)?) } else { None };
    Ok(Json(MeResponse { user: dto, token }))
}
