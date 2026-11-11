# Zero Signal roadmap and decisions

This file keeps agreed decisions so they survive across work sessions.
Workflow rules: ask the owner before deciding anything unclear; small commits
prefixed `feat:` / `fix:` / `refactor:`; one branch per feature group, pushed
after each commit; after a branch passes all tests it is fast-forward merged
into `main` (owner approved this).

## Phase 1 (done, merged into main)

- Shared economy: coins, tokens, XP/levels, 1,000 coin daily cap, `wallet_ledger`.
- Character: 23 slots, 158 items (`shared/character_items.json`), wardrobe, 3
  outfit presets, coin shop, mystery box, token wheel, public profiles.
- Tic-Tac-Toe: vs AI (Easy, Medium, unbeatable Hard) and vs friend; boards,
  faces, private photo face (`shared/tic_tac_toe_items.json`).
- Whack-a-Mole: coming-soon card only.

## Phase 2 (done, merged into main)

Branches, each merged into `main` after tests pass:
`feat/daily-rewards`, `feat/achievements`, `feat/music`, `feat/accessibility`.

### Daily day boundary
- Everything daily resets at **00:00 WIB (UTC+7)**: login reward, quests and
  the daily coin cap. The cap currently resets at 00:00 UTC and must move.

### Daily login reward (`feat/daily-rewards`, done)
- 7-day streak: day 1 = 10 coins, 2 = 15, 3 = 20, 4 = 25, 5 = 30, 6 = 40,
  7 = 100 coins + 1 token. After day 7 the streak restarts at day 1.
- Missing a day resets the streak to day 1.
- A pop-up with a "Claim" button appears when you open the site.
- Login rewards do **not** count toward the daily coin cap.

### Daily quests (`feat/daily-rewards`, done)
- 3 random quests per day from a pool of 12 (listed in README), e.g. "Win 2
  Connect Four games vs Medium or harder", "Play 3 Tic-Tac-Toe games vs the
  AI", "Score 5,000 in Angry Bird", "Win a series without undo", "Open a
  mystery box".
- Each pays 20 to 60 coins + XP via a **Claim** button. Claiming all 3 gives
  a bonus token. Quest coins don't count toward the daily cap.
- Only server-verified results count. 1 free reroll per day that swaps
  **one** unfinished quest.
- Shown both as a Hub panel and on the `/quests` page (nav badge when ready).

### Achievements (`feat/achievements`, done)
- 25 one-time achievements (listed in README), progress computed live from
  verified data, so old progress counts. Claim button pays coins + equal XP
  and a title. Locked ones are visible with progress bars.
- Every achievement gives its own title (25 new achievement-only titles).
- Every title has a tier by how hard it is: bronze (color), silver (+ icon),
  gold (+ glow), mythic (+ animation). Existing titles get tiers by rarity.
- "Legend" already existed (level 30), so the level-25 title is "Living Legend".
- Shown on `/achievements`, the public profile, wardrobe and leaderboards.

### Background music (`feat/music`, done)
- Chiptune generated in code (Web Audio), no music files.
- 3 tracks: hub, calm (Tic-Tac-Toe / Connect Four), upbeat (Angry Bird).
- Separate music on/off + volume in Settings. Default **on at 40%**, starting
  after the first click (browsers block autoplay).

### Colorblind mode (`feat/accessibility`, done)
- One "colorblind-friendly" switch (option a): color-safe palette everyone can
  tell apart, plus shapes on top of colors (e.g. marks on Connect Four chips).

### Tutorials (`feat/accessibility`, done)
- Short 3–4 step "how to play" the first time each game is opened, plus a "?"
  button to see it again. Seen tutorials are remembered in the browser.

## Phase 3: Whack-a-Mole + settings (agreed 2026-11-11, in progress)

Status: `feat/whack-a-mole` (v1) done and merged; next is `feat/settings-plus`.

Owner said "go with your picks" for the 10 ideas. Branch order:
`feat/whack-a-mole` → `feat/settings-plus` → `feat/whack-a-mole-extras`.

