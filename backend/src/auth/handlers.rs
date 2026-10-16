use axum::extract::State;
use axum::Json;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

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
}

#[derive(Serialize, sqlx::FromRow)]
pub struct UserDto {
    pub id: Uuid,
    pub username: String,
    pub email: String,
}

#[derive(sqlx::FromRow)]
struct UserAuthRow {
    id: Uuid,
    username: String,
    email: String,
    password_hash: String,
}

fn validate_register(req: &RegisterRequest) -> AppResult<()> {
    if req.username.trim().len() < 3 {
        return Err(AppError::Validation(
            "username must be at least 3 characters".into(),
        ));
    }
    if !req.email.contains('@') || req.email.len() < 3 {
        return Err(AppError::Validation("invalid email".into()));
    }
    if req.password.len() < 8 {
        return Err(AppError::Validation(
            "password must be at least 8 characters".into(),
        ));
    }
    Ok(())
}

pub async fn register(
    State(state): State<AppState>,
    Json(req): Json<RegisterRequest>,
) -> AppResult<Json<AuthResponse>> {
    validate_register(&req)?;

    let password_hash = hash_password(&req.password)?;

    let user: UserDto = sqlx::query_as(
        r#"INSERT INTO users (username, email, password_hash)
           VALUES ($1, $2, $3)
           RETURNING id, username, email"#,
    )
    .bind(req.username.trim())
    .bind(req.email.trim())
    .bind(&password_hash)
    .fetch_one(&state.pool)
    .await
    .map_err(|e| match &e {
        sqlx::Error::Database(db) if db.is_unique_violation() => {
            AppError::Conflict("username or email already taken".into())
        }
        _ => AppError::Database(e),
    })?;

    let token = issue_token(
        user.id,
        &user.username,
        &state.config.jwt_secret,
        state.config.jwt_expiry_hours,
    )
    .map_err(AppError::Internal)?;

    Ok(Json(AuthResponse { token, user }))
}

pub async fn login(
    State(state): State<AppState>,
    Json(req): Json<LoginRequest>,
) -> AppResult<Json<AuthResponse>> {
    let row: UserAuthRow = sqlx::query_as(
        r#"SELECT id, username, email, password_hash
           FROM users WHERE lower(username) = lower($1)"#,
    )
    .bind(req.username.trim())
    .fetch_optional(&state.pool)
    .await?
    .ok_or(AppError::Unauthorized)?;

    if !verify_password(&req.password, &row.password_hash)? {
        return Err(AppError::Unauthorized);
    }

    let token = issue_token(
        row.id,
        &row.username,
        &state.config.jwt_secret,
        state.config.jwt_expiry_hours,
    )
    .map_err(AppError::Internal)?;

    Ok(Json(AuthResponse {
        token,
        user: UserDto {
            id: row.id,
            username: row.username,
            email: row.email,
        },
    }))
}

pub async fn me(
    State(state): State<AppState>,
    user: AuthUser,
) -> AppResult<Json<UserDto>> {
    let dto: UserDto = sqlx::query_as(
        r#"SELECT id, username, email FROM users WHERE id = $1"#,
    )
    .bind(user.user_id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or(AppError::NotFound)?;

    Ok(Json(dto))
}
