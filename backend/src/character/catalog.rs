//! Character item catalog, loaded from `shared/character_items.json`.
//!
//! The same file feeds the frontend renderer, so ids, slots, rarities, prices
//! and unlock rules can never drift apart. The server only trusts this copy.

use std::collections::{BTreeMap, HashMap};
use std::sync::OnceLock;

use serde::{Deserialize, Serialize};

const CATALOG_JSON: &str = include_str!("../../../shared/character_items.json");

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Rarity {
    Common,
    Rare,
    Epic,
    Legendary,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", tag = "kind")]
pub enum Unlock {
    /// Everyone owns it from the start.
    Starter,
    /// Owned automatically once the player reaches this level.
    Level { level: i32 },
    /// Bought in the shop.
    Coins { price: i64 },
    /// Only from the token wheel.
    Wheel,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Slot {
    pub id: String,
    pub label: String,
    pub group: String,
    pub required: bool,
    pub default: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Item {
    pub id: String,
    pub slot: String,
    pub name: String,
    pub rarity: Rarity,
    pub unlock: Unlock,
}

pub struct Catalog {
    pub slots: Vec<Slot>,
    pub items: Vec<Item>,
    by_id: HashMap<String, usize>,
}

#[derive(Deserialize)]
struct RawCatalog {
    slots: Vec<Slot>,
    items: Vec<Item>,
}

/// slot id -> item id
pub type Loadout = BTreeMap<String, String>;

impl Catalog {
    fn parse(json: &str) -> Result<Catalog, String> {
        let raw: RawCatalog = serde_json::from_str(json).map_err(|e| e.to_string())?;
        let by_id = raw.items.iter().enumerate().map(|(i, it)| (it.id.clone(), i)).collect();
        let c = Catalog { slots: raw.slots, items: raw.items, by_id };
        c.validate()?;
        Ok(c)
    }

    /// Catch catalog mistakes at startup (and in tests), not in production.
    fn validate(&self) -> Result<(), String> {
        if self.by_id.len() != self.items.len() {
            return Err("duplicate item id".into());
        }
        for it in &self.items {
            if !it.id.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-') {
                return Err(format!("item id not url-safe: {}", it.id));
            }
            if self.slot(&it.slot).is_none() {
                return Err(format!("{} has unknown slot {}", it.id, it.slot));
            }
            match it.unlock {
                Unlock::Coins { price } if price <= 0 => {
                    return Err(format!("{} has a non-positive price", it.id))
                }
                Unlock::Level { level } if level < 2 => {
                    return Err(format!("{} unlocks at level < 2 (use starter)", it.id))
                }
                _ => {}
            }
        }
        for s in &self.slots {
            match (&s.default, s.required) {
                (None, true) => return Err(format!("required slot {} has no default", s.id)),
                (Some(d), _) => {
                    let it = self.item(d).ok_or(format!("slot {} default {d} missing", s.id))?;
                    if it.slot != s.id || it.unlock != Unlock::Starter {
                        return Err(format!("slot {} default {d} must be a starter of that slot", s.id));
                    }
                }
                (None, false) => {}
            }
        }
        Ok(())
    }

    pub fn item(&self, id: &str) -> Option<&Item> {
        self.by_id.get(id).map(|&i| &self.items[i])
    }

    pub fn slot(&self, id: &str) -> Option<&Slot> {
        self.slots.iter().find(|s| s.id == id)
    }

    /// Owned = starter, or level reached, or in the player's inventory.
    pub fn owns(&self, item: &Item, level: i32, inventory: &[String]) -> bool {
        match item.unlock {
            Unlock::Starter => true,
            Unlock::Level { level: need } => level >= need,
            Unlock::Coins { .. } | Unlock::Wheel => inventory.iter().any(|i| i == &item.id),
        }
    }

    pub fn default_loadout(&self) -> Loadout {
        self.slots
            .iter()
            .filter_map(|s| s.default.clone().map(|d| (s.id.clone(), d)))
            .collect()
    }

    /// Repair a stored loadout: drop unknown/unowned entries and refill
    /// required slots with their defaults. Used when reading.
    pub fn sanitize(&self, stored: &Loadout, level: i32, inventory: &[String]) -> Loadout {
        let mut out = self.default_loadout();
        for (slot, id) in stored {
            if let Some(it) = self.item(id) {
                if &it.slot == slot && self.owns(it, level, inventory) {
                    out.insert(slot.clone(), id.clone());
                }
            }
        }
        out
    }

    /// Strictly validate a loadout sent by the client. Unlike `sanitize`,
    /// anything wrong is an error, so cheating attempts are rejected.
    pub fn validate_loadout(
        &self,
        l: &Loadout,
        level: i32,
        inventory: &[String],
    ) -> Result<Loadout, String> {
        for (slot, id) in l {
            if self.slot(slot).is_none() {
                return Err(format!("unknown slot: {slot}"));
            }
            let it = self.item(id).ok_or(format!("unknown item: {id}"))?;
            if &it.slot != slot {
                return Err(format!("{id} doesn't go in {slot}"));
            }
            if !self.owns(it, level, inventory) {
                return Err(format!("you don't own {}", it.name));
            }
        }
        for s in self.slots.iter().filter(|s| s.required) {
            if !l.contains_key(&s.id) {
                return Err(format!("{} can't be empty", s.label));
            }
        }
        Ok(l.clone())
    }

    /// Items that unlock when going from `from` to `to` (exclusive, inclusive].
    pub fn unlocked_between(&self, from: i32, to: i32) -> Vec<&Item> {
        self.items
            .iter()
            .filter(|it| matches!(it.unlock, Unlock::Level { level } if level > from && level <= to))
            .collect()
    }
}

pub fn catalog() -> &'static Catalog {
    static CATALOG: OnceLock<Catalog> = OnceLock::new();
    CATALOG.get_or_init(|| {
        Catalog::parse(CATALOG_JSON).unwrap_or_else(|e| panic!("invalid character catalog: {e}"))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn inv(ids: &[&str]) -> Vec<String> {
        ids.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn shipped_catalog_is_valid_and_big() {
        let c = catalog();
        assert_eq!(c.slots.len(), 23);
        assert!(c.items.len() >= 120, "only {} items", c.items.len());
        // Every slot has something to pick, and every rarity is used.
        for s in &c.slots {
            assert!(c.items.iter().any(|i| i.slot == s.id), "empty slot {}", s.id);
        }
        for r in [Rarity::Common, Rarity::Rare, Rarity::Epic, Rarity::Legendary] {
            assert!(c.items.iter().any(|i| i.rarity == r));
        }
        // All three ways to unlock exist (besides starters).
        assert!(c.items.iter().any(|i| matches!(i.unlock, Unlock::Level { .. })));
        assert!(c.items.iter().any(|i| matches!(i.unlock, Unlock::Coins { .. })));
        assert!(c.items.iter().any(|i| i.unlock == Unlock::Wheel));
    }

    #[test]
    fn validation_catches_broken_catalogs() {
        let ok = r#"{"slots":[{"id":"hat","label":"Hat","group":"head","required":false,"default":null}],
                     "items":[{"id":"a","slot":"hat","name":"A","rarity":"common","unlock":{"kind":"starter"}}]}"#;
        assert!(Catalog::parse(ok).is_ok());
        for bad in [
            ok.replace(r#""slot":"hat""#, r#""slot":"nope""#),
            ok.replace(r#"{"kind":"starter"}"#, r#"{"kind":"coins","price":0}"#),
            ok.replace(r#"{"kind":"starter"}"#, r#"{"kind":"level","level":1}"#),
            ok.replace(r#""required":false,"default":null"#, r#""required":true,"default":null"#),
            ok.replace(r#""id":"a""#, r#""id":"A B""#),
        ] {
            assert!(Catalog::parse(&bad).is_err(), "accepted: {bad}");
        }
    }

    #[test]
    fn ownership_rules() {
        let c = catalog();
        let starter = c.item("shirt-tee-white").unwrap();
        let level5 = c.item("pet-bird").unwrap();
        let shop = c.item("hat-cap-red").unwrap();
        let wheel = c.item("hat-crown").unwrap();
        assert!(c.owns(starter, 1, &[]));
        assert!(!c.owns(level5, 4, &[]));
        assert!(c.owns(level5, 5, &[]));
        assert!(!c.owns(shop, 99, &[]));
        assert!(c.owns(shop, 1, &inv(&["hat-cap-red"])));
        assert!(!c.owns(wheel, 99, &[]));
        assert!(c.owns(wheel, 1, &inv(&["hat-crown"])));
    }

    #[test]
    fn default_loadout_fills_every_required_slot() {
        let c = catalog();
        let l = c.default_loadout();
        assert!(c.validate_loadout(&l, 1, &[]).is_ok());
        for s in c.slots.iter().filter(|s| s.required) {
            assert!(l.contains_key(&s.id));
        }
        assert!(!l.contains_key("hat"));
    }

    #[test]
    fn strict_validation_rejects_cheats() {
        let c = catalog();
        let mut l = c.default_loadout();
        l.insert("hat".into(), "hat-crown".into());
        assert!(c.validate_loadout(&l, 99, &[]).unwrap_err().contains("don't own"));
        l.insert("hat".into(), "shirt-tee-red".into());
        assert!(c.validate_loadout(&l, 1, &[]).unwrap_err().contains("doesn't go"));
        l.remove("hat");
        l.insert("wings".into(), "back-cape-red".into());
        assert!(c.validate_loadout(&l, 1, &[]).unwrap_err().contains("unknown slot"));
        let mut l = c.default_loadout();
        l.remove("shirt");
        assert!(c.validate_loadout(&l, 1, &[]).unwrap_err().contains("empty"));
    }

    #[test]
    fn sanitize_repairs_stale_loadouts() {
        let c = catalog();
        let mut stored = Loadout::new();
        stored.insert("hat".into(), "hat-crown".into()); // no longer owned
        stored.insert("glasses".into(), "glasses-round".into()); // level 2
        stored.insert("bogus".into(), "x".into());
        let l = c.sanitize(&stored, 2, &[]);
        assert_eq!(l.get("glasses").map(String::as_str), Some("glasses-round"));
        assert!(!l.contains_key("hat"));
        assert!(!l.contains_key("bogus"));
        assert_eq!(l.get("shirt").map(String::as_str), Some("shirt-tee-white"));
    }

    #[test]
    fn level_unlock_ranges() {
        let c = catalog();
        let ids: Vec<&str> = c.unlocked_between(1, 2).iter().map(|i| i.id.as_str()).collect();
        assert!(ids.contains(&"hat-cap-blue"));
        assert!(c.unlocked_between(4, 4).is_empty());
        assert!(c.unlocked_between(29, 30).iter().any(|i| i.id == "title-legend"));
    }
}