### Whack-a-Mole v1 (`feat/whack-a-mole`, done): ideas 1, 2, 3, 9, 10
- **Setup screen before each round:** mode, grid size (3×3 or 4×4).
- **Modes:** Classic (60 s), Frenzy (30 s, faster and shorter moles),
  Survival (no clock, 3 lives, gets faster, max 5 min), Daily Challenge
  (Classic rules, 3×3, same moles for everyone that WIB day, its own
  leaderboard for today).
- **Moles:** normal 100, ninja 150 (very short), helmet 250 (2 hits),
  golden 500 (rare), bomb (don't hit: −300, or −1 life in Survival; breaks
  the combo), ice (+3 s on timed modes, +1 life in Survival, max 3).
  Every kind has its own shape/icon, so colorblind players can tell them apart.
- **Combo:** streak ×1.5 at 5 hits in a row, **FEVER ×3** at 10+ (board
  glows). An empty tap, bomb hit or escaped mole ends the streak.
  Survival: an escaped normal/ninja/helmet mole costs a life.
- **4×4 grid** pays ×1.2 score. Keyboard: 1–9 (3×3, numpad layout),
  `1234 / QWER / ASDF / ZXCV` (4×4). Mouse and touch work everywhere.
- **Anti-cheat:** `POST start` gives a run id + seed; both sides build the
  same mole schedule from the seed (same PRNG in TS and Rust). The client
  sends only taps `(ms, hole)`; the server replays them, checks timing
  (sorted, inside the round, ≥ 40 ms apart, real time ≥ round length) and
  computes the score. One finish per run; runs expire after 15 min.
- **Rewards:** same formula as Angry Bird (1 coin / 1,000 points, 10–100 XP,
  token 3% → 15%), counts toward the daily cap.
- **Quests (+3):** play 3 rounds (20/30), score 5,000 in a round (40/60),
  hit 5 golden moles today (40/60).
- **Achievements (+4, each with a title):** First Bonk (first round),
  Fever Pitch (reach FEVER), Mole Master (10,000 in one round),
  Survivor (last 120 s in Survival).
- **Results screen:** score, accuracy, average reaction time, best combo,
  hits per mole type, heat map of the holes, new-best badge, rewards.
- Leaderboard: one tab per mode (Daily shows today only). Upbeat music,
  hit sounds, tutorial, light-graphics and colorblind support.

### Settings (`feat/settings-plus`)
- Screen shake on/off, reduced motion (separate from light graphics),
  text size (S/M/L), ask before leaving a match, "reset tutorials" button.

### Whack-a-Mole extras (`feat/whack-a-mole-extras`): ideas 4–8
- Boss mole, power-ups, hammer skins (shop + spin), board themes
  (Garden, Neon, Graveyard, Beach, Space), your character beside the board.

### Website upgrades to schedule after that
- Stats page, weekly leaderboards, Indonesian language, PWA, cleaner Hub.

## Phase 3b (planned)

- Weekly leaderboards (reset each week, all-time board stays).
- Game replays (step through Connect Four / Tic-Tac-Toe moves).
- Install as an app (PWA, add to home screen).

## Phase 4 (planned)

- Online multiplayer (live games between devices; server checks every move,
  so these can pay rewards).
- Friends list and challenge links.

## Extra ideas (approved, not yet scheduled)

1. Mystery boxes — done in Phase 1.
2. Outfit presets — done in Phase 1.
3. Your character in the games — partly done (character face in Tic-Tac-Toe).
4. Seasonal items (Halloween, Christmas, sold only at that time).
5. Level-up rewards screen — done (level-up pop-up lists unlocks).
6. Stats page (win rate per game/AI level, best streak, coins earned).
7. Rename and profile bio (rename once a month or for coins).
8. Admin page (player count, give coins, add shop items, remove bad photos/names).
9. Report button for photos/profiles.
10. Daily coin cap — done (1,000 coins/day).

## Also discussed

- Deployment: not decided yet. Before deploying, set a real random
  `JWT_SECRET` and the real `CORS_ORIGIN`. Likely hosts: managed Postgres
  (Neon/Supabase/Railway), backend on Railway/Render/Fly.io (needs a
  Dockerfile), frontend on Vercel/Netlify/Cloudflare Pages.
- Local dev database: local PostgreSQL 18 service, user/db `angrybird`
  (matches `backend/.env.example`).
