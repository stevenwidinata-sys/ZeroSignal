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

Status: `feat/whack-a-mole` (v1), `feat/minefield`, `feat/settings-plus`, `feat/stats`, `feat/whack-a-mole-extras` and `feat/2048` done and merged.

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

### Settings (`feat/settings-plus`, done)
- Also added: vibration on phones. "Ask before leaving" covers Whack-a-Mole, Angry Bird (after the first shot) and Minefield.
- Screen shake on/off, reduced motion (separate from light graphics),
  text size (S/M/L), ask before leaving a match, "reset tutorials" button.

### Whack-a-Mole extras (`feat/whack-a-mole-extras`, done): ideas 4–8
Owner said "yes do whack-a-mole extras" (2026-11-11). Details:
- **Boss mole** (idea 4): a giant mole every 20 s (Frenzy 12 s, Survival
  30 s). It stays up 3.5 s and takes 8 hits; each hit pays 50 (combo and
  grid bonuses apply) and the knock-out pays a 1,000 bonus. An escaped boss
  costs nothing. Hits on it build the combo.
- **Power-ups** (idea 5), rare moles that give an effect when hit:
  Double (×2 points for 6 s), Shield (your next combo-breaker is forgiven,
  holds up to 2), Slow-mo (the game clock runs at half speed for 5 s).
- **Hammer skins** (idea 6): Wooden Mallet (free), Squeaky Toy, Frying
  Pan, Fish, Neon Ban-Hammer, Golden Hammer. Each has its own cursor, hit
  effect color and sound. Bought with coins, or a lucky drop: a round that
  scores 3,000+ has a 5% chance to drop one you don't own.
- **Board themes** (idea 7): Garden (free), Neon Arcade, Graveyard,
  Beach, Space. Each changes the board, holes and mole colors. Same shop
  and drop rules. The server checks you own the hammer and theme at start.
- **Your character** (idea 8) stands beside the board and reacts
  (FEVER, bombs, boss knock-outs).
- Both engines (Rust + TS) change together; shared test vectors updated.
- New achievement: Boss Breaker (knock out a boss mole).

### Minefield (`feat/minefield`, done; agreed 2026-11-11: "make all ideas you can")
Owner picked Minefield from the 10 new-game ideas. v1 includes:
1. **3 sizes + Daily:** Beginner 9×9 / 10 mines, Intermediate 16×16 / 40,
   Expert 16×30 / 99, Daily (Intermediate size, same board for everyone,
   one ranked try per WIB day, timer starts when it opens).
2. **No-guess boards:** every board can be solved by logic alone. The
   server only keeps boards its solver can finish from the first click.
3. **Safe first click:** the first click always opens an area.
4. **Server holds the mines:** the client only ever sees revealed cells,
   so peeking is impossible. Mines are shown only after the game ends.
5. **Chording:** click a number whose flags are all placed to open the rest.
6. **Flags and ? marks;** on phones a Flag-mode switch and long-press.
7. **Keyboard play:** arrows move, Space/Enter open, F flag, D chord.
8. **Hints:** up to 3 per game, each opens a safe cell and adds 20 s.
9. **Score:** base + speed bonus (Beginner 1,000 + 20/s under 60 s,
   Intermediate 3,000 + 15/s under 240 s, Expert 8,000 + 12/s under
   600 s; Daily as Intermediate). Leaderboard tab per size + Today's Daily.
10. **Results:** time, 3BV, 3BV/s, click efficiency, hints, full board
    reveal on loss (wrong flags crossed out).
- **Rewards:** win coins Beginner 5 / Intermediate 20 / Expert 60 /
  Daily 25; XP win 20 × (1/2/4, Daily 2), loss 5; token 2% / 8% / 25% /
  Daily 10%. Quests (+3): clear 2 boards; clear Intermediate or harder;
  clear a board with no hints. Achievements (+4): First Sweep, Expert
  Sweeper, Speed Sweeper (Beginner under 20 s), Daily Devotee (5 Daily wins).
- Later (extras): board skins, Blitz mode, lives mode.

### Website upgrades to schedule after that
- Stats page (done, `feat/stats`), weekly leaderboards, Indonesian language, PWA, cleaner Hub.

### Weekly leaderboards (`feat/weekly-leaderboards`, done; agreed 2026-11-11)
- Weeks run Monday 00:00 → Monday 00:00 WIB. Every leaderboard gets an
  **All time / This week / Last week** switch (Daily boards stay "today").
  The page shows when the week resets.
