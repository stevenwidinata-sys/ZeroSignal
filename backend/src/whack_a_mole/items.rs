//! Whack-a-Mole hammers and board themes, loaded from
//! `shared/whack_items.json` (the frontend reads the same file). Free items
//! are owned by everyone; the rest are bought with coins or dropped by luck.

use std::sync::OnceLock;

use rand::seq::SliceRandom;
use rand::Rng;
use serde::{Deserialize, Serialize};

use crate::character::catalog::Rarity;

const JSON: &str = include_str!("../../../shared/whack_items.json");

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Kind {
    Hammer,
    Theme,
}

impl Kind {
    pub fn prefix(self) -> &'static str {
        match self {
            Kind::Hammer => "hammer",
            Kind::Theme => "theme",
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct Item {
    pub id: String,
    pub name: String,
    pub rarity: Rarity,
    /// `None` = free for everyone.
    pub price: Option<i64>,
}

impl Item {
    pub fn free(&self) -> bool {
        self.price.is_none()
    }
}

#[derive(Deserialize)]
pub struct Items {
    pub hammers: Vec<Item>,
    pub themes: Vec<Item>,
}

/// Stored ownership key, e.g. "hammer:pan".
pub fn key(kind: Kind, id: &str) -> String {
    format!("{}:{id}", kind.prefix())
}

impl Items {
    fn parse(json: &str) -> Result<Items, String> {
        let items: Items = serde_json::from_str(json).map_err(|e| e.to_string())?;
        for list in [&items.hammers, &items.themes] {
            for (i, it) in list.iter().enumerate() {
                if list[i + 1..].iter().any(|o| o.id == it.id) {
                    return Err(format!("duplicate id {}", it.id));
                }
                if it.price.is_some_and(|p| p <= 0) {
                    return Err(format!("{} has a non-positive price", it.id));
                }
            }
            if !list.iter().any(Item::free) {
                return Err("each list needs a free item".into());
            }
        }
        Ok(items)
    }

    pub fn list(&self, kind: Kind) -> &[Item] {
        match kind {
            Kind::Hammer => &self.hammers,
            Kind::Theme => &self.themes,
        }
    }

    pub fn find(&self, kind: Kind, id: &str) -> Option<&Item> {
        self.list(kind).iter().find(|i| i.id == id)
    }

    /// Free item of a kind (the default choice).
    pub fn default_id(&self, kind: Kind) -> &str {
        &self.list(kind).iter().find(|i| i.free()).expect("checked at load").id
    }

    /// Do you own it? Free items always; others when `owned` has the key.
    pub fn owns(&self, kind: Kind, id: &str, owned: &[String]) -> bool {
        self.find(kind, id).is_some_and(|i| i.free() || owned.contains(&key(kind, id)))
    }

    /// A random paid item you don't own yet (for lucky drops).
    pub fn random_unowned(&self, owned: &[String], rng: &mut impl Rng) -> Option<String> {
        let pool: Vec<String> = [Kind::Hammer, Kind::Theme]
            .into_iter()
            .flat_map(|k| self.list(k).iter().filter(|i| !i.free()).map(move |i| key(k, &i.id)))
            .filter(|k| !owned.contains(k))
            .collect();
        pool.choose(rng).cloned()
    }
}

pub fn items() -> &'static Items {
    static ITEMS: OnceLock<Items> = OnceLock::new();
    ITEMS.get_or_init(|| Items::parse(JSON).expect("shared/whack_items.json is invalid"))
}

/// Lucky drop: rounds scoring this much have a small chance to drop an item.
pub const DROP_MIN_SCORE: i64 = 3_000;
pub const DROP_CHANCE: f64 = 0.05;

#[cfg(test)]
mod tests {
    use super::*;
    use rand::SeedableRng;
    use rand_chacha::ChaCha8Rng;

    #[test]
    fn shared_catalog_loads() {
        let it = items();
        assert_eq!(it.hammers.len(), 6);
        assert_eq!(it.themes.len(), 5);
        assert_eq!(it.default_id(Kind::Hammer), "mallet");
        assert_eq!(it.default_id(Kind::Theme), "garden");
    }

    #[test]
    fn ownership_rules() {
        let it = items();
        let owned = vec![key(Kind::Hammer, "pan")];
        assert!(it.owns(Kind::Hammer, "mallet", &[]));
        assert!(it.owns(Kind::Hammer, "pan", &owned));
        assert!(!it.owns(Kind::Hammer, "golden", &owned));
        assert!(!it.owns(Kind::Theme, "pan", &owned));
        assert!(!it.owns(Kind::Hammer, "nope", &owned));
    }

    #[test]
    fn drops_never_repeat_owned_items() {
        let it = items();
        let mut rng = ChaCha8Rng::seed_from_u64(4);
        let mut owned: Vec<String> = Vec::new();
        while let Some(k) = it.random_unowned(&owned, &mut rng) {
            assert!(!owned.contains(&k));
            owned.push(k);
        }
        assert_eq!(owned.len(), 9, "all paid items dropped once");
    }

    #[test]
    fn bad_catalogs_are_rejected() {
        assert!(Items::parse(r#"{"hammers":[{"id":"a","name":"A","rarity":"common","price":5}],"themes":[]}"#).is_err());
    }
}
