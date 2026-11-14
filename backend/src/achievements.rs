//! Achievements: 38 one-time goals. Progress is computed live from data the
//! server already verified (matches, scores, ledger, inventory), so older
//! progress counts too. Claiming pays coins + the same XP once, plus a title.

use axum::extract::{Path, State};
use axum::Json;
use chrono::{DateTime, Utc};
use serde::Serialize;
use uuid::Uuid;

use crate::auth::jwt::{AuthUser, Member};
use crate::birds;
use crate::character::api::{inventory, level_of, stored_loadout};
use crate::character::catalog::{catalog, Unlock};
use crate::connect_four::skins::SKINS;
use crate::economy::{self, Granted, Reward};
use crate::error::{AppError, AppResult};
use crate::state::AppState;
use crate::tic_tac_toe::items::items as ttt_items;

/// Everything achievements look at, gathered from the database.
#[derive(Debug, Default, Clone)]
pub struct Stats {
    /// Connect Four series won at Medium-or-harder, Hard-or-harder, Impossible.
    pub cf_wins: i64,
    pub cf_wins_medium: i64,
    pub cf_wins_hard: i64,
    pub cf_wins_impossible: i64,
    /// Best-of-5 Connect Four series won 3–0.
    pub cf_sweeps: i64,
    pub cf_skins_owned: i64,
    pub cf_skins_total: i64,
    pub ttt_wins: i64,
    pub ttt_hard_draws: i64,
    pub ttt_items_owned: i64,
    pub ttt_items_total: i64,
    pub has_photo: bool,
    pub ab_rounds: i64,
    pub ab_best: i64,
    pub level: i64,
    pub wheel_spins: i64,
    pub boxes_opened: i64,
    /// Non-starter items in the current outfit.
    pub worn_special: i64,
    /// Owned items that aren't part of the free starter set.
    pub owned_special: i64,
    pub coins_spent: i64,
    pub best_login_day: i64,
    pub quests_claimed: i64,
    pub quest_full_days: i64,
    pub wam_rounds: i64,
    pub wam_best: i64,
    pub wam_fever: bool,
    /// Longest Survival round, ms.
    pub wam_survival_ms: i64,
    pub wam_bosses: i64,
    pub mf_wins: i64,
    pub mf_expert_wins: i64,
    /// Fastest Beginner win, ms (0 = none).
    pub mf_best_beginner_ms: i64,
    pub mf_daily_wins: i64,
    /// Finished 2048 games, biggest tile ever, and 2048 reached without undo.
    pub g2048_games: i64,
    pub g2048_best_tile: i64,
    pub g2048_pure: bool,
}

pub struct Achievement {
    pub id: &'static str,
    pub name: &'static str,
    pub description: &'static str,
    pub coins: i64,
    /// Character title item granted on claim.
    pub title: &'static str,
    pub target: i64,
    measure: fn(&Stats) -> i64,
}

impl Achievement {
    pub fn progress(&self, s: &Stats) -> i64 {
        (self.measure)(s).clamp(0, self.target)
    }

    pub fn reward(&self) -> Reward {
        Reward { coins: self.coins, tokens: 0, xp: self.coins }
    }
}

fn all_birds_score() -> i64 {
    birds::BIRDS.iter().map(|b| b.unlock_score as i64).max().unwrap_or(0)
}

macro_rules! ach {
    ($id:literal, $name:literal, $desc:literal, $coins:literal, $title:literal, $target:expr, $m:expr) => {
        Achievement { id: $id, name: $name, description: $desc, coins: $coins, title: $title, target: $target, measure: $m }
    };
}

