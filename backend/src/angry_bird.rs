//! Angry Bird campaign: level progress, unlocks, stars and the campaign
//! score (best score of every level added up), all worked out from the
//! server-verified rows in `scores` (a cleared round has `detail = 'clear'`).

use axum::extract::State;
use axum::Json;
use serde::Serialize;
use uuid::Uuid;

use crate::auth::jwt::AuthUser;
use crate::error::AppResult;
use crate::games::ANGRY_BIRD;
use crate::physics::level::{self, all_meta, stars_for};
use crate::state::AppState;

/// Extra XP the first time a level is cleared.
pub const FIRST_CLEAR_XP: i64 = 50;
/// `scores.detail` of a round that destroyed every pig.
pub const CLEAR: &str = "clear";

#[derive(Debug, Clone, Copy, sqlx::FromRow)]
pub struct LevelBest {
    pub level: i32,
    pub best: i32,
    /// Best score among rounds that cleared the level (0 = never cleared).
    pub best_clear: i32,
    pub cleared: bool,
}

/// Best scores per level for one player.
pub async fn level_bests(ex: impl sqlx::PgExecutor<'_>, user_id: Uuid) -> AppResult<Vec<LevelBest>> {
    Ok(sqlx::query_as(
        r#"SELECT level, MAX(score) AS best,
                  COALESCE(MAX(score) FILTER (WHERE detail = 'clear'), 0) AS best_clear,
                  COALESCE(BOOL_OR(detail = 'clear'), FALSE) AS cleared
           FROM scores WHERE user_id = $1 AND game_id = $2
           GROUP BY level"#,
    )
    .bind(user_id)
    .bind(ANGRY_BIRD)
    .fetch_all(ex)
    .await?)
}

/// Summary of a player's campaign.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct Campaign {
    /// Best score of every level added up (unlocks birds).
    pub score: i64,
    pub levels_cleared: i64,
    pub three_star_levels: i64,
    pub unlocked_up_to: i32,
}

pub fn campaign(bests: &[LevelBest]) -> Campaign {
    let cleared: Vec<i32> = bests.iter().filter(|b| b.cleared).map(|b| b.level).collect();
    let three = bests
        .iter()
        .filter(|b| level::meta(b.level).is_some_and(|m| stars_for(m, b.best_clear, b.cleared) == 3))
        .count() as i64;
    Campaign {
        score: bests.iter().map(|b| i64::from(b.best.max(0))).sum(),
        levels_cleared: cleared.len() as i64,
        three_star_levels: three,
        unlocked_up_to: level::unlocked_up_to(&cleared),
    }
}

#[derive(Serialize)]
pub struct LevelView {
    pub id: i32,
    pub world: i32,
    pub name: String,
    /// Scores needed for 1, 2 and 3 stars.
    pub stars_at: [i32; 3],
    pub best: i32,
    pub cleared: bool,
    pub stars: u8,
    pub unlocked: bool,
}

#[derive(Serialize)]
pub struct ProgressView {
    pub campaign_score: i64,
    pub levels_cleared: i64,
    pub unlocked_up_to: i32,
    pub levels: Vec<LevelView>,
}

/// `GET /api/games/angry-bird/levels`: every level with your best and stars.
pub async fn progress(State(state): State<AppState>, user: AuthUser) -> AppResult<Json<ProgressView>> {
    let bests = level_bests(&state.pool, user.user_id).await?;
    let c = campaign(&bests);
    let levels = all_meta()
        .iter()
        .map(|m| {
            let b = bests.iter().find(|b| b.level == m.id);
            let (best, best_clear, cleared) = b.map_or((0, 0, false), |b| (b.best, b.best_clear, b.cleared));
            LevelView {
                id: m.id,
                world: m.world,
                name: m.name.clone(),
                stars_at: m.stars,
                best,
                cleared,
                stars: stars_for(m, best_clear, cleared),
                unlocked: m.id <= c.unlocked_up_to,
            }
        })
        .collect();
    Ok(Json(ProgressView { campaign_score: c.score, levels_cleared: c.levels_cleared, unlocked_up_to: c.unlocked_up_to, levels }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn lb(level: i32, best: i32, best_clear: i32) -> LevelBest {
        LevelBest { level, best, best_clear, cleared: best_clear > 0 }
    }

    #[test]
    fn campaign_adds_best_scores_and_counts_stars() {
        assert_eq!(campaign(&[]), Campaign { score: 0, levels_cleared: 0, three_star_levels: 0, unlocked_up_to: 1 });
        let three = level::meta(1).unwrap().stars[2];
        let c = campaign(&[lb(1, three, three), lb(2, 2_500, 0), lb(3, 3_100, 3_100)]);
        assert_eq!(c.score, i64::from(three) + 2_500 + 3_100);
        assert_eq!(c.levels_cleared, 2);
        assert_eq!(c.three_star_levels, 1);
        // Level 2 not cleared: 3 is cleared but out of order, so 2 is the top.
        assert_eq!(c.unlocked_up_to, 2);
    }
}
