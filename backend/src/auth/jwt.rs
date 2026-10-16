use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use chrono::{Duration, Utc};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::AppError;
use crate::state::AppState;

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: Uuid,       // user id
    pub username: String,
    pub exp: usize,      // expiry (unix seconds)
    pub iat: usize,      // issued at
}

pub fn issue_token(
    user_id: Uuid,
    username: &str,
    secret: &str,
    expiry_hours: i64,
) -> anyhow::Result<String> {
    let now = Utc::now();
    let exp = (now + Duration::hours(expiry_hours)).timestamp() as usize;
    let claims = Claims {
        sub: user_id,
        username: username.to_string(),
        exp,
        iat: now.timestamp() as usize,
    };
    let token = encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )?;
    Ok(token)
}

pub fn verify_token(token: &str, secret: &str) -> Result<Claims, AppError> {
    decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &Validation::default(),
    )
    .map(|data| data.claims)
    .map_err(|_| AppError::Unauthorized)
}

/// Authenticated user extracted from the `Authorization: Bearer` header.
pub struct AuthUser {
    pub user_id: Uuid,
    pub username: String,
}

#[async_trait::async_trait]
impl FromRequestParts<AppState> for AuthUser {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let header = parts
            .headers
            .get(axum::http::header::AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .ok_or(AppError::Unauthorized)?;

        let token = header
            .strip_prefix("Bearer ")
            .ok_or(AppError::Unauthorized)?;

        let claims = verify_token(token, &state.config.jwt_secret)?;
        Ok(AuthUser {
            user_id: claims.sub,
            username: claims.username,
        })
    }
}
