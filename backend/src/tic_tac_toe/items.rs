//! Tic-Tac-Toe boards and faces, loaded from `shared/tic_tac_toe_items.json`
//! (the frontend reads the same file). Free items are owned by everyone;
//! the rest can be bought with coins or won on the reward spin.

use std::sync::OnceLock;

use rand::seq::SliceRandom;
use rand::Rng;
use serde::{Deserialize, Serialize};

use super::ai::Difficulty;
use crate::character::catalog::Rarity;

const JSON: &str = include_str!("../../../shared/tic_tac_toe_items.json");

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Kind {
    Board,
    Face,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Item {
    pub id: String,
    pub name: String,
    pub rarity: Rarity,
    /// `None` = free for everyone.
    pub price: Option<i64>,
    #[serde(skip)]
    pub kind: Option<Kind>,
}

impl Item {
    pub fn free(&self) -> bool {
        self.price.is_none()
    }

    /// Stored key: boards and faces share one ownership table.
    pub fn key(&self) -> String {
        match self.kind {
            Some(Kind::Board) => format!("board:{}", self.id),
            _ => format!("face:{}", self.id),
        }
    }
}

pub struct Items {
    pub boards: Vec<Item>,
    pub faces: Vec<Item>,
}

#[derive(Deserialize)]
struct Raw {
    boards: Vec<Item>,
    faces: Vec<Item>,
}

impl Items {
    fn parse(json: &str) -> Result<Items, String> {
        let raw: Raw = serde_json::from_str(json).map_err(|e| e.to_string())?;
        let tag = |v: Vec<Item>, k| v.into_iter().map(|mut i: Item| { i.kind = Some(k); i }).collect();
        let items = Items { boards: tag(raw.boards, Kind::Board), faces: tag(raw.faces, Kind::Face) };
        for list in [&items.boards, &items.faces] {
            for (i, it) in list.iter().enumerate() {
                if list[i + 1..].iter().any(|o| o.id == it.id) {
                    return Err(format!("duplicate id {}", it.id));
                }
                if it.price.is_some_and(|p| p <= 0) {
                    return Err(format!("{} has a non-positive price", it.id));
                }
            }
        }
        if !items.boards.iter().any(Item::free) {
            return Err("need a free board".into());
        }
        if items.faces.iter().filter(|f| f.free()).count() < 2 {
            return Err("need two free faces".into());
        }
        Ok(items)
    }

    pub fn find(&self, kind: Kind, id: &str) -> Option<&Item> {
        let list = match kind {
            Kind::Board => &self.boards,
            Kind::Face => &self.faces,
        };
        list.iter().find(|i| i.id == id)
    }

    pub fn find_key(&self, key: &str) -> Option<&Item> {
        let (kind, id) = key.split_once(':')?;
        match kind {
            "board" => self.find(Kind::Board, id),
            "face" => self.find(Kind::Face, id),
            _ => None,
        }
    }

    pub fn all(&self) -> impl Iterator<Item = &Item> {
        self.boards.iter().chain(self.faces.iter())
    }

    pub fn owns(&self, item: &Item, owned_keys: &[String]) -> bool {
        item.free() || owned_keys.iter().any(|k| *k == item.key())
    }
}

pub fn items() -> &'static Items {
    static ITEMS: OnceLock<Items> = OnceLock::new();
    ITEMS.get_or_init(|| Items::parse(JSON).unwrap_or_else(|e| panic!("invalid tic-tac-toe items: {e}")))
}

/// Reward spin rarity weights by difficulty (same idea as Connect Four).
pub fn odds(d: Difficulty) -> [(Rarity, u32); 4] {
    use Rarity::*;
    match d {
        Difficulty::Easy => [(Common, 50), (Rare, 35), (Epic, 12), (Legendary, 3)],
        Difficulty::Medium => [(Common, 30), (Rare, 45), (Epic, 20), (Legendary, 5)],
        Difficulty::Hard => [(Common, 10), (Rare, 45), (Epic, 35), (Legendary, 10)],
    }
}

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct SpinResult {
    /// Every landing (item keys) in order; all but the last were owned.
    pub rolls: Vec<String>,
    pub won: Option<String>,
}

