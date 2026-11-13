use crate::auth::guest::GuestLimiter;
use crate::config::Config;
use sqlx::PgPool;
use std::sync::Arc;

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub config: Arc<Config>,
    /// New guest accounts per IP (in memory).
    pub guests: Arc<GuestLimiter>,
}