pub static ACHIEVEMENTS: [Achievement; 38] = [
    ach!("cf_first_win", "First Drop", "Win your first Connect Four series", 30, "title-chip-dropper", 1, |s| s.cf_wins),
    ach!("cf_medium", "Thinking Ahead", "Win a Connect Four series vs Medium or harder", 40, "title-four-thinker", 1, |s| s.cf_wins_medium),
    ach!("cf_hard", "Hard Hitter", "Win a Connect Four series vs Hard or harder", 80, "title-grid-breaker", 1, |s| s.cf_wins_hard),
    ach!("cf_impossible", "Beat Impossible", "Win a Connect Four series vs Impossible", 300, "title-the-impossible", 1, |s| s.cf_wins_impossible),
    ach!("cf_sweep", "Clean Sweep", "Win a best-of-5 Connect Four series 3–0", 100, "title-flawless", 1, |s| s.cf_sweeps),
    ach!("cf_all_skins", "Skin Collector", "Own every Connect Four skin", 200, "title-collector", 1,
        |s| i64::from(s.cf_skins_total > 0 && s.cf_skins_owned >= s.cf_skins_total)),
    ach!("ttt_first_win", "Three in a Row", "Win your first Tic-Tac-Toe series", 30, "title-x-marks-it", 1, |s| s.ttt_wins),
    ach!("ttt_survive_hard", "Survive Hard", "Draw a whole Hard Tic-Tac-Toe series", 100, "title-unbreakable", 1, |s| s.ttt_hard_draws),
    ach!("ttt_all_items", "Board Collector", "Own every Tic-Tac-Toe board and face", 200, "title-board-baron", 1,
        |s| i64::from(s.ttt_items_total > 0 && s.ttt_items_owned >= s.ttt_items_total)),
    ach!("photo_face", "Say Cheese", "Add a photo face", 20, "title-say-cheese", 1, |s| i64::from(s.has_photo)),
    ach!("ab_first_round", "First Flight", "Finish your first Angry Bird round", 20, "title-fledgling", 1, |s| s.ab_rounds),
    ach!("ab_10000", "Big Score", "Score 10,000 in one Angry Bird round", 80, "title-sharpshooter", 10_000, |s| s.ab_best),
    ach!("ab_25000", "Pig Slayer", "Score 25,000 in one Angry Bird round", 200, "title-pig-slayer", 25_000, |s| s.ab_best),
    ach!("ab_all_birds", "Full Flock", "Unlock every bird", 150, "title-flock-leader", 1,
        |s| i64::from(s.ab_best >= all_birds_score())),
    ach!("level_5", "Level 5", "Reach level 5", 50, "title-rising-star", 5, |s| s.level),
    ach!("level_10", "Level 10", "Reach level 10", 150, "title-veteran", 10, |s| s.level),
    ach!("level_25", "Level 25", "Reach level 25", 400, "title-living-legend", 25, |s| s.level),
    ach!("wheel_spin", "Feeling Lucky", "Spin the token wheel", 30, "title-wheel-spinner", 1, |s| s.wheel_spins),
    ach!("boxes_10", "Box Fan", "Open 10 mystery boxes", 100, "title-box-hunter", 10, |s| s.boxes_opened),
    ach!("dress_10", "Dressed Up", "Wear 10 non-starter items at once", 30, "title-stylish", 10, |s| s.worn_special),
    ach!("own_50", "Wardrobe", "Own 50 items beyond the starter set", 150, "title-fashion-icon", 50, |s| s.owned_special),
    ach!("spend_5000", "Big Spender", "Spend 5,000 coins in total", 150, "title-high-roller", 5_000, |s| s.coins_spent),
    ach!("login_7", "Week Streak", "Reach a 7-day login streak", 100, "title-loyal", 7, |s| s.best_login_day),
    ach!("quests_10", "Quest Starter", "Claim 10 daily quests", 60, "title-adventurer", 10, |s| s.quests_claimed),
    ach!("wam_first_round", "First Bonk", "Finish your first Whack-a-Mole round", 20, "title-first-bonk", 1, |s| s.wam_rounds),
    ach!("wam_fever", "Fever Pitch", "Reach FEVER (10 hits in a row) in Whack-a-Mole", 80, "title-fever-pitch", 1,
        |s| i64::from(s.wam_fever)),
    ach!("wam_10000", "Mole Master", "Score 10,000 in one Whack-a-Mole round", 150, "title-mole-master", 10_000, |s| s.wam_best),
    ach!("wam_survivor", "Survivor", "Last 2 minutes in Whack-a-Mole Survival", 150, "title-survivor", 120,
        |s| s.wam_survival_ms / 1_000),
    ach!("wam_boss", "Boss Breaker", "Knock out a boss mole in Whack-a-Mole", 100, "title-boss-breaker", 1, |s| s.wam_bosses),
    ach!("mf_first_win", "First Sweep", "Clear your first Minefield board", 20, "title-first-sweep", 1, |s| s.mf_wins),
    ach!("mf_expert", "Expert Sweeper", "Clear an Expert Minefield board", 150, "title-expert-sweeper", 1, |s| s.mf_expert_wins),
    ach!("mf_speed", "Speed Sweeper", "Clear a Beginner Minefield board in under 20 seconds", 80, "title-speed-sweeper", 1,
        |s| i64::from(s.mf_best_beginner_ms > 0 && s.mf_best_beginner_ms < 20_000)),
    ach!("mf_daily_5", "Daily Devotee", "Clear 5 Daily Minefield boards", 100, "title-daily-devotee", 5, |s| s.mf_daily_wins),
    ach!("g2048_first", "First Slide", "Finish your first game of 2048", 20, "title-first-slide", 1, |s| s.g2048_games),
    ach!("g2048_2048", "2048!", "Make a 2048 tile", 150, "title-2048", 1, |s| i64::from(s.g2048_best_tile >= 2048)),
    ach!("g2048_4096", "Tile Tycoon", "Make a 4096 tile", 300, "title-tile-tycoon", 1, |s| i64::from(s.g2048_best_tile >= 4096)),
    ach!("g2048_pure", "Pure Skill", "Make a 2048 tile without using undo", 200, "title-pure-skill", 1, |s| i64::from(s.g2048_pure)),
    ach!("quest_days_7", "Quest Master", "Finish all 3 daily quests in one day, 7 times", 200, "title-quest-master", 7, |s| s.quest_full_days),
];