/// Spin until landing on an unowned board or face. `won = None` when the
/// whole collection is owned.
pub fn spin(d: Difficulty, owned: &[String], rng: &mut impl Rng) -> SpinResult {
    let all = items();
    let pool: Vec<&Item> = all.all().filter(|i| !i.free()).collect();
    let left: Vec<&Item> = pool.iter().copied().filter(|i| !all.owns(i, owned)).collect();
    let mut rolls = Vec::new();
    if left.is_empty() {
        return SpinResult { rolls, won: None };
    }
    for _ in 0..64 {
        let table = odds(d);
        let live: Vec<(Rarity, u32)> =
            table.iter().copied().filter(|&(r, w)| w > 0 && pool.iter().any(|i| i.rarity == r)).collect();
        let total: u32 = live.iter().map(|&(_, w)| w).sum();
        let mut x = rng.gen_range(0..total);
        let rarity = live
            .iter()
            .find(|&&(_, w)| {
                let hit = x < w;
                if !hit {
                    x -= w;
                }
                hit
            })
            .map(|&(r, _)| r)
            .unwrap_or(Rarity::Common);
        let same: Vec<&Item> = pool.iter().copied().filter(|i| i.rarity == rarity).collect();
        let Some(it) = same.choose(rng) else { continue };
        rolls.push(it.key());
        if !all.owns(it, owned) {
            return SpinResult { won: Some(it.key()), rolls };
        }
    }
    let it = left.choose(rng).expect("checked non-empty");
    rolls.push(it.key());
    SpinResult { won: Some(it.key()), rolls }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand::SeedableRng;
    use rand_chacha::ChaCha8Rng;

    #[test]
    fn shipped_items_are_valid() {
        let it = items();
        assert_eq!(it.boards.len(), 10);
        assert!(it.faces.len() >= 18);
        for id in ["x", "o", "photo", "avatar", "star", "heart", "strawberry", "watermelon", "panda", "frog"] {
            assert!(it.find(Kind::Face, id).unwrap().free(), "{id} should be free");
        }
        for id in ["classic", "notebook", "ocean", "sunny", "mint"] {
            assert!(it.find(Kind::Board, id).unwrap().free(), "{id} should be free");
        }
        assert_eq!(it.find_key("face:pig").unwrap().name, "Piggy");
        assert_eq!(it.find_key("board:neon").unwrap().kind, Some(Kind::Board));
        assert!(it.find_key("hat:pig").is_none());
    }

    #[test]
    fn validation_catches_mistakes() {
        let ok = r#"{"boards":[{"id":"a","name":"A","rarity":"common","price":null}],
                     "faces":[{"id":"x","name":"X","rarity":"common","price":null},{"id":"o","name":"O","rarity":"common","price":null}]}"#;
        assert!(Items::parse(ok).is_ok());
        assert!(Items::parse(&ok.replace(r#""id":"o""#, r#""id":"x""#)).is_err());
        assert!(Items::parse(&ok.replace(r#""price":null}]"#, r#""price":0}]"#)).is_err());
    }

    #[test]
    fn spin_gives_unowned_paid_items_and_respins() {
        let mut r = ChaCha8Rng::seed_from_u64(1);
        let paid: Vec<String> = items().all().filter(|i| !i.free()).map(Item::key).collect();
        let target = paid[0].clone();
        let owned: Vec<String> = paid.iter().filter(|k| **k != target).cloned().collect();
        let res = spin(Difficulty::Easy, &owned, &mut r);
        assert_eq!(res.won.as_deref(), Some(target.as_str()));
        assert!(res.rolls[..res.rolls.len() - 1].iter().all(|k| owned.contains(k)));
        assert_eq!(spin(Difficulty::Hard, &paid, &mut r), SpinResult { rolls: vec![], won: None });
        for _ in 0..100 {
            let won = spin(Difficulty::Medium, &[], &mut r).won.unwrap();
            assert!(!items().find_key(&won).unwrap().free());
        }
    }
}
