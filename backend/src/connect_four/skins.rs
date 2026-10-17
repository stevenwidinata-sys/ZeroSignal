//! Chip skins and the reward-spin odds. Server-side so rewards can't be faked.

use rand::seq::SliceRandom;
use rand::Rng;
use serde::Serialize;

use super::ai::Difficulty;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Rarity {
    Common,
    Rare,
    Epic,
    Legendary,
}

#[derive(Debug, Clone, Serialize)]
pub struct Skin {
    pub id: &'static str,
    pub name: &'static str,
    pub rarity: Rarity,
    /// Starter skins everyone owns.
    pub free: bool,
}

const fn skin(id: &'static str, name: &'static str, rarity: Rarity, free: bool) -> Skin {
    Skin { id, name, rarity, free }
}

/// Must match frontend/src/games/connect-four/skins.ts.
pub const SKINS: &[Skin] = &[
    skin("red", "Classic Red", Rarity::Common, true),
    skin("blue", "Classic Blue", Rarity::Common, true),
    skin("green", "Lime Green", Rarity::Common, false),
    skin("purple", "Royal Purple", Rarity::Rare, false),
    skin("golden", "Golden", Rarity::Legendary, false),
    skin("red-bird", "Red Bird", Rarity::Rare, false),
    skin("pig", "Piggy", Rarity::Rare, false),
    skin("bomb-bird", "Bomb Bird", Rarity::Epic, false),
    skin("egg", "Golden Egg", Rarity::Epic, false),
    skin("tnt", "TNT Crate", Rarity::Epic, false),
];

pub fn find(id: &str) -> Option<&'static Skin> {
    SKINS.iter().find(|s| s.id == id)
}

/// Rarity weights (percent) by AI difficulty. Impossible guarantees Epic+.
pub fn odds(d: Difficulty) -> [(Rarity, u32); 4] {
    use Rarity::*;
    match d {
        Difficulty::Easy => [(Common, 50), (Rare, 35), (Epic, 12), (Legendary, 3)],
        Difficulty::Medium => [(Common, 30), (Rare, 45), (Epic, 20), (Legendary, 5)],
        Difficulty::Hard => [(Common, 10), (Rare, 45), (Epic, 35), (Legendary, 10)],
        Difficulty::Impossible => [(Common, 0), (Rare, 0), (Epic, 75), (Legendary, 25)],
    }
}

/// Points awarded on the leaderboard for winning a series.
pub fn series_points(d: Difficulty, best_of: i16) -> i32 {
    let base = match d {
        Difficulty::Easy => 1,
        Difficulty::Medium => 3,
        Difficulty::Hard => 6,
        Difficulty::Impossible => 15,
    };
    if best_of >= 5 {
        base * 2
    } else {
        base
    }
}

fn roll_rarity(d: Difficulty, rng: &mut impl Rng) -> Rarity {
    let table = odds(d);
    let total: u32 = table.iter().map(|&(_, w)| w).sum();
    let mut x = rng.gen_range(0..total);
    for (r, w) in table {
        if x < w {
            return r;
        }
        x -= w;
    }
    unreachable!("weights sum to total")
}

/// Result of a spin: every landing in order. Landings on owned skins are
/// free re-spins; the last entry is the new skin (if any was left to win).
#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct SpinResult {
    pub rolls: Vec<&'static str>,
    pub won: Option<&'static str>,
}