pub fn find(id: &str) -> Option<&'static Achievement> {
    ACHIEVEMENTS.iter().find(|a| a.id == id)
}

// ---------------------------------------------------------------------------
// Stats from the database
// ---------------------------------------------------------------------------

async fn count(pool: &sqlx::PgPool, sql: &str, user_id: Uuid) -> AppResult<i64> {
    Ok(sqlx::query_scalar::<_, Option<i64>>(sql).bind(user_id).fetch_one(pool).await?.unwrap_or(0))
}

pub async fn load_stats(pool: &sqlx::PgPool, user_id: Uuid) -> AppResult<Stats> {
    let cf: (i64, i64, i64, i64, i64) = sqlx::query_as(
        r#"SELECT COUNT(*),
                  COUNT(*) FILTER (WHERE difficulty IN ('medium', 'hard', 'impossible')),
                  COUNT(*) FILTER (WHERE difficulty IN ('hard', 'impossible')),
                  COUNT(*) FILTER (WHERE difficulty = 'impossible'),
                  COUNT(*) FILTER (WHERE best_of = 5 AND ai_wins = 0)
           FROM cf_matches WHERE user_id = $1 AND status = 'won'"#,
    )
    .bind(user_id)
    .fetch_one(pool)
    .await?;
    let ttt: (i64, i64) = sqlx::query_as(
        r#"SELECT COUNT(*) FILTER (WHERE status = 'won'),
                  COUNT(*) FILTER (WHERE status = 'drawn' AND difficulty = 'hard')
           FROM ttt_matches WHERE user_id = $1"#,
    )
    .bind(user_id)
    .fetch_one(pool)
    .await?;
    let ab: (i64, Option<i32>) = sqlx::query_as(
        "SELECT COUNT(*), MAX(score) FROM scores WHERE user_id = $1 AND game_id = 'angry-bird'",
    )
    .bind(user_id)
    .fetch_one(pool)
    .await?;
    let ledger: (i64, i64, Option<i64>) = sqlx::query_as(
        r#"SELECT COUNT(*) FILTER (WHERE reason = 'token_wheel'),
                  COUNT(*) FILTER (WHERE reason = 'mystery_box'),
                  SUM(-coins) FILTER (WHERE coins < 0)::BIGINT
           FROM wallet_ledger WHERE user_id = $1"#,
    )
    .bind(user_id)
    .fetch_one(pool)
    .await?;

    let wam: (i64, Option<i32>, Option<bool>, Option<i32>, Option<i64>) = sqlx::query_as(
        r#"SELECT COUNT(*), MAX(score), BOOL_OR(fever),
                  MAX(ended_ms) FILTER (WHERE mode = 'survival'),
                  SUM(bosses_beaten)::BIGINT
           FROM wam_runs WHERE user_id = $1 AND finished_at IS NOT NULL"#,
    )
    .bind(user_id)
    .fetch_one(pool)
    .await?;

    let mf: (i64, i64, Option<i32>, i64) = sqlx::query_as(
        r#"SELECT COUNT(*),
                  COUNT(*) FILTER (WHERE difficulty = 'expert'),
                  MIN(time_ms) FILTER (WHERE difficulty = 'beginner'),
                  COUNT(*) FILTER (WHERE difficulty = 'daily')
           FROM mf_games WHERE user_id = $1 AND status = 'won'"#,
    )
    .bind(user_id)
    .fetch_one(pool)
    .await?;

    let g2048: (i64, Option<i32>, Option<bool>) = sqlx::query_as(
        r#"SELECT COUNT(*), MAX(max_tile), BOOL_OR(max_tile >= 2048 AND undos_used = 0)
           FROM g2048_runs WHERE user_id = $1 AND finished_at IS NOT NULL AND NOT abandoned"#,
    )
    .bind(user_id)
    .fetch_one(pool)
    .await?;

    let free_skins = SKINS.iter().filter(|s| s.free).count() as i64;
    let paid_skins = count(
        pool,
        "SELECT COUNT(DISTINCT skin_id) FROM user_skins WHERE user_id = $1",
        user_id,
    )
    .await?;
    let t = ttt_items();
    let ttt_free = t.all().filter(|i| i.free()).count() as i64;
    let ttt_paid =
        count(pool, "SELECT COUNT(DISTINCT item_key) FROM ttt_items WHERE user_id = $1", user_id).await?;

    let level = level_of(pool, user_id).await?;
    let inv = inventory(pool, user_id).await?;
    let c = catalog();
    let loadout = c.sanitize(&stored_loadout(pool, user_id).await?, level, &inv);
    let special = |id: &str| c.item(id).is_some_and(|i| i.unlock != Unlock::Starter);
    let worn_special = loadout.values().filter(|id| special(id)).count() as i64;
    let owned_special =
        c.items.iter().filter(|i| i.unlock != Unlock::Starter && c.owns(i, level, &inv)).count() as i64;

    Ok(Stats {
        cf_wins: cf.0,
        cf_wins_medium: cf.1,
        cf_wins_hard: cf.2,
        cf_wins_impossible: cf.3,
        cf_sweeps: cf.4,
        cf_skins_owned: free_skins + paid_skins,
        cf_skins_total: SKINS.len() as i64,
        ttt_wins: ttt.0,
        ttt_hard_draws: ttt.1,
        ttt_items_owned: ttt_free + ttt_paid,
        ttt_items_total: t.all().count() as i64,
        has_photo: count(pool, "SELECT COUNT(*) FROM user_photos WHERE user_id = $1", user_id).await? > 0,
        ab_rounds: ab.0,
        ab_best: ab.1.unwrap_or(0) as i64,
        level: level as i64,
        wheel_spins: ledger.0,
        boxes_opened: ledger.1,
        worn_special,
        owned_special,
        coins_spent: ledger.2.unwrap_or(0),
        best_login_day: count(
            pool,
            "SELECT MAX(streak_day)::BIGINT FROM login_claims WHERE user_id = $1",
            user_id,
        )
        .await?,
        quests_claimed: count(
            pool,
            "SELECT COUNT(*) FROM daily_quests WHERE user_id = $1 AND claimed_at IS NOT NULL",
            user_id,
        )
        .await?,
        quest_full_days: count(
            pool,
            "SELECT COUNT(*) FROM daily_quest_days WHERE user_id = $1 AND bonus_claimed",
            user_id,
        )
        .await?,
        wam_rounds: wam.0,
        wam_best: wam.1.unwrap_or(0) as i64,
        wam_fever: wam.2.unwrap_or(false),
        wam_survival_ms: wam.3.unwrap_or(0) as i64,
        wam_bosses: wam.4.unwrap_or(0),
        mf_wins: mf.0,
        mf_expert_wins: mf.1,
        mf_best_beginner_ms: mf.2.unwrap_or(0) as i64,
        mf_daily_wins: mf.3,
        g2048_games: g2048.0,
        g2048_best_tile: g2048.1.unwrap_or(0) as i64,
        g2048_pure: g2048.2.unwrap_or(false),
    })
}

