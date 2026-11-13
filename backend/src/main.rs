mod achievements;
mod auth;
mod birds;
mod birds_api;
mod character;
mod config;
mod connect_four;
mod daily;
mod daily_login;
mod db;
mod economy;
mod error;
mod game_2048;
mod games;
mod minefield;
mod physics;
mod quests;
mod scores;
mod state;
mod stats;
mod tic_tac_toe;
mod weekly;
mod whack_a_mole;

use axum::routing::{get, post, put};
use axum::Router;
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;

use crate::config::Config;
use crate::connect_four::api as cf;
use crate::state::AppState;
use crate::tic_tac_toe::api as ttt;

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

    // Delete guests nobody has used for 30 days (now, then daily).
    auth::guest::spawn_cleanup(pool.clone());

    let state = AppState {
        pool,
        config: Arc::new(config.clone()),
        guests: Arc::new(auth::guest::GuestLimiter::default()),
    };

    let app = Router::new()
        .route("/health", get(health))
        .route("/api/auth/register", post(auth::handlers::register))
        .route("/api/auth/login", post(auth::handlers::login))
        .route("/api/auth/guest", post(auth::guest::create))
        .route("/api/me", get(auth::handlers::me))
        .route("/api/me/wallet", get(economy::wallet))
        .route("/api/me/stats", get(stats::my_stats))
        // Weekly prizes for last week's top 3 on each board.
        .route("/api/me/weekly-prizes", get(weekly::list))
        .route("/api/me/weekly-prizes/claim", post(weekly::claim))
        // Daily login streak reward.
        .route("/api/me/daily-login", get(daily_login::status))
        .route("/api/me/daily-login/claim", post(daily_login::claim))
        // Daily quests.
        .route("/api/me/quests", get(quests::api::get_quests))
        .route("/api/me/quests/:slot/claim", post(quests::api::claim))
        .route("/api/me/quests/:slot/reroll", post(quests::api::reroll))
        // Achievements (claim pays coins + XP + a title).
        .route("/api/me/achievements", get(achievements::list))
        .route("/api/me/achievements/:id/claim", post(achievements::claim))
        // Character, outfits, shop and public profiles.
        .route("/api/me/character", get(character::api::get_character))
        .route("/api/me/character/loadout", put(character::api::put_loadout))
        .route("/api/me/character/presets/:slot_no", put(character::api::put_preset))
        .route("/api/shop/buy", post(character::api::buy))
        .route("/api/shop/mystery-box", post(character::api::mystery_box))
        .route("/api/shop/wheel", post(character::api::wheel))
        .route("/api/users/:username/profile", get(character::api::public_profile))
        // Tic-Tac-Toe: server-run AI matches, boards/faces, private photo face.
        .route("/api/games/tic-tac-toe/matches", post(ttt::create_match))
        .route("/api/games/tic-tac-toe/matches/active", get(ttt::active_match))
        .route("/api/games/tic-tac-toe/matches/:id/move", post(ttt::play_move))
        .route("/api/games/tic-tac-toe/matches/:id/undo", post(ttt::undo_move))
        .route("/api/games/tic-tac-toe/matches/:id/next", post(ttt::next_game))
        .route("/api/games/tic-tac-toe/matches/:id/forfeit", post(ttt::forfeit_match))
        .route("/api/games/tic-tac-toe/collection", get(ttt::get_collection))
        .route("/api/games/tic-tac-toe/buy", post(ttt::buy))
        .route("/api/games/tic-tac-toe/spins", post(ttt::spin))
        .route(
            "/api/me/photo",
            get(tic_tac_toe::photo::get_photo)
                .put(tic_tac_toe::photo::put_photo)
                .delete(tic_tac_toe::photo::delete_photo),
        )
        // Platform: game catalog + per-game leaderboards/history.
        .route("/api/games", get(games::list))
        .route("/api/games/:game_id/leaderboard", get(scores::leaderboard))
        .route("/api/games/:game_id/scores/me", get(scores::my_scores))
        // Per-game authoritative score submission.
        .route("/api/games/angry-bird/scores", post(scores::submit_angry_bird))
        .route("/api/games/angry-bird/birds", get(birds_api::list))
        // Connect Four: server-authoritative AI matches + skins.
        .route("/api/games/connect-four/matches", post(cf::create_match))
        .route("/api/games/connect-four/matches/active", get(cf::active_match))
        .route("/api/games/connect-four/matches/:id/move", post(cf::play_move))
        .route("/api/games/connect-four/matches/:id/undo", post(cf::undo_move))
        .route("/api/games/connect-four/matches/:id/next", post(cf::next_game))
        .route("/api/games/connect-four/matches/:id/forfeit", post(cf::forfeit_match))
        // Whack-a-Mole: seeded runs, scored by replaying the taps.
        .route("/api/games/whack-a-mole/runs", post(whack_a_mole::api::start))
        .route("/api/games/whack-a-mole/runs/:id/finish", post(whack_a_mole::api::finish))
        .route("/api/games/whack-a-mole/collection", get(whack_a_mole::api::collection))
        .route("/api/games/whack-a-mole/buy", post(whack_a_mole::api::buy))
        // Minefield: the server holds the mines and opens cells for you.
        .route("/api/games/minefield/games", post(minefield::api::create))
        .route("/api/games/minefield/games/active", get(minefield::api::active))
        .route("/api/games/minefield/games/:id/reveal", post(minefield::api::reveal))
        .route("/api/games/minefield/games/:id/chord", post(minefield::api::chord))
        .route("/api/games/minefield/games/:id/hint", post(minefield::api::hint))
        .route("/api/games/minefield/games/:id/forfeit", post(minefield::api::forfeit))
        // 2048: seeded runs, saved as you play, scored by replaying the moves.
        .route("/api/games/2048/runs", post(game_2048::api::start))
        .route("/api/games/2048/runs/active", get(game_2048::api::active))
        .route("/api/games/2048/runs/:id/save", post(game_2048::api::save))
        .route("/api/games/2048/runs/:id/finish", post(game_2048::api::finish))
        .route("/api/games/connect-four/skins", get(cf::list_skins))
        .route("/api/games/connect-four/spins", post(cf::spin))
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
    // Connect info gives the client's IP to the guest rate limit.
    axum::serve(listener, app.into_make_service_with_connect_info::<std::net::SocketAddr>()).await?;
    Ok(())
}

async fn health() -> &'static str {
    "ok"
}
