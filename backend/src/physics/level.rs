//! Level layouts, loaded from `shared/angry_bird_levels.json`. The browser
//! reads the same file for visuals, but only the server's simulation counts.
//!
//! Coordinate system: world units, origin at bottom-left, +x right, +y up.
//! The world is 100 wide x 60 tall. Ground is y = 0. A block's `y` is its
//! bottom edge; a pig's `y` is its center.

use std::sync::OnceLock;

use serde::Deserialize;

#[derive(Debug, Clone, Copy)]
pub struct BlockDef {
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
    /// How much damage (impact energy) the block absorbs before it is destroyed.
    pub hp: f32,
}

#[derive(Debug, Clone, Copy)]
pub struct PigDef {
    pub x: f32,
    pub y: f32,
    pub r: f32,
    pub hp: f32,
}

#[derive(Debug, Clone)]
pub struct Level {
    pub id: i32,
    pub width: f32,
    pub height: f32,
    pub slingshot_x: f32,
    pub slingshot_y: f32,
    pub blocks: Vec<BlockDef>,
    pub pigs: Vec<PigDef>,
}

// ---------------------------------------------------------------------------
// Shared catalog
// ---------------------------------------------------------------------------

const JSON: &str = include_str!("../../../shared/angry_bird_levels.json");

#[derive(Debug, Deserialize)]
struct RawBlock {
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    hp: f32,
}

#[derive(Debug, Deserialize)]
struct RawPig {
    x: f32,
    y: f32,
    r: f32,
    hp: f32,
}

#[derive(Debug, Deserialize)]
struct RawLevel {
    id: i32,
    world: i32,
    name: String,
    width: f32,
    height: f32,
    slingshot: [f32; 2],
    stars: [i32; 3],
    blocks: Vec<RawBlock>,
    pigs: Vec<RawPig>,
}

#[derive(Debug, Deserialize)]
struct RawCatalog {
    levels: Vec<RawLevel>,
}

/// Level facts the API and rewards need (not the geometry).
#[derive(Debug, Clone)]
pub struct LevelMeta {
    pub id: i32,
    pub world: i32,
    pub name: String,
    /// Scores for 1, 2 and 3 stars (1 star = every pig gone).
    pub stars: [i32; 3],
    pub pigs: usize,
}

struct Catalog {
    levels: Vec<Level>,
    meta: Vec<LevelMeta>,
}

fn catalog() -> &'static Catalog {
    static CATALOG: OnceLock<Catalog> = OnceLock::new();
    CATALOG.get_or_init(|| {
        let raw: RawCatalog = serde_json::from_str(JSON).expect("shared/angry_bird_levels.json is invalid");
        let levels = raw
            .levels
            .iter()
            .map(|l| Level {
                id: l.id,
                width: l.width,
                height: l.height,
                slingshot_x: l.slingshot[0],
                slingshot_y: l.slingshot[1],
                blocks: l.blocks.iter().map(|b| BlockDef { x: b.x, y: b.y, w: b.w, h: b.h, hp: b.hp }).collect(),
                pigs: l.pigs.iter().map(|p| PigDef { x: p.x, y: p.y, r: p.r, hp: p.hp }).collect(),
            })
            .collect();
        let meta = raw
            .levels
            .iter()
            .map(|l| LevelMeta { id: l.id, world: l.world, name: l.name.clone(), stars: l.stars, pigs: l.pigs.len() })
            .collect();
        Catalog { levels, meta }
    })
}

pub fn by_id(id: i32) -> Option<Level> {
    catalog().levels.iter().find(|l| l.id == id).cloned()
}

pub fn meta(id: i32) -> Option<&'static LevelMeta> {
    catalog().meta.iter().find(|m| m.id == id)
}

pub fn all_meta() -> &'static [LevelMeta] {
    &catalog().meta
}

/// Level 1 (used by the physics tests).
pub fn level_one() -> Level {
    by_id(1).expect("level 1 exists")
}

/// Stars for a result: 0 unless every pig is gone, then 1–3 by score.
pub fn stars_for(m: &LevelMeta, score: i32, cleared: bool) -> u8 {
    if !cleared {
        return 0;
    }
    1 + u8::from(score >= m.stars[1]) + u8::from(score >= m.stars[2])
}