async fn claimed(pool: &sqlx::PgPool, user_id: Uuid) -> AppResult<Vec<(String, DateTime<Utc>)>> {
    Ok(sqlx::query_as(
        "SELECT achievement_id, claimed_at FROM user_achievements WHERE user_id = $1 ORDER BY claimed_at",
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?)
}

// ---------------------------------------------------------------------------
// Views + handlers
// ---------------------------------------------------------------------------

#[derive(Serialize)]
pub struct AchievementView {
    pub id: &'static str,
    pub name: &'static str,
    pub description: &'static str,
    pub coins: i64,
    pub xp: i64,
    /// Title item id (look it up in the shared character catalog).
    pub title: &'static str,
    pub progress: i64,
    pub target: i64,
    pub unlocked: bool,
    pub claimed_at: Option<DateTime<Utc>>,
}

#[derive(Serialize)]
pub struct AchievementsView {
    pub achievements: Vec<AchievementView>,
    /// Unlocked but not claimed yet (nav badge).
    pub ready: usize,
    pub claimed: usize,
}

pub fn build_view(stats: &Stats, claimed: &[(String, DateTime<Utc>)]) -> AchievementsView {
    let achievements: Vec<AchievementView> = ACHIEVEMENTS
        .iter()
        .map(|a| {
            let progress = a.progress(stats);
            let claimed_at = claimed.iter().find(|(id, _)| id == a.id).map(|(_, t)| *t);
            AchievementView {
                id: a.id,
                name: a.name,
                description: a.description,
                coins: a.coins,
                xp: a.reward().xp,
                title: a.title,
                // A claimed achievement stays complete even if, e.g., items were spent.
                progress: if claimed_at.is_some() { a.target } else { progress },
                target: a.target,
                unlocked: claimed_at.is_some() || progress >= a.target,
                claimed_at,
            }
        })
        .collect();
    AchievementsView {
        ready: achievements.iter().filter(|a| a.unlocked && a.claimed_at.is_none()).count(),
        claimed: achievements.iter().filter(|a| a.claimed_at.is_some()).count(),
        achievements,
    }
}

async fn view_for(state: &AppState, user_id: Uuid) -> AppResult<AchievementsView> {
    let stats = load_stats(&state.pool, user_id).await?;
    Ok(build_view(&stats, &claimed(&state.pool, user_id).await?))
}

/// `GET /api/me/achievements`
pub async fn list(State(state): State<AppState>, user: AuthUser) -> AppResult<Json<AchievementsView>> {
    Ok(Json(view_for(&state, user.user_id).await?))
}

#[derive(Serialize)]
pub struct ClaimResponse {
    pub achievements: AchievementsView,
    pub granted: Granted,
    /// Title item now owned.
    pub title: &'static str,
}

/// `POST /api/me/achievements/:id/claim` - pays coins + XP once and grants
/// the title. Achievement coins don't count toward the daily cap.
pub async fn claim(
    State(state): State<AppState>,
    user: Member,
    Path(id): Path<String>,
) -> AppResult<Json<ClaimResponse>> {
    let a = find(&id).ok_or(AppError::NotFound)?;
    let stats = load_stats(&state.pool, user.user_id).await?;
    if a.progress(&stats) < a.target {
        return Err(AppError::Validation("achievement not unlocked yet".into()));
    }
    let mut tx = state.pool.begin().await?;
    // The primary key stops a second claim, even from parallel requests.
    let inserted = sqlx::query(
        "INSERT INTO user_achievements (user_id, achievement_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    )
    .bind(user.user_id)
    .bind(a.id)
    .execute(&mut *tx)
    .await?
    .rows_affected();
    if inserted != 1 {
        return Err(AppError::Validation("achievement already claimed".into()));
    }
    sqlx::query(
        "INSERT INTO user_items (user_id, item_id, source) VALUES ($1, $2, 'achievement') ON CONFLICT DO NOTHING",
    )
    .bind(user.user_id)
    .bind(a.title)
    .execute(&mut *tx)
    .await?;
    let granted =
        economy::grant(&mut tx, user.user_id, a.reward(), &format!("achievement:{}", a.id), false).await?;
    tx.commit().await?;
    Ok(Json(ClaimResponse {
        achievements: view_for(&state, user.user_id).await?,
        granted,
        title: a.title,
    }))
}

/// Claimed achievements for public profiles (no progress, nothing private).
#[derive(Serialize)]
pub struct PublicAchievement {
    pub id: &'static str,
    pub name: &'static str,
    pub description: &'static str,
    pub title: &'static str,
    pub claimed_at: DateTime<Utc>,
}

pub async fn public_list(pool: &sqlx::PgPool, user_id: Uuid) -> AppResult<Vec<PublicAchievement>> {
    Ok(claimed(pool, user_id)
        .await?
        .into_iter()
        .filter_map(|(id, claimed_at)| {
            let a = find(&id)?;
            Some(PublicAchievement { id: a.id, name: a.name, description: a.description, title: a.title, claimed_at })
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn there_are_38_unique_achievements() {
        let mut ids: Vec<_> = ACHIEVEMENTS.iter().map(|a| a.id).collect();
        ids.sort();
        ids.dedup();
        assert_eq!(ids.len(), 38);
        assert!(ACHIEVEMENTS.iter().all(|a| a.coins > 0 && a.target > 0 && a.id.len() <= 32));
    }

    #[test]
    fn every_achievement_has_its_own_title_and_every_title_is_used() {
        let c = catalog();
        for a in &ACHIEVEMENTS {
            let it = c.item(a.title).unwrap_or_else(|| panic!("{} title {} missing", a.id, a.title));
            assert_eq!(it.slot, "title");
            assert_eq!(it.unlock, Unlock::Achievement, "{} must be achievement-only", a.title);
        }
        let mut titles: Vec<_> = ACHIEVEMENTS.iter().map(|a| a.title).collect();
        titles.sort();
        titles.dedup();
        assert_eq!(titles.len(), 38);
        let achievement_items = c.items.iter().filter(|i| i.unlock == Unlock::Achievement).count();
        assert_eq!(achievement_items, 38, "orphan achievement-only items in catalog");
    }

    #[test]
    fn new_player_has_nothing_unlocked() {
        let v = build_view(&Stats { cf_skins_total: 10, ttt_items_total: 18, level: 1, ..Stats::default() }, &[]);
        assert_eq!(v.ready, 0);
        assert!(v.achievements.iter().all(|a| !a.unlocked));
    }

    #[test]
    fn progress_is_capped_and_unlocks_at_target() {
        let s = Stats { level: 12, ab_best: 30_000, boxes_opened: 4, ..Stats::default() };
        let get = |id| find(id).unwrap().progress(&s);
        assert_eq!(get("level_5"), 5);
        assert_eq!(get("level_10"), 10);
        assert_eq!(get("level_25"), 12);
        assert_eq!(get("ab_25000"), 25_000);
        assert_eq!(get("ab_all_birds"), 1);
        assert_eq!(get("boxes_10"), 4);
        let v = build_view(&s, &[]);
        let ready: Vec<_> = v.achievements.iter().filter(|a| a.unlocked).map(|a| a.id).collect();
        assert_eq!(ready, vec!["ab_10000", "ab_25000", "ab_all_birds", "level_5", "level_10"]);
        assert_eq!(v.ready, 5);
    }

    #[test]
    fn collections_need_every_item() {
        let mut s = Stats { cf_skins_owned: 9, cf_skins_total: 10, ..Stats::default() };
        assert_eq!(find("cf_all_skins").unwrap().progress(&s), 0);
        s.cf_skins_owned = 10;
        assert_eq!(find("cf_all_skins").unwrap().progress(&s), 1);
    }

    #[test]
    fn claimed_stays_complete() {
        let t = Utc::now();
        let v = build_view(&Stats::default(), &[("boxes_10".to_string(), t)]);
        let a = v.achievements.iter().find(|a| a.id == "boxes_10").unwrap();
        assert!(a.unlocked);
        assert_eq!(a.progress, 10);
        assert_eq!((v.ready, v.claimed), (0, 1));
    }

    #[test]
    fn reward_pays_coins_and_equal_xp() {
        let r = find("cf_impossible").unwrap().reward();
        assert_eq!((r.coins, r.xp, r.tokens), (300, 300, 0));
    }
}
