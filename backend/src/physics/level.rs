//! Level layouts. These coordinates are the single source of truth for the
//! authoritative physics simulation. The frontend mirrors the same numbers for
//! visuals, but only the server's result counts.
//!
//! Coordinate system: world units, origin at bottom-left, +x right, +y up.
//! The world is 100 wide x 60 tall. Ground is y = 0.

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

/// Level 1: a small fortress of wooden blocks guarding three pigs.
pub fn level_one() -> Level {
    let blocks = vec![
        // left tower
        BlockDef { x: 60.0, y: 2.0, w: 2.0, h: 8.0, hp: 40.0 },
        BlockDef { x: 68.0, y: 2.0, w: 2.0, h: 8.0, hp: 40.0 },
        // top beam of left tower
        BlockDef { x: 64.0, y: 10.5, w: 10.0, h: 2.0, hp: 30.0 },
        // right tower
        BlockDef { x: 82.0, y: 2.0, w: 2.0, h: 10.0, hp: 50.0 },
        BlockDef { x: 90.0, y: 2.0, w: 2.0, h: 10.0, hp: 50.0 },
        BlockDef { x: 86.0, y: 12.5, w: 10.0, h: 2.0, hp: 35.0 },
        // small blocks on top
        BlockDef { x: 64.0, y: 12.0, w: 2.0, h: 2.0, hp: 20.0 },
    ];
    let pigs = vec![
        PigDef { x: 64.0, y: 1.5, r: 1.6, hp: 25.0 },
        PigDef { x: 86.0, y: 1.5, r: 1.6, hp: 25.0 },
        PigDef { x: 86.0, y: 15.0, r: 1.6, hp: 25.0 },
    ];
    Level {
        id: 1,
        width: 100.0,
        height: 60.0,
        slingshot_x: 10.0,
        slingshot_y: 8.0,
        blocks,
        pigs,
    }
}

pub fn by_id(id: i32) -> Option<Level> {
    match id {
        1 => Some(level_one()),
        _ => None,
    }
}