/// Highest level a player may play: level 1, plus one past every level
/// cleared in order.
pub fn unlocked_up_to(cleared: &[i32]) -> i32 {
    let mut top = 1;
    while cleared.contains(&top) && meta(top + 1).is_some() {
        top += 1;
    }
    top
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::physics::engine::{score_shots, ShotInput};

    #[test]
    fn twelve_levels_in_three_worlds() {
        let m = all_meta();
        assert_eq!(m.len(), 12);
        for (i, l) in m.iter().enumerate() {
            assert_eq!(l.id, i as i32 + 1, "ids are 1..12 in order");
            assert!((1..=3).contains(&l.world));
            assert!(l.pigs > 0);
            assert!(l.stars[0] < l.stars[1] && l.stars[1] < l.stars[2], "{}", l.name);
            assert_eq!(l.stars[0], l.pigs as i32 * 1000, "1 star = every pig");
        }
    }

    #[test]
    fn level_one_is_unchanged() {
        let l = level_one();
        assert_eq!((l.blocks.len(), l.pigs.len()), (7, 3));
        assert_eq!((l.blocks[0].x, l.blocks[0].y, l.blocks[0].hp), (60.0, 2.0, 40.0));
        assert_eq!((l.pigs[2].x, l.pigs[2].y), (86.0, 15.0));
    }

    /// No pig dies and the fort doesn't collapse when nothing hits it: a
    /// bird fired straight backwards must score 0 on every level.
    #[test]
    fn every_level_stands_on_its_own() {
        let away = vec![ShotInput { bird: "red".into(), angle: std::f32::consts::PI * 0.9, power: 0.3, ability_tap: None }];
        for m in all_meta() {
            let r = score_shots(by_id(m.id).unwrap(), &away);
            assert_eq!((r.pigs_destroyed, r.blocks_destroyed), (0, 0), "level {} ({}) falls apart by itself", m.id, m.name);
        }
    }

    /// Slow design check (run with `cargo test --release -- --ignored
    /// beatable`): a greedy search for 5 red-bird shots must clear every
    /// level, so no level is impossible.
    #[test]
    #[ignore]
    fn every_level_is_beatable() {
        let mut report = Vec::new();
        for m in all_meta() {
            let level = by_id(m.id).unwrap();
            let mut shots: Vec<ShotInput> = Vec::new();
            let mut best = score_shots(level.clone(), &[]);
            for _ in 0..5 {
                if best.pigs_destroyed == m.pigs {
                    break;
                }
                let mut pick = None;
                for a in 0..24 {
                    for pw in 5..=10 {
                        let shot = ShotInput { bird: "red".into(), angle: 0.05 + a as f32 * 0.05, power: pw as f32 / 10.0, ability_tap: None };
                        let mut trial = shots.clone();
                        trial.push(shot.clone());
                        let r = score_shots(level.clone(), &trial);
                        let better = (r.pigs_destroyed, r.score) > pick.as_ref().map_or((0, -1), |(_, x): &(ShotInput, crate::physics::engine::SimResult)| (x.pigs_destroyed, x.score));
                        if better {
                            pick = Some((shot, r));
                        }
                    }
                }
                let (shot, r) = pick.expect("some shot");
                shots.push(shot);
                best = r;
            }
            report.push(format!("level {:>2} {:<14} pigs {}/{} score {:>5} (stars at {:?})", m.id, m.name, best.pigs_destroyed, m.pigs, best.score, m.stars));
            let plan: Vec<String> = shots.iter().map(|s| format!("[{:.2},{:.1}]", s.angle, s.power)).collect();
            report.push(format!("  shots (angle, power): [{}]", plan.join(",")));
        }
        println!("{}", report.join("\n"));
        assert!(report.iter().all(|l| { let p: Vec<&str> = l.split("pigs ").nth(1).unwrap().split(' ').next().unwrap().split('/').collect(); p[0] == p[1] }), "not every level was cleared:\n{}", report.join("\n"));
    }

    #[test]
    fn stars_and_unlocks() {
        let m = meta(2).unwrap();
        assert_eq!(stars_for(m, 99_999, false), 0);
        assert_eq!(stars_for(m, m.stars[0], true), 1);
        assert_eq!(stars_for(m, m.stars[1], true), 2);
        assert_eq!(stars_for(m, m.stars[2], true), 3);
        assert_eq!(unlocked_up_to(&[]), 1);
        assert_eq!(unlocked_up_to(&[1, 2]), 3);
        assert_eq!(unlocked_up_to(&[1, 3]), 2, "must clear in order");
        assert_eq!(unlocked_up_to(&(1..=12).collect::<Vec<_>>()), 12);
    }
}
