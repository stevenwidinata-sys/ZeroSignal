//! Settings saved on the account (so they follow you to every device) and
//! privacy choices. Registered players only; guests keep settings locally.

use axum::extract::State;
use axum::Json;
use serde::{Deserialize, Serialize};

use super::jwt::Member;
use crate::error::{AppError, AppResult};
use crate::state::AppState;

/// Settings are a small JSON object; refuse anything bigger than this.
pub const MAX_SETTINGS_BYTES: usize = 8 * 1024;

#[derive(Serialize, Deserialize, Clone, Copy, sqlx::FromRow)]
pub struct Privacy {
    pub hide_on_leaderboards: bool,
    pub private_profile: bool,
}

#[derive(Serialize)]
pub struct PrefsView {
    /// What the browser saved last; null = never synced.
    pub settings: Option<serde_json::Value>,
    pub privacy: Privacy,
}

/// The settings blob must be a small JSON object.
pub fn check_settings(v: &serde_json::Value) -> AppResult<()> {
    if !v.is_object() {
        return Err(AppError::Validation("settings must be an object".into()));
    }
    if v.to_string().len() > MAX_SETTINGS_BYTES {
        return Err(AppError::Validation("settings are too large".into()));
    }
    Ok(())
}

async fn view(state: &AppState, user_id: uuid::Uuid) -> AppResult<PrefsView> {
    let (settings, hide_on_leaderboards, private_profile): (Option<serde_json::Value>, bool, bool) =
        sqlx::query_as("SELECT settings, hide_on_leaderboards, private_profile FROM users WHERE id = $1")
            .bind(user_id)
            .fetch_optional(&state.pool)
            .await?
            .ok_or(AppError::NotFound)?;
    Ok(PrefsView { settings, privacy: Privacy { hide_on_leaderboards, private_profile } })
}

/// `GET /api/me/settings`
pub async fn get_prefs(State(state): State<AppState>, user: Member) -> AppResult<Json<PrefsView>> {
    Ok(Json(view(&state, user.user_id).await?))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SettingsRequest {
    pub settings: serde_json::Value,
}

/// `PUT /api/me/settings`: replace the saved settings.
pub async fn put_settings(
    State(state): State<AppState>,
    user: Member,
    Json(req): Json<SettingsRequest>,
) -> AppResult<Json<PrefsView>> {
    check_settings(&req.settings)?;
    sqlx::query("UPDATE users SET settings = $2 WHERE id = $1")
        .bind(user.user_id)
        .bind(&req.settings)
        .execute(&state.pool)
        .await?;
    Ok(Json(view(&state, user.user_id).await?))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PrivacyRequest {
    pub hide_on_leaderboards: Option<bool>,
    pub private_profile: Option<bool>,
}

/// `PUT /api/me/privacy`: change one or both privacy switches.
pub async fn put_privacy(
    State(state): State<AppState>,
    user: Member,
    Json(req): Json<PrivacyRequest>,
) -> AppResult<Json<PrefsView>> {
    sqlx::query(
        r#"UPDATE users SET hide_on_leaderboards = COALESCE($2, hide_on_leaderboards),
                            private_profile = COALESCE($3, private_profile)
           WHERE id = $1"#,
    )
    .bind(user.user_id)
    .bind(req.hide_on_leaderboards)
    .bind(req.private_profile)
    .execute(&state.pool)
    .await?;
    Ok(Json(view(&state, user.user_id).await?))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn settings_must_be_a_small_object() {
        assert!(check_settings(&json!({ "sound": true, "volume": 0.6 })).is_ok());
        assert!(check_settings(&json!([1, 2])).is_err());
        assert!(check_settings(&json!("x")).is_err());
        let big = "x".repeat(MAX_SETTINGS_BYTES);
        assert!(check_settings(&json!({ "junk": big })).is_err());
    }
}