/// Spin until landing on a skin the user doesn't own yet.
///
/// The wheel can only award skins whose rarity has a non-zero weight for
/// this difficulty; if all of those are owned, nothing is won.
pub fn spin(d: Difficulty, owned: &[String], rng: &mut impl Rng) -> SpinResult {
    let is_owned = |s: &Skin| s.free || owned.iter().any(|o| o == s.id);
    let reachable: Vec<Rarity> =
        odds(d).iter().filter(|&&(_, w)| w > 0).map(|&(r, _)| r).collect();
    let any_left = SKINS.iter().any(|s| !is_owned(s) && reachable.contains(&s.rarity));
    let mut rolls = Vec::new();
    if !any_left {
        return SpinResult { rolls, won: None };
    }
    // Bounded: each roll has a fixed positive chance of hitting an unowned skin.
    for _ in 0..64 {
        let rarity = roll_rarity(d, rng);
        let pool: Vec<&Skin> = SKINS.iter().filter(|s| s.rarity == rarity && !s.free).collect();
        let Some(s) = pool.choose(rng) else { continue };
        rolls.push(s.id);
        if !is_owned(s) {
            return SpinResult { rolls, won: Some(s.id) };
        }
    }
    // Extremely unlikely fallback: award any remaining reachable skin.
    let left: Vec<&Skin> =
        SKINS.iter().filter(|s| !is_owned(s) && reachable.contains(&s.rarity)).collect();
    let s = left.choose(rng).expect("any_left checked above");
    rolls.push(s.id);
    SpinResult { rolls, won: Some(s.id) }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand::SeedableRng;
    use rand_chacha::ChaCha8Rng;

    const ALL: [Difficulty; 4] =
        [Difficulty::Easy, Difficulty::Medium, Difficulty::Hard, Difficulty::Impossible];

    #[test]
    fn catalog_has_ten_unique_skins_two_free() {
        assert_eq!(SKINS.len(), 10);
        for (i, s) in SKINS.iter().enumerate() {
            assert!(SKINS[i + 1..].iter().all(|o| o.id != s.id));
        }
        let free: Vec<_> = SKINS.iter().filter(|s| s.free).map(|s| s.id).collect();
        assert_eq!(free, vec!["red", "blue"]);
        assert_eq!(find("golden").unwrap().rarity, Rarity::Legendary);
        assert!(find("nope").is_none());
    }

    #[test]
    fn odds_sum_to_100_and_impossible_is_epic_plus() {
        for d in ALL {
            assert_eq!(odds(d).iter().map(|&(_, w)| w).sum::<u32>(), 100);
        }
        let mut r = ChaCha8Rng::seed_from_u64(9);
        for _ in 0..200 {
            let res = spin(Difficulty::Impossible, &[], &mut r);
            let rar = find(res.won.unwrap()).unwrap().rarity;
            assert!(rar >= Rarity::Epic);
        }
    }

    #[test]
    fn spin_never_awards_an_owned_skin_and_respins() {
        let owned: Vec<String> =
            ["green", "purple", "red-bird", "pig", "bomb-bird", "egg"].map(String::from).to_vec();
        let mut r = ChaCha8Rng::seed_from_u64(3);
        let mut saw_respin = false;
        for _ in 0..100 {
            let res = spin(Difficulty::Easy, &owned, &mut r);
            let won = res.won.unwrap();
            assert!(!owned.iter().any(|o| o == won));
            assert_eq!(res.rolls.last(), Some(&won));
            // all earlier landings were owned skins
            for id in &res.rolls[..res.rolls.len() - 1] {
                assert!(owned.iter().any(|o| o == id));
            }
            saw_respin |= res.rolls.len() > 1;
        }
        assert!(saw_respin);
    }

    #[test]
    fn complete_collection_wins_nothing() {
        let all: Vec<String> = SKINS.iter().map(|s| s.id.to_string()).collect();
        let res = spin(Difficulty::Hard, &all, &mut ChaCha8Rng::seed_from_u64(1));
        assert_eq!(res, SpinResult { rolls: vec![], won: None });
        // Impossible can't win commons/rares, so owning every epic+ ends it.
        let epic_plus: Vec<String> =
            ["golden", "bomb-bird", "egg", "tnt"].map(String::from).to_vec();
        let res = spin(Difficulty::Impossible, &epic_plus, &mut ChaCha8Rng::seed_from_u64(1));
        assert_eq!(res.won, None);
    }

    #[test]
    fn harder_series_are_worth_more() {
        let pts: Vec<i32> = ALL.iter().map(|&d| series_points(d, 3)).collect();
        assert!(pts.windows(2).all(|w| w[0] < w[1]));
        assert_eq!(series_points(Difficulty::Hard, 5), 2 * series_points(Difficulty::Hard, 3));
    }
}
