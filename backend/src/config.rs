use anyhow::Context;

#[derive(Clone)]
pub struct Config {
    pub database_url: String,
    pub jwt_secret: String,
    pub jwt_expiry_hours: i64,
    pub server_addr: String,
    /// Websites allowed to call the API (comma-separated); "*" = any.
    pub cors_origin: String,
    /// Behind a hosting proxy (Render): take the visitor's IP from
    /// `X-Forwarded-For` instead of the proxy's own address.
    pub trust_proxy: bool,
    pub db_max_connections: u32,
    /// Secret the daily cron job sends (`Authorization: Bearer ...`);
    /// unset = the cleanup endpoint is off.
    pub cron_secret: Option<String>,
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        Ok(Self {
            database_url: std::env::var("DATABASE_URL")
                .context("DATABASE_URL must be set")?,
            jwt_secret: std::env::var("JWT_SECRET")
                .context("JWT_SECRET must be set")?,
            jwt_expiry_hours: std::env::var("JWT_EXPIRY_HOURS")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(24),
            // Hosts like Render give the port in PORT.
            server_addr: std::env::var("SERVER_ADDR").unwrap_or_else(|_| {
                let port = std::env::var("PORT").unwrap_or_else(|_| "8080".to_string());
                format!("0.0.0.0:{port}")
            }),
            cors_origin: std::env::var("CORS_ORIGIN")
                .unwrap_or_else(|_| "http://localhost:5173".to_string()),
            trust_proxy: matches!(
                std::env::var("TRUST_PROXY").as_deref(),
                Ok("1") | Ok("true") | Ok("yes")
            ),
            db_max_connections: std::env::var("DB_MAX_CONNECTIONS")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(10),
            cron_secret: std::env::var("CRON_SECRET").ok().filter(|s| !s.is_empty()),
        })
    }
}

/// The websites allowed to call the API: "*" = any, else a comma-separated
/// list such as "https://zerosignal.vercel.app,http://localhost:5173".
pub fn cors_origins(list: &str) -> tower_http::cors::AllowOrigin {
    use tower_http::cors::AllowOrigin;
    if list.trim() == "*" {
        return AllowOrigin::any();
    }
    let origins: Vec<axum::http::HeaderValue> = parse_origins(list).iter().filter_map(|o| o.parse().ok()).collect();
    AllowOrigin::list(origins)
}

/// "a, b/ ,," -> ["a", "b"] (trailing slashes dropped: browsers send none).
pub fn parse_origins(list: &str) -> Vec<String> {
    list.split(',')
        .map(|o| o.trim().trim_end_matches('/').to_string())
        .filter(|o| !o.is_empty())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn origins_are_trimmed() {
        assert_eq!(
            parse_origins(" https://zerosignal.vercel.app/ ,http://localhost:5173,, "),
            vec!["https://zerosignal.vercel.app", "http://localhost:5173"]
        );
        assert!(parse_origins("").is_empty());
    }
}
