//! Account settings for registered players: change password, email and
//! username, and delete the account (7-day grace period).

use axum::extract::State;
use axum::Json;
use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::handlers::{validate_email, validate_password, validate_username, UserDto};
use super::jwt::{issue_token, Member};
use super::password::{hash_password, verify_password};
use crate::error::{AppError, AppResult};
use crate::state::AppState;

/// One free rename per this many days.
pub const RENAME_DAYS: i64 = 30;
/// A deleted account can be restored by logging in for this many days.
pub const DELETE_GRACE_DAYS: i64 = 7;

/// When the next rename is allowed (None = now).
pub fn next_rename(changed_at: Option<DateTime<Utc>>, now: DateTime<Utc>) -> Option<DateTime<Utc>> {
    changed_at.map(|t| t + Duration::days(RENAME_DAYS)).filter(|next| *next > now)
}

#[derive(Serialize)]
pub struct AccountView {
    pub username: String,
    pub email: String,
    pub joined: DateTime<Utc>,
    /// When the next rename is allowed; null = you can rename now.
    pub next_rename_at: Option<DateTime<Utc>>,
}

#[derive(sqlx::FromRow)]
struct AccountRow {
    username: String,
    email: String,
    created_at: DateTime<Utc>,
    password_hash: String,
    username_changed_at: Option<DateTime<Utc>>,
}

async fn load(state: &AppState, user_id: Uuid) -> AppResult<AccountRow> {
    sqlx::query_as(
        "SELECT username, email, created_at, password_hash, username_changed_at FROM users WHERE id = $1",
    )
    .bind(user_id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or(AppError::NotFound)
}

/// Check the current password (for sensitive changes).
fn check_password(row: &AccountRow, password: &str) -> AppResult<()> {
    if verify_password(password, &row.password_hash)? {
        Ok(())
    } else {
        Err(AppError::Validation("your current password is wrong".into()))
    }
}

fn view(row: &AccountRow) -> AccountView {
    AccountView {
        username: row.username.clone(),
        email: row.email.clone(),
        joined: row.created_at,
        next_rename_at: next_rename(row.username_changed_at, Utc::now()),
    }
}

/// `GET /api/me/account`
pub async fn get_account(State(state): State<AppState>, user: Member) -> AppResult<Json<AccountView>> {
    Ok(Json(view(&load(&state, user.user_id).await?)))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PasswordRequest {
    pub current_password: String,
    pub new_password: String,
}

/// `PUT /api/me/password`
pub async fn change_password(
    State(state): State<AppState>,
    user: Member,
    Json(req): Json<PasswordRequest>,
) -> AppResult<Json<AccountView>> {
    let row = load(&state, user.user_id).await?;
    check_password(&row, &req.current_password)?;
    validate_password(&req.new_password)?;
    sqlx::query("UPDATE users SET password_hash = $2 WHERE id = $1")
        .bind(user.user_id)
        .bind(hash_password(&req.new_password)?)
        .execute(&state.pool)
        .await?;
    Ok(Json(view(&row)))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct EmailRequest {
    pub current_password: String,
    pub email: String,
}

/// `PUT /api/me/email`
pub async fn change_email(
    State(state): State<AppState>,
    user: Member,
    Json(req): Json<EmailRequest>,
) -> AppResult<Json<AccountView>> {
    let row = load(&state, user.user_id).await?;
    check_password(&row, &req.current_password)?;
    validate_email(&req.email)?;
    sqlx::query("UPDATE users SET email = $2 WHERE id = $1")
        .bind(user.user_id)
        .bind(req.email.trim())
        .execute(&state.pool)
        .await
        .map_err(|e| unique(e, "that email is already used by another account"))?;
    Ok(Json(view(&load(&state, user.user_id).await?)))
}

fn unique(e: sqlx::Error, msg: &str) -> AppError {
    match &e {
        sqlx::Error::Database(db) if db.is_unique_violation() => AppError::Conflict(msg.into()),
        _ => AppError::Database(e),
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UsernameRequest {
    pub username: String,
}

#[derive(Serialize)]
pub struct RenameResponse {
    /// New token: it carries the new name.
    pub token: String,
    pub user: UserDto,
    pub account: AccountView,
}

/// `PUT /api/me/username`: free, once every 30 days.
pub async fn change_username(
    State(state): State<AppState>,
    user: Member,
    Json(req): Json<UsernameRequest>,
) -> AppResult<Json<RenameResponse>> {
    validate_username(&req.username)?;
    let row = load(&state, user.user_id).await?;
    if row.username == req.username.trim() {
        return Err(AppError::Validation("that's already your username".into()));
    }
    if let Some(next) = next_rename(row.username_changed_at, Utc::now()) {
        return Err(AppError::Conflict(format!(
            "you can change your username again on {}",
            next.format("%Y-%m-%d")
        )));
    }
    let dto: UserDto = sqlx::query_as(
        r#"UPDATE users SET username = $2, username_changed_at = now() WHERE id = $1
           RETURNING id, username, email, is_guest"#,
    )
    .bind(user.user_id)
    .bind(req.username.trim())
    .fetch_one(&state.pool)
    .await
    .map_err(|e| unique(e, "that username is taken"))?;
    let token = issue_token(dto.id, &dto.username, false, &state.config.jwt_secret, state.config.jwt_expiry_hours)
        .map_err(AppError::Internal)?;
    let account = view(&load(&state, user.user_id).await?);
    Ok(Json(RenameResponse { token, user: dto, account }))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DeleteRequest {
    pub current_password: String,
    /// Must match the username, as a typed confirmation.
    pub confirm_username: String,
}

#[derive(Serialize)]
pub struct DeleteResponse {
    /// The account is really deleted after this moment.
    pub delete_at: DateTime<Utc>,
}

/// `POST /api/me/delete`: lock and hide the account now, delete it in 7 days.
pub async fn request_delete(
    State(state): State<AppState>,
    user: Member,
    Json(req): Json<DeleteRequest>,
) -> AppResult<Json<DeleteResponse>> {
    let row = load(&state, user.user_id).await?;
    if req.confirm_username.trim() != row.username {
        return Err(AppError::Validation("type your username exactly to confirm".into()));
    }
    check_password(&row, &req.current_password)?;
    let at: DateTime<Utc> = sqlx::query_scalar(
        "UPDATE users SET delete_requested_at = now() WHERE id = $1 RETURNING delete_requested_at",
    )
    .bind(user.user_id)
    .fetch_one(&state.pool)
    .await?;
    Ok(Json(DeleteResponse { delete_at: at + Duration::days(DELETE_GRACE_DAYS) }))
}

/// Delete accounts whose grace period is over. Returns how many.
pub async fn purge_deleted(pool: &sqlx::PgPool) -> AppResult<u64> {
    Ok(sqlx::query(
        "DELETE FROM users WHERE delete_requested_at < now() - make_interval(days => $1)",
    )
    .bind(DELETE_GRACE_DAYS as i32)
    .execute(pool)
    .await?
    .rows_affected())
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    #[test]
    fn renames_wait_30_days() {
        let now = Utc.with_ymd_and_hms(2026, 11, 13, 12, 0, 0).unwrap();
        assert_eq!(next_rename(None, now), None);
        let recent = now - Duration::days(3);
        assert_eq!(next_rename(Some(recent), now), Some(recent + Duration::days(30)));
        assert_eq!(next_rename(Some(now - Duration::days(30)), now), None);
    }
}