- Best-score games rank by the best score in the week. Connect Four and
  Tic-Tac-Toe store running totals, so scores get a `gained` column
  (points that result added, backfilled for old rows) and weekly boards
  rank by points gained that week.
- **Weekly prizes:** top 3 last week on each board (Angry Bird, Connect
  Four, Tic-Tac-Toe, each Whack-a-Mole mode, each Minefield size; not the
  Daily boards) win #1 150 coins + 1 token, #2 100, #3 50. Claimed from a
  banner on the Hub and Leaderboards (once per board per week, not counted
  toward the daily cap).

### Cleaner Hub (`feat/cleaner-hub`, done; agreed 2026-11-12)
- Logged out: a compact hero (no duplicate theme/settings buttons, no
  stale "Coming soon: 0" stat), "Create account" + "Log in", then games.
- Logged in: the hero becomes a **welcome strip**: your character, name,
  level and XP bar, coins, and a **Continue** button for the last game
  you played, plus shortcuts to Stats and Achievements.
- **Recently played** row (last 3 games, remembered in this browser) next
  to **Today's quests**; weekly prizes banner above them when you have any.
- Game grid fits all games on one row on desktop; cards show your best
  score (or points) and a NEW badge on the newest games.

### 2048 (`feat/2048`, done; agreed 2026-11-13: "go with your picks")
- **Play:** arrows / WASD / swipe slide every tile; equal tiles merge and a
  2 (90%) or 4 (10%) appears after each move. The game ends when no move
  changes the board. You can keep going past 2048.
- **Modes:** Classic 4×4 (×1), Big 5×5 (×0.8), Tiny 3×3 (×2), Daily
  (Classic rules, same tile drops for everyone that WIB day, one ranked try,
  its own "today" board). Boards: 1 Classic, 2 Big, 3 Tiny, 4 Daily.
- **Undo:** up to 3 per game (Daily: none); undo can go back up to 3 moves.
  Undo games still rank, but don't count for "Pure Skill".
- **Anti-cheat:** `POST start` gives a run id + seed; tile drops come from
  the same mulberry32 PRNG in Rust and TS. The client sends only the move
  string (`U D L R`, `Z` = undo); the server replays it and computes score
  and biggest tile. A move that changes nothing is rejected. At most 25
  moves per second of real time.
- **Saving:** the client saves its moves to the server every few moves and
  when the tab is hidden (append-only: a save must extend the stored moves).
  One unfinished game per player; it is kept 24 h after the last save, can
  be continued on any device, and can be finished early ("End game").
- **Score:** sum of merged tile values × the mode multiplier. Leaderboards
  show the score and the player's biggest tile; weekly boards and prizes on
  Classic, Big and Tiny.
- **Rewards:** Angry Bird formula on the score (1 coin / 1,000, 10–100 XP,
  token 3% → 15%), +30 coins for a 2048 tile, +80 more and a 50% token
  chance for 4096. All count toward the daily cap.
- **Quests (+3):** play 3 games (20/30), make a 512 tile (40/60), score
  10,000 in one game (40/60).
- **Achievements (+4, each with a title):** First Slide (finish a game),
  2048! (reach 2048), Tile Tycoon (reach 4096), Pure Skill (2048 without undo).
- Slide/merge animations, merge sounds, "Quiet Board" music, tutorial,
  colorblind (numbers always shown, safe palette), light graphics (no
  animations), results screen (score, biggest tile, moves, time, undos,
  new best), Hub card with NEW badge, Stats card.

### Guest play (`feat/guest-play`, done; agreed 2026-11-13)
- **Play first, account later:** every game opens without logging in. The
  first time a visitor opens a game, the site quietly creates a **guest
  account** (no name/password; kept in that browser, token valid 30 days).
- Guests earn coins, XP, tokens, quest progress and item drops like anyone,
  but are **hidden from leaderboards, weekly prizes and profiles**.
- **Login-only:** Shop and character (wardrobe), the daily login reward,
  claiming quests and achievements (progress still tracked), public profile,
  and the Tic-Tac-Toe photo face (personal data). Guests see a "register or
  log in" screen instead.
- **Register as a guest:** the guest account becomes the real account,
  so everything is kept.
- **Log in to an existing account as a guest:** the guest's scores, games,
  items and quest days the account doesn't have move over; coins, tokens
  and XP are paid through the normal reward path (coins count toward the
  account's 1,000/day cap, so guests can't be farmed). Where both have the
  same thing (today's quests, an unfinished game, today's Daily) the
  account's wins. Connect Four / Tic-Tac-Toe running totals are recomputed.
  Then the guest is deleted.
