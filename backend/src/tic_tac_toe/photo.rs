//! Private player photo used as a custom Tic-Tac-Toe face.
//!
//! The browser crops and shrinks the picture before uploading, so the server
//! only accepts small JPEG/PNG/WebP files and checks their real file
//! signature (not just what the client claims). Photos are only ever sent
//! back to their owner.

use axum::body::Bytes;
use axum::extract::State;
use axum::http::{header, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};

use crate::auth::jwt::{AuthUser, Member};
use crate::error::{AppError, AppResult};
use crate::state::AppState;

pub const MAX_BYTES: usize = 64 * 1024;

/// Detect the image type from its first bytes.
pub fn sniff(data: &[u8]) -> Option<&'static str> {
    if data.starts_with(&[0xFF, 0xD8, 0xFF]) {
        Some("image/jpeg")
    } else if data.starts_with(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]) {
        Some("image/png")
    } else if data.len() >= 12 && &data[0..4] == b"RIFF" && &data[8..12] == b"WEBP" {
        Some("image/webp")
    } else {
        None
    }
}

pub fn validate(data: &[u8]) -> Result<&'static str, String> {
    if data.is_empty() {
        return Err("empty image".into());
    }
    if data.len() > MAX_BYTES {
        return Err("photo is too big (max 64 KB)".into());
    }
    sniff(data).ok_or_else(|| "only JPEG, PNG or WebP images are allowed".into())
}

/// `PUT /api/me/photo` — raw image bytes in the body.
pub async fn put_photo(State(state): State<AppState>, user: Member, body: Bytes) -> AppResult<StatusCode> {
    let mime = validate(&body).map_err(AppError::Validation)?;
    sqlx::query(
        r#"INSERT INTO user_photos (user_id, mime, data) VALUES ($1, $2, $3)
           ON CONFLICT (user_id) DO UPDATE SET mime = EXCLUDED.mime, data = EXCLUDED.data, updated_at = now()"#,
    )
    .bind(user.user_id)
    .bind(mime)
    .bind(body.as_ref())
    .execute(&state.pool)
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

/// `GET /api/me/photo` — your own photo only.
pub async fn get_photo(State(state): State<AppState>, user: AuthUser) -> AppResult<Response> {
    let (mime, data): (String, Vec<u8>) =
        sqlx::query_as("SELECT mime, data FROM user_photos WHERE user_id = $1")
            .bind(user.user_id)
            .fetch_optional(&state.pool)
            .await?
            .ok_or(AppError::NotFound)?;
    let mut res = data.into_response();
    let h = res.headers_mut();
    h.insert(header::CONTENT_TYPE, HeaderValue::from_str(&mime).unwrap_or(HeaderValue::from_static("image/jpeg")));
    h.insert(header::CACHE_CONTROL, HeaderValue::from_static("private, no-store"));
    h.insert(header::X_CONTENT_TYPE_OPTIONS, HeaderValue::from_static("nosniff"));
    Ok(res)
}

/// `DELETE /api/me/photo`
pub async fn delete_photo(State(state): State<AppState>, user: AuthUser) -> AppResult<StatusCode> {
    sqlx::query("DELETE FROM user_photos WHERE user_id = $1")
        .bind(user.user_id)
        .execute(&state.pool)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_real_images_only() {
        assert_eq!(validate(&[0xFF, 0xD8, 0xFF, 0xE0, 1, 2]), Ok("image/jpeg"));
        let png = [0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 0];
        assert_eq!(validate(&png), Ok("image/png"));
        assert_eq!(validate(b"RIFF\0\0\0\0WEBPVP8 "), Ok("image/webp"));
        assert!(validate(b"<svg onload=alert(1)>").is_err());
        assert!(validate(b"GIF89a....").is_err());
        assert!(validate(&[]).is_err());
    }

    #[test]
    fn rejects_big_files() {
        let mut big = vec![0xFF, 0xD8, 0xFF];
        big.resize(MAX_BYTES + 1, 0);
        assert!(validate(&big).unwrap_err().contains("too big"));
    }
}
