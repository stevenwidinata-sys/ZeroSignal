//! Whack-a-Mole rules: the mole schedule built from a seed, and the replay
//! that turns a list of taps into a score.
//!
//! The frontend has a line-for-line copy in `frontend/src/games/whack-a-mole/
//! engine.ts`. Both use only 32-bit integer math, so the same seed and taps
//! always give the same result on both sides. A shared test vector in both
//! test suites catches drift. Change both files together.

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Random numbers (mulberry32): tiny, fast and easy to copy exactly to JS.
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
pub struct Rng(u32);

impl Rng {
    pub fn new(seed: u32) -> Self {
        Rng(seed)
    }

    pub fn next_u32(&mut self) -> u32 {
        self.0 = self.0.wrapping_add(0x6D2B_79F5);
        let mut t = self.0;
        t = (t ^ (t >> 15)).wrapping_mul(t | 1);
        t ^= t.wrapping_add((t ^ (t >> 7)).wrapping_mul(t | 61));
        t ^ (t >> 14)
    }

    /// 0..n (n > 0).
    pub fn below(&mut self, n: u32) -> u32 {
        self.next_u32() % n
    }
}

/// Everyone gets the same Daily Challenge seed on the same WIB day.
pub fn daily_seed(year: i32, month: u32, day: u32) -> u32 {
    let mut r = Rng::new((year as u32).wrapping_mul(10_000) + month * 100 + day);
    r.next_u32() ^ 0x5EED_DA11
}

// ---------------------------------------------------------------------------
// Modes and moles
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Mode {
    Classic,
    Frenzy,
    Survival,
    Daily,
}

impl Mode {
    pub const ALL: [Mode; 4] = [Mode::Classic, Mode::Frenzy, Mode::Survival, Mode::Daily];

    pub fn as_str(self) -> &'static str {
        match self {
            Mode::Classic => "classic",
            Mode::Frenzy => "frenzy",
            Mode::Survival => "survival",
            Mode::Daily => "daily",
        }
    }

    pub fn parse(s: &str) -> Option<Mode> {
        Mode::ALL.into_iter().find(|m| m.as_str() == s)
    }

    /// Stored in `scores.level` so each mode has its own leaderboard.
    pub fn board_id(self) -> i32 {
        match self {
            Mode::Classic => 1,
            Mode::Frenzy => 2,
            Mode::Survival => 3,
            Mode::Daily => 4,
        }
    }

    pub fn config(self) -> Config {
        match self {
            Mode::Classic | Mode::Daily => Config {
                duration: Some(60_000),
                ramp: 60_000,
                gap: (900, 480),
                visible: (1_150, 750),
                double_max: 25,
            },
            Mode::Frenzy => Config {
                duration: Some(30_000),
                ramp: 30_000,
                gap: (560, 330),
                visible: (800, 540),
                double_max: 45,
            },
            Mode::Survival => Config {
                duration: None,
                ramp: 120_000,
                gap: (1_000, 380),
                visible: (1_350, 620),
                double_max: 35,
            },
        }
    }
}

/// Timing for one mode. Values are milliseconds; `(start, end)` pairs move
/// linearly from start to end over the first `ramp` ms.
#[derive(Debug, Clone, Copy)]
pub struct Config {
    /// Round length; `None` = Survival (ends when lives run out).
    pub duration: Option<u32>,
    pub ramp: u32,
    pub gap: (u32, u32),
    pub visible: (u32, u32),
    /// Max % chance that a spawn brings a second mole.
    pub double_max: u32,
}

/// Survival rounds stop here even if you never lose.
pub const SURVIVAL_CAP_MS: u32 = 300_000;
pub const SURVIVAL_LIVES: u32 = 3;
/// Ice adds this much time in timed modes...
pub const ICE_BONUS_MS: u32 = 3_000;
/// ...up to this much in one round.
pub const ICE_BONUS_MAX_MS: u32 = 15_000;
/// A tap sooner than this after the last counted tap is ignored.
pub const MIN_TAP_GAP_MS: u32 = 30;
pub const BOMB_PENALTY: i64 = 300;
/// The first mole appears this long after the round starts.
const FIRST_SPAWN_MS: u32 = 600;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Kind {
    Normal,
    Ninja,
    Helmet,
    Golden,
    Bomb,
    Ice,
}

