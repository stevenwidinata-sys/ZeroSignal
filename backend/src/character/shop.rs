//! Shop odds: mystery box (coins) and the token wheel. Pure logic, so the
//! odds are unit-tested; the HTTP handlers live in `api.rs`.

use rand::seq::SliceRandom;
use rand::Rng;
use serde::Serialize;

use super::catalog::{Catalog, Item, Rarity, Unlock};

pub const MYSTERY_BOX_PRICE: i64 = 250;
pub const WHEEL_TOKEN_COST: i32 = 1;

/// Mystery box rarity weights (only coin-shop items can drop).
const BOX_WEIGHTS: [(Rarity, u32); 4] =
    [(Rarity::Common, 60), (Rarity::Rare, 30), (Rarity::Epic, 9), (Rarity::Legendary, 1)];
/// Token wheel rarity weights (only wheel-exclusive items can drop).
const WHEEL_WEIGHTS: [(Rarity, u32); 4] =
    [(Rarity::Common, 0), (Rarity::Rare, 50), (Rarity::Epic, 38), (Rarity::Legendary, 12)];

pub fn price_of(item: &Item) -> Option<i64> {
    match item.unlock {
        Unlock::Coins { price } => Some(price),
        _ => None,
    }
}

/// Pick a rarity by weight, ignoring rarities with no items in `pool`.
fn roll_rarity(weights: &[(Rarity, u32)], pool: &[&Item], rng: &mut impl Rng) -> Option<Rarity> {
    let live: Vec<(Rarity, u32)> = weights
        .iter()
        .copied()
        .filter(|&(r, w)| w > 0 && pool.iter().any(|i| i.rarity == r))
        .collect();
    let total: u32 = live.iter().map(|&(_, w)| w).sum();
    if total == 0 {
        return None;
    }
    let mut x = rng.gen_range(0..total);
    for (r, w) in live {
        if x < w {
            return Some(r);
        }
        x -= w;
    }
    None
}

fn roll<'a>(weights: &[(Rarity, u32)], pool: &[&'a Item], rng: &mut impl Rng) -> Option<&'a Item> {
    let r = roll_rarity(weights, pool, rng)?;
    let same: Vec<&Item> = pool.iter().copied().filter(|i| i.rarity == r).collect();
    same.choose(rng).copied()
}

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct BoxResult {
    pub item_id: String,
    pub duplicate: bool,
    /// Coins given back for a duplicate (half the item's shop price).
    pub refund: i64,
}

/// Open a mystery box: a random coin-shop item. Duplicates refund 50%.
pub fn open_box(c: &Catalog, owned: &[String], rng: &mut impl Rng) -> BoxResult {
    let pool: Vec<&Item> = c.items.iter().filter(|i| price_of(i).is_some()).collect();
    let it = roll(&BOX_WEIGHTS, &pool, rng).expect("catalog has coin items");
    let duplicate = owned.iter().any(|o| o == &it.id);
    BoxResult {
        item_id: it.id.clone(),
        duplicate,
        refund: if duplicate { price_of(it).unwrap_or(0) / 2 } else { 0 },
    }
}

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct WheelResult {
    /// Every landing in order; all but the last were owned (free re-spins).
    pub rolls: Vec<String>,
    pub won: String,
}

pub fn wheel_items(c: &Catalog) -> Vec<&Item> {
    c.items.iter().filter(|i| i.unlock == Unlock::Wheel).collect()
}

/// Spin the token wheel until landing on an unowned wheel item.
/// `None` when every wheel item is already owned (spin should be refused).
pub fn spin_wheel(c: &Catalog, owned: &[String], rng: &mut impl Rng) -> Option<WheelResult> {
    let pool = wheel_items(c);
    let is_owned = |i: &Item| owned.iter().any(|o| o == &i.id);
    let left: Vec<&Item> = pool.iter().copied().filter(|i| !is_owned(i)).collect();
    if left.is_empty() {
        return None;
    }
    let mut rolls = Vec::new();
    // Bounded: every roll has a fixed positive chance of an unowned item.
    for _ in 0..64 {
        let it = roll(&WHEEL_WEIGHTS, &pool, rng)?;
        rolls.push(it.id.clone());
        if !is_owned(it) {
            return Some(WheelResult { won: it.id.clone(), rolls });
        }
    }
    let it = left.choose(rng)?;
    rolls.push(it.id.clone());
    Some(WheelResult { won: it.id.clone(), rolls })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::character::catalog::catalog;
    use rand::SeedableRng;
    use rand_chacha::ChaCha8Rng;

    #[test]
    fn mystery_box_only_drops_shop_items_and_refunds_duplicates() {
        let c = catalog();
        let mut r = ChaCha8Rng::seed_from_u64(1);
        for _ in 0..300 {
            let b = open_box(c, &[], &mut r);
            assert!(price_of(c.item(&b.item_id).unwrap()).is_some());
            assert!(!b.duplicate);
            assert_eq!(b.refund, 0);
        }
        let all: Vec<String> = c.items.iter().map(|i| i.id.clone()).collect();
        let b = open_box(c, &all, &mut r);
        assert!(b.duplicate);
        assert_eq!(b.refund, price_of(c.item(&b.item_id).unwrap()).unwrap() / 2);
    }

    #[test]
    fn mystery_box_is_mostly_common() {
        let c = catalog();
        let mut r = ChaCha8Rng::seed_from_u64(2);
        let commons = (0..2000)
            .filter(|_| c.item(&open_box(c, &[], &mut r).item_id).unwrap().rarity == Rarity::Common)
            .count();
        assert!((1000..1400).contains(&commons), "{commons}");
    }

    #[test]
    fn wheel_gives_only_unowned_exclusives_with_respins() {
        let c = catalog();
        let pool = wheel_items(c);
        assert!(pool.len() >= 15);
        // Own all but one rare-or-better item: wheel must find it.
        let target = pool[0].id.clone();
        let owned: Vec<String> =
            pool.iter().map(|i| i.id.clone()).filter(|id| *id != target).collect();
        let mut r = ChaCha8Rng::seed_from_u64(3);
        let res = spin_wheel(c, &owned, &mut r).unwrap();
        assert_eq!(res.won, target);
        assert_eq!(res.rolls.last(), Some(&target));
        for id in &res.rolls[..res.rolls.len() - 1] {
            assert!(owned.contains(id));
        }
    }

    #[test]
    fn wheel_refuses_when_collection_is_complete() {
        let c = catalog();
        let all: Vec<String> = wheel_items(c).iter().map(|i| i.id.clone()).collect();
        assert_eq!(spin_wheel(c, &all, &mut ChaCha8Rng::seed_from_u64(4)), None);
    }

    #[test]
    fn wheel_never_drops_shop_or_level_items() {
        let c = catalog();
        let mut r = ChaCha8Rng::seed_from_u64(5);
        for _ in 0..300 {
            let res = spin_wheel(c, &[], &mut r).unwrap();
            assert_eq!(c.item(&res.won).unwrap().unlock, Unlock::Wheel);
        }
    }
}
