use axum::extract::State;
use axum::http::header::AUTHORIZATION;
use axum::http::HeaderMap;
use axum::Json;
use serde::Serialize;

use crate::auth::jwt::verify_token;
use crate::birds::{self, Ability};
use crate::error::AppResult;
use crate::state::AppState;

#[derive(Serialize)]
pub struct BirdDto {
    pub id: String,
    pub name: String,
    pub color: String,
    pub ability: Ability,
    pub mass: f32,
    pub power: f32,
    pub unlock_score: i32,
    pub description: String,
    pub unlocked: bool,
}

/// Returns the bird catalog. If a valid JWT is present, each bird's `unlocked`
/// flag reflects the user's best score; otherwise only defaults are unlocked.
pub async fn list(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<Json<Vec<BirdDto>>> {
    let best_score = resolve_best_score(&state, &headers).await;

    let out = birds::BIRDS
        .iter()
        .map(|b| BirdDto {
            id: b.id.to_string(),
            name: b.name.to_string(),
            color: b.color.to_string(),
            ability: b.ability,
            mass: b.mass,
            power: b.power,
            unlock_score: b.unlock_score,
            description: b.description.to_string(),
            unlocked: best_score >= b.unlock_score,
        })
        .collect();

    Ok(Json(out))
}

async fn resolve_best_score(state: &AppState, headers: &HeaderMap) -> i32 {
    let Some(token) = headers
        .get(AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|h| h.strip_prefix("Bearer "))
    else {
        return 0;
    };
    let Ok(claims) = verify_token(token, &state.config.jwt_secret) else {
        return 0;
    };
    crate::scores::fetch_best_score(state, crate::games::ANGRY_BIRD, claims.sub)
        .await
        .unwrap_or(0)
}