impl Kind {
    pub const ALL: [Kind; 6] = [Kind::Normal, Kind::Ninja, Kind::Helmet, Kind::Golden, Kind::Bomb, Kind::Ice];

    /// Points before combo and grid bonuses.
    pub fn points(self) -> i64 {
        match self {
            Kind::Normal => 100,
            Kind::Ninja => 150,
            Kind::Helmet => 250,
            Kind::Golden => 500,
            Kind::Bomb => 0,
            Kind::Ice => 50,
        }
    }

    /// How long it stays up, as % of the mode's normal time.
    fn visible_pct(self) -> u32 {
        match self {
            Kind::Ninja => 55,
            Kind::Helmet => 135,
            Kind::Golden => 80,
            _ => 100,
        }
    }

    /// Letting it escape breaks your combo (and costs a life in Survival).
    pub fn escape_hurts(self) -> bool {
        matches!(self, Kind::Normal | Kind::Ninja | Kind::Helmet)
    }

    fn index(self) -> usize {
        Kind::ALL.iter().position(|k| *k == self).unwrap_or(0)
    }
}

/// Chance per 1,000 spawns: normal, ninja, helmet, golden, bomb, ice.
const KIND_WEIGHTS: [u32; 6] = [640, 100, 100, 40, 90, 30];

fn roll_kind(rng: &mut Rng) -> Kind {
    let mut r = rng.below(1_000);
    for (i, w) in KIND_WEIGHTS.iter().enumerate() {
        if r < *w {
            return Kind::ALL[i];
        }
        r -= w;
    }
    Kind::Normal
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct Spawn {
    /// When it pops up (ms since the round started).
    pub t: u32,
    pub hole: u32,
    pub kind: Kind,
    /// How long it stays up (ms).
    pub vis: u32,
}

impl Spawn {
    pub fn until(&self) -> u32 {
        self.t + self.vis
    }
}

/// `start` → `end` as `at` goes 0 → `ramp` (integer math only).
fn lerp(range: (u32, u32), at: u32, ramp: u32) -> u32 {
    let (start, end) = (range.0 as i64, range.1 as i64);
    let p = at.min(ramp) as i64;
    (start + (end - start) * p / ramp.max(1) as i64) as u32
}

/// The last moment any mole can appear in this mode.
pub fn horizon(mode: Mode) -> u32 {
    match mode.config().duration {
        Some(d) => d + ICE_BONUS_MAX_MS,
        None => SURVIVAL_CAP_MS,
    }
}

/// Every mole of a round, in pop-up order. Moles never share a hole while
/// one is up, so the schedule doesn't depend on what the player hits.
pub fn schedule(seed: u32, mode: Mode, grid: u32) -> Vec<Spawn> {
    let cfg = mode.config();
    let holes = grid * grid;
    let end = horizon(mode);
    let mut rng = Rng::new(seed);
    let mut busy_until = vec![0u32; holes as usize];
    let mut out = Vec::new();
    let mut t = FIRST_SPAWN_MS;

    while t < end {
        let doubled = rng.below(100) < lerp((0, cfg.double_max), t, cfg.ramp);
        let count = if doubled { 2 } else { 1 };
        for _ in 0..count {
            let free: Vec<u32> = (0..holes).filter(|h| busy_until[*h as usize] <= t).collect();
            if free.is_empty() {
                break;
            }
            let hole = free[rng.below(free.len() as u32) as usize];
            let kind = roll_kind(&mut rng);
            let vis = lerp(cfg.visible, t, cfg.ramp) * kind.visible_pct() / 100;
            busy_until[hole as usize] = t + vis;
            out.push(Spawn { t, hole, kind, vis });
        }
        let gap = lerp(cfg.gap, t, cfg.ramp);
        // ±1/6 jitter so the rhythm isn't predictable.
        t += gap - gap / 6 + rng.below(gap / 3 + 1);
    }
    out
}

// ---------------------------------------------------------------------------
// Replay: taps in, score out. Used live by the client and in one go by the
// server, so the two can never disagree.
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Tap {
    pub t: u32,
    pub hole: u32,
}

/// What a single tap did (the client uses it for sounds and pop-ups).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TapOutcome {
    Ignored,
    Empty,
    Hit { kind: Kind, points: i64 },
    Cracked,
    Bomb,
}