- **Clean-up:** guests not seen for 30 days are deleted (at startup, then
  daily). At most 20 new guests per hour per IP. Guests can't log in with
  a password; usernames can't start with "guest".
- **Reminders:** a slim "Playing as a guest" banner and a "Register to save
  this score" button on every results screen. No pop-ups.

### Settings upgrade (agreed 2026-11-13: owner picked all 16 ideas)
The settings dialog gets tabs: Display · Sound · Gameplay · Controls ·
Account · Privacy. Built in this order, one branch each:
1. **Account** (`feat/settings-account`, done): change password; change email
   (needs password); change username (free, once every 30 days); delete
   account with a **7-day grace period** (locked and hidden at once, really
   deleted after 7 days, logging in cancels). Guests see "Register to use".
2. **Saving and privacy** (`feat/settings-sync`, done): settings saved to the
   account and synced across devices (account wins on login; guests stay
   local); reset to defaults (exists); hide me on leaderboards (no weekly
   prizes then); private profile (name only); switches for the daily-login
   pop-up, level-up pop-up and reward toasts; a separate UI-click volume.
3. **Display and shortcuts** (`feat/settings-display`, done): high contrast,
   readable font (replaces the pixel font), FPS counter, fullscreen switch,
   shortcut keys (M mute, F fullscreen, Esc pause/close), a list of every
   game's keys.
4. **Rebind keys** (`feat/settings-keys`, done): 2048, Whack-a-Mole, Minefield,
   Connect Four, Tic-Tac-Toe; conflict warning; reset keys.
5. **Language** (`feat/i18n`): English / Bahasa Indonesia for the whole
   site, games and server errors. New visitors get their browser's
   language. Claude translates; the owner reviews the Indonesian.

### Ten changes (agreed 2026-11-14, plan approved; built in this order)
Commits go to `main` step by step (each step live once tested); owner is the only author.
- **A. Hub polish** (`feat/hub-polish`): 4 game cards per row (6 games = 4 + 2);
  a big, clearly visible back button on every page; **10 free mood themes**
  (Neon Arcade, Daylight, Sunset Chill, Ocean Calm, Forest, Candy Pop,
  Midnight Focus, Game Boy Green, Sakura, Cyberpunk) in Settings → Display,
  synced to the account.
- **B. More free items** (`feat/free-items`): +4 Connect Four skins, +4
  Tic-Tac-Toe boards, +6 faces, +3 hammers, +3 Whack-a-Mole themes, 4 free
  2048 tile styles, +20 starter character items. Paid items unchanged.
- **C. Angry Bird levels** (`feat/angry-bird-levels`): 12 levels in 3 worlds
  from `shared/angry_bird_levels.json` (read by Rust and TS), level select
  with 1–3 stars, unlock by clearing, per-level leaderboards, quest + 2
  achievements.
- **D. Living characters** (`feat/living-characters`): animated 2D pixel
  character (idle, wave, cheer, sad, think) + emotes; shown on the Hub,
  results, leaderboard top 3, and both sides of Connect Four / Tic-Tac-Toe
  (AI = "Zero-Bot").
- **E. Online play** (`feat/online-play`): turn-based Connect Four and
  Tic-Tac-Toe between two devices via room code/link; server checks every
  move; polling/long-poll (Vercel has no sockets); forfeit after 2 min away;
  XP only (no coins); "Online" leaderboard by wins.
- **F. Game Kit** (`feat/game-kit`): `docs/GAME_KIT.md` rules so every game
  feels the same; shared ModeSelect / ResultsPanel / GameHeader used by all
  games; "Coming soon" cards and a /roadmap page.
- **Planned games:** Snake Signal, Brick Breaker, Signal Flap, Memory Match,
  Pixel Picross, Block Drop, Sudoku, Pong Online, Sonar (Battleship-style),
  Checkers. All follow the Game Kit.
- **Ideas (build when the owner picks):** Live Arcade Lobby, Community Boss
  Raid, Ghost races, Pet that grows, Glitch Hour, Free seasons, Crews, Share
  cards, Chiptune Jukebox, Weekend tournaments.
- Then: language (English / Bahasa Indonesia).

## Phase 3b (planned)

- Weekly leaderboards (reset each week, all-time board stays) — done.
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
6. Stats page (win rate per game/AI level, best streak, coins earned) — done.
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
