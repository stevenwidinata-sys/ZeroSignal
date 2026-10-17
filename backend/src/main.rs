mod auth;
mod birds;
mod birds_api;
mod config;
mod connect_four;
mod db;
mod error;
mod games;
mod physics;
mod scores;
mod state;

use axum::routing::{get, post};
use axum::Router;
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;

use crate::config::Config;
use crate::state::AppState;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();

    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info".into()),
        )
        .init();

    let config = Config::from_env()?;
    let pool = db::connect(&config.database_url).await?;
    db::run_migrations(&pool).await?;
    tracing::info!("migrations applied");

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let state = AppState {
        pool,
        config: Arc::new(config.clone()),
    };

    let app = Router::new()
        .route("/health", get(health))
        .route("/api/auth/register", post(auth::handlers::register))
        .route("/api/auth/login", post(auth::handlers::login))
        .route("/api/me", get(auth::handlers::me))
        // Platform: game catalog + per-game leaderboards/history.
        .route("/api/games", get(games::list))
        .route("/api/games/:game_id/leaderboard", get(scores::leaderboard))
        .route("/api/games/:game_id/scores/me", get(scores::my_scores))
        // Per-game authoritative score submission.
        .route("/api/games/angry-bird/scores", post(scores::submit_angry_bird))
        .route("/api/games/angry-bird/birds", get(birds_api::list))
        // Legacy aliases (Angry Bird) for older clients.
        .route("/api/scores", post(scores::submit_angry_bird))
        .route("/api/scores/leaderboard", get(scores::legacy_leaderboard))
        .route("/api/scores/me", get(scores::legacy_my_scores))
        .route("/api/birds", get(birds_api::list))
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(&config.server_addr).await?;
    tracing::info!("listening on {}", config.server_addr);
    axum::serve(listener, app).await?;
    Ok(())
}

async fn health() -> &'static str {
    "ok"
}