/// Combo multiplier in tenths: ×1, ×1.5 from 5 in a row, FEVER ×3 from 10.
pub fn combo_tenths(streak: u32) -> i64 {
    if streak >= 10 {
        30
    } else if streak >= 5 {
        15
    } else {
        10
    }
}

/// The 4×4 board pays ×1.2.
pub fn grid_tenths(grid: u32) -> i64 {
    if grid == 4 {
        12
    } else {
        10
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
pub struct Summary {
    pub score: i64,
    pub hits: u32,
    /// Empty taps plus bombs hit.
    pub misses: u32,
    pub escapes: u32,
    pub best_streak: u32,
    pub fever: bool,
    pub golden_hits: u32,
    pub bombs_hit: u32,
    /// Hits per kind, in `Kind::ALL` order.
    pub by_kind: [u32; 6],
    pub hole_hits: Vec<u32>,
    pub hole_misses: Vec<u32>,
    pub reaction_total_ms: u64,
    pub reactions: u32,
    /// When the round ended (ms).
    pub ended_ms: u32,
    pub lives_left: u32,
}

#[derive(Debug, Clone)]
pub struct Game {
    pub mode: Mode,
    pub grid: u32,
    pub spawns: Vec<Spawn>,
    /// Hits still needed per spawn (0 = gone).
    left: Vec<u8>,
    /// Spawn indices ordered by when they would escape.
    escape_order: Vec<usize>,
    next_escape: usize,
    pub end_ms: u32,
    ice_bonus: u32,
    last_tap: Option<u32>,
    pub streak: u32,
    pub lives: u32,
    pub over: bool,
    pub s: Summary,
}

impl Game {
    pub fn new(seed: u32, mode: Mode, grid: u32) -> Self {
        let spawns = schedule(seed, mode, grid);
        let left = spawns.iter().map(|s| if s.kind == Kind::Helmet { 2 } else { 1 }).collect();
        let mut escape_order: Vec<usize> = (0..spawns.len()).collect();
        escape_order.sort_by_key(|i| (spawns[*i].until(), *i));
        let holes = (grid * grid) as usize;
        Game {
            mode,
            grid,
            spawns,
            left,
            escape_order,
            next_escape: 0,
            end_ms: mode.config().duration.unwrap_or(SURVIVAL_CAP_MS),
            ice_bonus: 0,
            last_tap: None,
            streak: 0,
            lives: if mode == Mode::Survival { SURVIVAL_LIVES } else { 0 },
            over: false,
            s: Summary { hole_hits: vec![0; holes], hole_misses: vec![0; holes], ..Default::default() },
        }
    }

    fn break_streak(&mut self) {
        self.streak = 0;
    }

    fn lose_life(&mut self, at: u32) {
        if self.mode == Mode::Survival {
            self.lives = self.lives.saturating_sub(1);
            if self.lives == 0 {
                self.end_ms = at;
            }
        }
    }

    /// Let moles escape up to and including `now`.
    pub fn advance(&mut self, now: u32) {
        while self.next_escape < self.escape_order.len() {
            let i = self.escape_order[self.next_escape];
            let sp = self.spawns[i];
            let at = sp.until();
            if at > now || at >= self.end_ms {
                break;
            }
            self.next_escape += 1;
            if self.left[i] == 0 || sp.t >= self.end_ms {
                continue;
            }
            self.left[i] = 0;
            if sp.kind.escape_hurts() {
                self.s.escapes += 1;
                self.break_streak();
                self.lose_life(at);
            }
        }
        if now >= self.end_ms {
            self.over = true;
        }
    }

    /// The mole up in `hole` at `now`, if any.
    pub fn mole_at(&self, hole: u32, now: u32) -> Option<usize> {
        if now >= self.end_ms {
            return None;
        }
        self.spawns
            .iter()
            .enumerate()
            .find(|(i, s)| s.hole == hole && s.t <= now && now < s.until() && self.left[*i] > 0)
            .map(|(i, _)| i)
    }

    pub fn tap(&mut self, tap: Tap) -> TapOutcome {
        self.advance(tap.t);
        if self.over || tap.hole >= self.grid * self.grid {
            return TapOutcome::Ignored;
        }
        if let Some(last) = self.last_tap {
            if tap.t < last + MIN_TAP_GAP_MS {
                return TapOutcome::Ignored;
            }
        }
        self.last_tap = Some(tap.t);
        let h = tap.hole as usize;

        let Some(i) = self.mole_at(tap.hole, tap.t) else {
            self.s.misses += 1;
            self.s.hole_misses[h] += 1;
            self.break_streak();
            return TapOutcome::Empty;
        };
        let sp = self.spawns[i];
        match sp.kind {
            Kind::Bomb => {
                self.left[i] = 0;
                self.s.misses += 1;
                self.s.bombs_hit += 1;
                self.s.hole_misses[h] += 1;
                self.break_streak();
                if self.mode == Mode::Survival {
                    self.lose_life(tap.t);
                    if self.lives == 0 {
                        self.over = true;
                    }
                } else {
                    self.s.score -= BOMB_PENALTY;
                }
                TapOutcome::Bomb
            }
            Kind::Helmet if self.left[i] == 2 => {
                self.left[i] = 1;
                TapOutcome::Cracked
            }
            kind => {
                self.left[i] = 0;
                self.streak += 1;
                self.s.best_streak = self.s.best_streak.max(self.streak);
                if self.streak >= 10 {
                    self.s.fever = true;
                }
                let points = kind.points() * combo_tenths(self.streak) * grid_tenths(self.grid) / 100;
                self.s.score += points;
                self.s.hits += 1;
                self.s.by_kind[kind.index()] += 1;
                self.s.hole_hits[h] += 1;
                self.s.reaction_total_ms += u64::from(tap.t - sp.t);
                self.s.reactions += 1;
                if kind == Kind::Golden {
                    self.s.golden_hits += 1;
                }
                if kind == Kind::Ice {
                    if self.mode == Mode::Survival {
                        self.lives = (self.lives + 1).min(SURVIVAL_LIVES);
                    } else if self.ice_bonus < ICE_BONUS_MAX_MS {
                        self.ice_bonus += ICE_BONUS_MS;
                        self.end_ms += ICE_BONUS_MS;
                    }
                }
                TapOutcome::Hit { kind, points }
            }
        }
    }

    /// Run the clock out and return the final numbers.
    pub fn finish(mut self) -> Summary {
        let end = self.end_ms;
        self.advance(end);
        self.s.ended_ms = self.end_ms;
        self.s.lives_left = self.lives;
        self.s.score = self.s.score.max(0);
        self.s
    }
}

#[derive(Debug, PartialEq, Eq)]
pub enum ReplayError {
    TooManyTaps,
    Unsorted,
    BadHole,
    AfterEnd,
}

pub const MAX_TAPS: usize = 6_000;

/// The server's one-shot replay.
pub fn replay(seed: u32, mode: Mode, grid: u32, taps: &[Tap]) -> Result<Summary, ReplayError> {
    if taps.len() > MAX_TAPS {
        return Err(ReplayError::TooManyTaps);
    }
    if taps.windows(2).any(|w| w[1].t < w[0].t) {
        return Err(ReplayError::Unsorted);
    }
    if taps.iter().any(|t| t.hole >= grid * grid) {
        return Err(ReplayError::BadHole);
    }
    if taps.iter().any(|t| t.t > horizon(mode)) {
        return Err(ReplayError::AfterEnd);
    }
    let mut g = Game::new(seed, mode, grid);
    for t in taps {
        g.tap(*t);
    }
    Ok(g.finish())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Perfect player: hits every non-bomb mole (twice for helmets) right
    /// after it appears.
    fn perfect_taps(seed: u32, mode: Mode, grid: u32) -> Vec<Tap> {
        let mut taps: Vec<Tap> = Vec::new();
        for s in schedule(seed, mode, grid).iter().filter(|s| s.kind != Kind::Bomb) {
            taps.push(Tap { t: s.t + 100, hole: s.hole });
            if s.kind == Kind::Helmet {
                taps.push(Tap { t: s.t + 140, hole: s.hole });
            }
        }
        taps.sort_by_key(|t| t.t);
        // Respect the minimum gap so no tap is ignored.
        let mut out: Vec<Tap> = Vec::new();
        for t in taps {
            let t2 = match out.last() {
                Some(l) if t.t < l.t + MIN_TAP_GAP_MS => Tap { t: l.t + MIN_TAP_GAP_MS, ..t },
                _ => t,
            };
            out.push(t2);
        }
        out.retain(|t| t.t <= horizon(mode));
        out
    }

    #[test]
    fn rng_matches_the_shared_test_vector() {
        // Same numbers are asserted in frontend engine.test.ts.
        let mut r = Rng::new(12345);
        let v: Vec<u32> = (0..4).map(|_| r.next_u32()).collect();
        assert_eq!(v, vec![4207900869, 1317490944, 2079646450, 3513001552]);
    }

    #[test]
    fn schedule_matches_the_shared_test_vector() {
        let s = schedule(42, Mode::Classic, 3);
        let head: Vec<(u32, u32, Kind, u32)> = s.iter().take(4).map(|s| (s.t, s.hole, s.kind, s.vis)).collect();
        assert_eq!(head, SHARED_HEAD.to_vec(), "{head:?}");
        assert_eq!(s.len(), SHARED_LEN);
    }
    const SHARED_LEN: usize = 136;
    const SHARED_HEAD: [(u32, u32, Kind, u32); 4] = [
        (600, 7, Kind::Ninja, 630),
        (1605, 6, Kind::Normal, 1140),
        (2417, 1, Kind::Normal, 1134),
        (3397, 5, Kind::Helmet, 1522),
    ];

    /// Same fingerprints are asserted in frontend engine.test.ts.
    #[test]
    fn replays_match_the_shared_test_vector() {
        let fp = |seed, mode, grid, every: usize| {
            let taps: Vec<Tap> = perfect_taps(seed, mode, grid).into_iter().step_by(every).collect();
            let s = replay(seed, mode, grid, &taps).unwrap();
            [s.score, s.hits as i64, s.misses as i64, s.escapes as i64, s.best_streak as i64,
             s.golden_hits as i64, s.ended_ms as i64, s.lives_left as i64]
        };
        assert_eq!(fp(5, Mode::Classic, 3, 1), [49075, 107, 0, 0, 107, 9, 66000, 0]);
        assert_eq!(fp(5, Mode::Classic, 4, 2), [7620, 48, 0, 53, 3, 3, 66000, 0]);
        assert_eq!(fp(9, Mode::Survival, 3, 3), [100, 1, 0, 3, 1, 0, 5746, 0]);
        assert_eq!(fp(77, Mode::Frenzy, 4, 1), [34410, 73, 0, 0, 73, 3, 30000, 0]);
    }

    #[test]
    fn same_seed_same_schedule_and_holes_never_overlap() {
        for mode in Mode::ALL {
            for grid in [3, 4] {
                let a = schedule(7, mode, grid);
                assert_eq!(a, schedule(7, mode, grid));
                assert_ne!(a, schedule(8, mode, grid));
                for (i, x) in a.iter().enumerate() {
                    assert!(x.hole < grid * grid && x.vis > 0 && x.t < horizon(mode));
                    for y in &a[i + 1..] {
                        assert!(y.hole != x.hole || y.t >= x.until(), "overlap in {mode:?}");
                    }
                }
            }
        }
    }

    #[test]
    fn modes_have_sensible_mole_counts() {
        let classic = schedule(1, Mode::Classic, 3).iter().filter(|s| s.t < 60_000).count();
        let frenzy = schedule(1, Mode::Frenzy, 3).iter().filter(|s| s.t < 30_000).count();
        assert!((60..=120).contains(&classic), "classic {classic}");
        assert!((50..=110).contains(&frenzy), "frenzy {frenzy}");
    }

    #[test]
    fn no_taps_scores_zero_and_survival_ends_after_three_escapes() {
        let s = replay(3, Mode::Classic, 3, &[]).unwrap();
        assert_eq!((s.score, s.hits, s.ended_ms), (0, 0, 60_000));
        assert!(s.escapes > 30);
        let sv = replay(3, Mode::Survival, 3, &[]).unwrap();
        assert_eq!(sv.lives_left, 0);
        assert_eq!(sv.escapes, 3);
        assert!(sv.ended_ms < 15_000, "{}", sv.ended_ms);
    }

    #[test]
    fn perfect_play_reaches_fever_and_beats_sloppy_play() {
        let taps = perfect_taps(5, Mode::Classic, 3);
        let s = replay(5, Mode::Classic, 3, &taps).unwrap();
        assert!(s.fever && s.misses == 0 && s.escapes == 0, "{s:?}");
        assert!(s.score > 20_000, "{}", s.score);
        assert_eq!(s.golden_hits, s.by_kind[Kind::Golden.index()]);
        // Same run on 4x4 pays more.
        let t4 = perfect_taps(5, Mode::Classic, 4);
        assert!(replay(5, Mode::Classic, 4, &t4).unwrap().score > 0);
        // Every other mole: no fever, lower score.
        let half: Vec<Tap> = taps.iter().copied().step_by(2).collect();
        assert!(replay(5, Mode::Classic, 3, &half).unwrap().score < s.score);
    }

    #[test]
    fn perfect_survival_lasts_to_the_cap() {
        let taps = perfect_taps(9, Mode::Survival, 3);
        let s = replay(9, Mode::Survival, 3, &taps).unwrap();
        assert_eq!(s.ended_ms, SURVIVAL_CAP_MS);
        assert_eq!(s.lives_left, SURVIVAL_LIVES);
    }

    #[test]
    fn bombs_cost_points_and_empty_taps_break_the_streak() {
        let sched = schedule(11, Mode::Classic, 3);
        let bomb = sched.iter().find(|s| s.kind == Kind::Bomb).unwrap();
        let mut g = Game::new(11, Mode::Classic, 3);
        assert_eq!(g.tap(Tap { t: bomb.t + 10, hole: bomb.hole }), TapOutcome::Bomb);
        assert_eq!(g.s.score, -BOMB_PENALTY);
        let s = g.finish();
        assert_eq!((s.score, s.bombs_hit, s.misses), (0, 1, 1));

        let normal = sched.iter().find(|s| s.kind == Kind::Normal).unwrap();
        let mut g = Game::new(11, Mode::Classic, 3);
        let empty_hole = (normal.hole + 1) % 9;
        // Tap an empty hole slightly before the normal mole shows.
        let out = g.tap(Tap { t: normal.t, hole: normal.hole });
        assert!(matches!(out, TapOutcome::Hit { kind: Kind::Normal, points: 100 }));
        assert_eq!(g.streak, 1);
        if g.mole_at(empty_hole, normal.t + 40).is_none() {
            assert_eq!(g.tap(Tap { t: normal.t + 40, hole: empty_hole }), TapOutcome::Empty);
            assert_eq!(g.streak, 0);
        }
    }

    #[test]
    fn helmets_need_two_hits_and_fast_taps_are_ignored() {
        let sched = schedule(13, Mode::Classic, 3);
        let h = sched.iter().find(|s| s.kind == Kind::Helmet).unwrap();
        let mut g = Game::new(13, Mode::Classic, 3);
        assert_eq!(g.tap(Tap { t: h.t + 5, hole: h.hole }), TapOutcome::Cracked);
        assert_eq!(g.tap(Tap { t: h.t + 10, hole: h.hole }), TapOutcome::Ignored);
        assert!(matches!(
            g.tap(Tap { t: h.t + 5 + MIN_TAP_GAP_MS, hole: h.hole }),
            TapOutcome::Hit { kind: Kind::Helmet, points: 250 }
        ));
    }

    #[test]
    fn combo_steps() {
        assert_eq!([0, 4, 5, 9, 10, 50].map(combo_tenths), [10, 10, 15, 15, 30, 30]);
    }

    #[test]
    fn replay_rejects_bad_input() {
        let t = |t, hole| Tap { t, hole };
        assert_eq!(replay(1, Mode::Classic, 3, &[t(500, 0), t(400, 1)]), Err(ReplayError::Unsorted));
        assert_eq!(replay(1, Mode::Classic, 3, &[t(500, 9)]), Err(ReplayError::BadHole));
        assert!(replay(1, Mode::Classic, 4, &[t(500, 15)]).is_ok());
        assert_eq!(replay(1, Mode::Frenzy, 3, &[t(46_000, 0)]), Err(ReplayError::AfterEnd));
        let many = vec![t(1, 0); MAX_TAPS + 1];
        assert_eq!(replay(1, Mode::Classic, 3, &many), Err(ReplayError::TooManyTaps));
    }

    #[test]
    fn daily_seed_is_stable_per_day() {
        assert_eq!(daily_seed(2026, 11, 11), daily_seed(2026, 11, 11));
        assert_ne!(daily_seed(2026, 11, 11), daily_seed(2026, 11, 12));
    }

    #[test]
    fn modes_round_trip() {
        for m in Mode::ALL {
            assert_eq!(Mode::parse(m.as_str()), Some(m));
        }
        assert_eq!(Mode::parse("nope"), None);
    }
}
