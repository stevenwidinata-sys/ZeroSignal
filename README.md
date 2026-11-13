# Zero Signal

A hub of fun browser games with a retro arcade UI and real, **server-verified leaderboards** (clients cannot cheat).

- **Frontend:** React + TypeScript + Vite
- **Backend:** Rust + Axum + sqlx
- **Database:** PostgreSQL 16

## Games

| Game         | Status      | Notes |
|--------------|-------------|-------|
| Angry Bird   | Live        | Full physics; the server re-simulates every shot with `rapier2d` |
| Connect Four | Live        | vs AI (4 levels) or vs a friend; best of 3/5; 10 chip skins + spin wheel |
| Tic-Tac-Toe  | Live        | vs AI (Easy, Medium, unbeatable Hard) or vs a friend; boards, faces, your photo as a face |
| Whack-a-Mole | Live        | 4 modes, 6 kinds of moles, combos and FEVER; the server replays every tap |
| Minefield    | Live        | No-guess boards in 3 sizes + a Daily; the server keeps the mines |
| 2048         | Live        | Classic 4×4, Big 5×5, Tiny 3×3 + a Daily; saved as you play; the server replays every move |

## Features

- Register / login (Argon2 password hashing + JWT auth). **Anyone can play without an account** (see Guest play below); an account is needed to get on the leaderboards and to use the shop, wardrobe, daily login reward and quest/achievement claims.
- **Guest play:** opening a game without an account quietly starts a **guest account** in the background (kept in that browser; deleted after 30 days without a visit). Guests earn coins, XP, tokens, quest progress and items like anyone, but are hidden from leaderboards, weekly prizes and profiles. A slim banner and a "Register to save this score" button on every results screen remind them. **Registering** turns the guest into the real account, so everything is kept. **Logging in** to an existing account moves the guest's scores, games, items and earlier quest days into it, and pays the guest's coins, tokens and XP as a normal reward (coins count toward the 1,000-a-day cap); where both have something (today's quests, an unfinished game, today's Daily) the account's wins. At most 20 new guests per hour per IP; guests can't log in with a password, and usernames can't start with "guest".
- **Hub:** logged out, a short intro with Create account / Log in / Quick play. Logged in, a welcome strip (your character, level and XP bar, coins, **Continue** your last game, Stats and Achievements shortcuts), **Recently played** (last 3 games, remembered in this browser) beside **Today's quests**, then every game on one row with your best score and NEW badges on the newest games.
- Per-game leaderboards and personal history, with **All time / This week / Last week** views. Weeks run Monday 00:00 → Monday 00:00 WIB.
- **Weekly prizes:** the top 3 last week on each board (Angry Bird, Connect Four, Tic-Tac-Toe, each Whack-a-Mole mode, each Minefield size; not the Daily boards) claim 150 coins + 1 token, 100 or 50 coins from a banner on the Hub or Leaderboards. Best-score games rank by the week's best score; Connect Four and Tic-Tac-Toe by points earned that week. Prize coins don't count toward the daily cap.
- Anti-cheat by design: clients send only player *inputs*; the server computes every score.
- Dark / light theme and a settings panel with tabs (Display · Sound · Gameplay · Account), saved in the browser:
  - **Display:** light graphics, colorblind-friendly, reduced motion (also follows your device setting), screen shake, text size S/M/L/XL.
  - **Sound and music:** on/off and volume for each.
  - **Gameplay:** turn timer, **ask before leaving a round** (warns before closing the tab or opening another page mid-round in Whack-a-Mole, Angry Bird and Minefield), vibration on phones.
  - **Help:** reset tutorials so every "how to play" shows again.
  - **Account** (registered players): change username (free, once every 30 days), email and password (both need your current password), and **delete account**: you're signed out and hidden at once, and the account is deleted for good after 7 days unless you log in again before then.
- **Stats page** (`/stats`): your level, coins earned and spent, tokens, login streak, quests and achievements, plus a card per game: AI series win rates per level, best and average scores per mode or size, Minefield best times, Whack-a-Mole best combo and FEVER rounds, 2048 biggest tile and games that reached 2048. Only server-verified results count.
- **Colorblind-friendly** switch (Settings → Display): pieces switch to the Okabe-Ito palette, which people with common color vision deficiencies can tell apart, and get shapes so no game relies on color alone. In Connect Four, player 1's chips carry a circle and player 2's a cross. In Tic-Tac-Toe, X and O get safe colors and other faces get an X or O badge. Winning lines also get a dashed outline.
- **Tutorials:** each live game shows a short 4-step "how to play" the first time you open it. The **?** button (bottom-left) shows it again. Seen tutorials are remembered in the browser.
- Background music: 3 chiptune tracks made in code with Web Audio (no music files). "Insert Coin" plays on the hub and menus, "Quiet Board" in Connect Four and Tic-Tac-Toe, and "Slingshot Rush" in Angry Bird. Music has its own on/off switch and volume (default on at 40%). It starts after your first click or key press, because browsers block autoplay, and it pauses while the tab is hidden.
- Shared economy: every server-verified game pays **coins**, **XP** (levels) and sometimes a lucky **token**.

## Tic-Tac-Toe

- **Modes:** vs AI or a friend on one device. You (X) always move first.
- **AI:** Easy (mostly random), Medium (always blocks, but slips up), **Hard (perfect play, can never lose)**. A test checks every possible human strategy against Hard.
- **Series:** best of 3 or 5 games, and draws count as games. A series ends early once one side can't be caught; equal wins at the end means the series is drawn.
- **Rewards (AI only):** XP every game. Winning a series pays Easy 5 / Medium 15 / Hard 40 coins. A drawn series against Hard pays 15 coins, because surviving it is the achievement. Best of 5 pays double. Token chance 8% / 15% / 50% (15% for a drawn Hard series).
- **Undo:** max 3 per game, none on Hard. Using undo cancels the series' reward spin.
- **Boards and faces:** 6 boards and 12 faces (X/O, emojis, Angry Bird chips, your character's face, your photo), listed in `shared/tic_tac_toe_items.json`. Buy them with coins or win them on the reward spin, which never gives a duplicate.
- **Photo face:** upload a picture or use your webcam, then drag and zoom to crop it to a circle. The browser shrinks it to 128×128 before upload, and the server only accepts real JPEG/PNG/WebP files up to 64 KB. Your photo is **private**: only you can load it, and it's deleted with your account.

## Whack-a-Mole

- **Modes:** Classic (60 s, speeds up), Frenzy (30 s, faster moles, more at once), Survival (no clock, 3 lives, gets faster, ends at 5 min), Daily Challenge (Classic rules on 3×3, the same moles for everyone that WIB day, with a Today leaderboard).
- **Board:** 3×3, or 4×4 for ×1.2 points. Mouse, touch or keyboard: 3×3 uses the numpad layout (7 8 9 / 4 5 6 / 1 2 3) or Q W E / A S D / Z X C; 4×4 uses 1 2 3 4 / Q W E R / A S D F / Z X C V. "Show keyboard keys" prints them in the holes.

| Mole | Points | What it does |
|------|--------|--------------|
| Mole | 100 | |
| Ninja | 150 | pops up only briefly |
| Helmet | 250 | needs 2 hits (the helmet cracks first) |
| Golden | 500 | rare |
| Ice | 50 | +3 s on timed modes (max +15 s), +1 life in Survival |
| Bomb | −300 | don't hit it; in Survival it costs a life |
| Double (power-up) | 50 | ×2 points for 6 s |
| Shield (power-up) | 50 | forgives your next combo-breaker (holds up to 2) |
| Slow-mo (power-up) | 50 | the game clock runs at half speed for 5 s |
| **Boss** | 50 per hit + 1,000 | comes up every 20 s (Frenzy 12 s, Survival 30 s), stays 3.5 s, takes 8 hits |

- **Combo:** 5 hits in a row pay ×1.5, 10 in a row start **FEVER ×3** (the board glows). A tap on an empty hole, a bomb, or an escaped mole ends it. In Survival every escaped mole (not golden or ice) costs a life.
- Every mole kind has its own shape (mask, hard hat, crown, ice block, skull bomb), so color is never needed.
- **Results:** accuracy, average reaction time, best combo, moles per kind and a heat map of the holes.
- **Anti-cheat:** `start` gives the client a run id and a seed; client and server build the same mole schedule from it (same 32-bit integer code in `engine.ts` and `engine.rs`, checked by shared test vectors). The client sends only its taps `(ms, hole)`; the server replays them, rejects rounds that finished faster than real time, and computes the score. Each run can be finished once, within 15 minutes.
- Pausing (or switching tabs) stops the game clock.
- **Hammers** (cursor, hit sound and spark): Wooden Mallet (free), Squeaky Toy 150, Frying Pan 250, Wet Fish 250, Neon Ban-Hammer 600, Golden Hammer 1,500.
- **Board themes** (board, holes, mole colors): Garden (free), Neon Arcade 300, Graveyard 400, Sunny Beach 400, Deep Space 1,200. Catalog: `shared/whack_items.json`.
- Locked items are bought with coins on the setup screen, or **drop by luck**: a round scoring 3,000+ has a 5% chance to give one you don't own. The server checks you own the hammer and theme when a round starts.
- **Your character** stands beside the board and reacts to FEVER, bombs and boss knock-outs.

## Minefield

- **Boards:** Beginner 9×9 / 10 mines, Intermediate 16×16 / 40, Expert 16×30 / 99, and the **Daily** (Intermediate size, the same board for everyone that WIB day, already opened in the middle, one ranked try, the clock starts when it opens).
- **No guessing, ever:** the board is made on your first click. The server keeps only boards its logic solver (single-cell, subset and mine-count rules) can clear from that click, so there is never a 50/50.
- **Server holds the mines:** the client sends the cell it opens and gets back only opened cells. Mines are sent only after the game ends, so peeking is impossible.
- **Controls:** click opens; right-click or long-press cycles flag → ? → none; **Flag mode** for touch; click (or middle-click) a number whose flags are placed to open around it (chording). Keyboard: arrows move, Space/Enter open or chord, F flags.
- **Hints:** up to 3 per game. Each opens a safe cell next to what you've opened and adds 20 s.
- **Score (wins only):** Beginner 1,000 + 20 per second under 60 s; Intermediate and Daily 3,000 + 15 per second under 240 s; Expert 8,000 + 12 per second under 600 s. One leaderboard per size plus Today's Daily.
- **Results:** time, 3BV (fewest clicks that clear the board), 3BV/s, click efficiency, hints. A loss shows every mine and crosses out wrong flags.
- **Rewards:** win Beginner 5 / Intermediate 20 / Expert 60 / Daily 25 coins; XP 20 × (1 / 2 / 4 / 2); token 2% / 8% / 25% / 10%. A loss gives 5 XP.

## 2048

- **Play:** arrow keys, WASD or swipe slide every tile. Two equal tiles that touch merge into one (each tile merges once per move), and a new 2 (90%) or 4 (10%) drops on an empty cell. The game ends when no move changes the board; you can keep going past 2048.
- **Modes:** Classic 4×4, **Big** 5×5 (points ×0.8), **Tiny** 3×3 (points ×2), and the **Daily** (Classic rules, the same tile drops for everyone that WIB day, one ranked try, no undo). One leaderboard per mode plus Today's Daily; each shows the player's biggest tile.
- **Score:** every merge adds the new tile's value, times the mode's multiplier.
- **Undo:** up to 3 per game (press Z), going back up to 3 moves. Undo games still rank, but don't count for the Pure Skill achievement.
- **Saved as you play:** moves go to the server every 10 moves and when you leave the tab. One unfinished game per player, kept for 24 hours after your last move; continue it on any device, or end it early and get it scored.
- **Anti-cheat:** the server picks the seed, and the browser and server drop tiles with the same random number generator (shared test vectors keep the Rust and TypeScript copies identical). The client sends only the move string (`U D L R`, `Z` = undo); the server replays it to get the score and the biggest tile. Saves must extend the saved moves, a move that changes nothing is rejected, and at most 25 moves per second are accepted.
- **Rewards:** same as Angry Bird for the points (1 coin per 1,000, 10–100 XP, token 3% → 15%), plus **+30 coins for a 2048 tile** and **+80 more and a 50% token chance for 4096**. Games shorter than 20 moves pay nothing and don't count for quests.
- Slide and merge animations (off with Light graphics), merge sounds, colorblind tile colors (numbers are always shown), and a results screen with points, biggest tile, moves, undos and time.

## Coins, tokens and levels

Only the server pays rewards, and only for results it verified itself, inside the same database transaction that records the result. Local 2-player games pay nothing.

| Game | Coins | XP | Token drop |
|------|-------|----|------------|
| Angry Bird, Whack-a-Mole | 1 per 1,000 points | 10 + up to 90 for big scores | 3% → 15% (bigger score, better chance) |
| Minefield win | Beginner 5 / Intermediate 20 / Expert 60 / Daily 25 | 20 × (1 / 2 / 4 / 2); loss 5 | 2% / 8% / 25% / 10% |
| 2048 (20+ moves) | 1 per 1,000 points; +30 for a 2048 tile, +80 more for 4096 | 10 + up to 90 for big scores | 3% → 15%; +50% for 4096 |
| Connect Four, each AI game | none | win 20 / draw 10 / loss 5, × difficulty (1–4) | none |
| Connect Four, series win | Easy 10 / Medium 25 / Hard 50 / Impossible 120 (×2 for best of 5) | bonus 25 × difficulty | 10% / 20% / 35% / 60% |
| Tic-Tac-Toe, each AI game | none | win 20 / draw 10 / loss 5, × difficulty (1–3) | none |
| Tic-Tac-Toe, series | win: Easy 5 / Medium 15 / Hard 40; drawn Hard series 15 (×2 for best of 5) | bonus 20 × difficulty | 8% / 15% / 50% (drawn Hard 15%) |

- **Daily cap:** at most 1,000 coins per day from games (resets 00:00 WIB, UTC+7). XP and tokens are not capped.
- **Levels:** level 1 → 2 needs 100 XP, and each level needs 50 more than the one before.
- Every change is recorded in `wallet_ledger` for auditing.

### Daily login reward

A pop-up offers the reward when you open the site. Claim once per day (days start at 00:00 WIB). Claiming on consecutive days grows a 7-day streak; missing a day starts it over at day 1, and after day 7 it starts again at day 1. Login coins don't count toward the daily cap.

| Day | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|-----|---|---|---|---|---|---|---|
| Coins | 10 | 15 | 20 | 25 | 30 | 40 | 100 + 1 token |

### Daily quests

Every day (00:00 WIB) you get 3 different random quests, shown on the Hub and on the **Quests** page (`/quests`). The nav shows a badge when one is ready to claim. Only results the server verified count: AI games, Angry Bird, Whack-a-Mole, Minefield and 2048 results, and mystery boxes. Local 2-player games don't count.

- Press **Claim** on a finished quest to get its coins + XP. Claiming all 3 pays a bonus **1 token**.
- **Reroll:** once per day, swap one unfinished quest for a new random one.
- Quest coins don't count toward the daily cap (at most 180 coins a day from quests).

| Quest | Coins | XP |
|-------|-------|----|
| Play 3 Connect Four games vs the AI | 20 | 30 |
| Win 2 Connect Four games vs Medium or harder | 40 | 60 |
| Win a Connect Four series vs Hard or Impossible | 60 | 100 |
| Play 3 Tic-Tac-Toe games vs the AI | 20 | 30 |
| Win or draw 2 Tic-Tac-Toe games vs Hard | 40 | 60 |
| Win a Tic-Tac-Toe series vs Medium | 40 | 60 |
| Play 3 Angry Bird rounds | 20 | 30 |
| Score 5,000 in one Angry Bird round | 40 | 60 |
| Score 15,000 in total in Angry Bird today | 50 | 80 |
| Win any series without using undo | 50 | 80 |
| Open a mystery box | 30 | 40 |
| Win 5 AI games in any game | 60 | 100 |
| Play 3 Whack-a-Mole rounds | 20 | 30 |
| Score 5,000 in one Whack-a-Mole round | 40 | 60 |
| Hit 5 golden moles today | 40 | 60 |
| Clear 2 Minefield boards | 20 | 30 |
| Clear an Intermediate or harder Minefield board | 40 | 60 |
| Clear a Minefield board without hints | 30 | 40 |
| Play 3 games of 2048 | 20 | 30 |
| Make a 512 tile in 2048 | 40 | 60 |
| Score 10,000 in one game of 2048 | 40 | 60 |

## Achievements

The `/achievements` page lists 38 one-time achievements with progress bars; locked ones are visible too. The server works out progress from results it already verified (matches, scores, the coin ledger, owned items, login and quest history), so progress made before achievements existed counts as well. Press **Claim** to get the coins, the same amount of XP, and a **title** to wear. Achievement coins don't count toward the daily cap. Claimed achievements show on your public profile.

| Achievement | Coins | Title |
|-------------|-------|-------|
| Win your first Connect Four series | 30 | Chip Dropper |
| Win a Connect Four series vs Medium or harder | 40 | Four Thinker |
| Win a Connect Four series vs Hard or harder | 80 | Grid Breaker |
| Win a Connect Four series vs Impossible | 300 | The Impossible |
| Win a best-of-5 Connect Four series 3–0 | 100 | Flawless |
| Own all 10 Connect Four skins | 200 | Collector |
| Win your first Tic-Tac-Toe series | 30 | X Marks It |
| Draw a whole Hard Tic-Tac-Toe series | 100 | Unbreakable |
| Own every Tic-Tac-Toe board and face | 200 | Board Baron |
| Add a photo face | 20 | Say Cheese |
| Finish your first Angry Bird round | 20 | Fledgling |
| Score 10,000 in one Angry Bird round | 80 | Sharpshooter |
| Score 25,000 in one Angry Bird round | 200 | Pig Slayer |
| Unlock every bird | 150 | Flock Leader |
| Finish your first Whack-a-Mole round | 20 | First Bonk |
| Reach FEVER in Whack-a-Mole | 80 | Fever Pitch |
| Score 10,000 in one Whack-a-Mole round | 150 | Mole Master |
| Last 2 minutes in Whack-a-Mole Survival | 150 | Survivor |
| Knock out a boss mole in Whack-a-Mole | 100 | Boss Breaker |
| Clear your first Minefield board | 20 | First Sweep |
| Clear an Expert Minefield board | 150 | Expert Sweeper |
| Clear a Beginner Minefield board in under 20 seconds | 80 | Speed Sweeper |
| Clear 5 Daily Minefield boards | 100 | Daily Devotee |
| Finish your first game of 2048 | 20 | First Slide |
| Make a 2048 tile | 150 | 2048! |
| Make a 4096 tile | 300 | Tile Tycoon |
| Make a 2048 tile without using undo | 200 | Pure Skill |
| Reach level 5 / 10 / 25 | 50 / 150 / 400 | Rising Star / Veteran / Living Legend |
| Spin the token wheel | 30 | Wheel Spinner |
| Open 10 mystery boxes | 100 | Box Hunter |
| Wear 10 non-starter items at once | 30 | Stylish |
| Own 50 items beyond the starter set | 150 | Fashion Icon |
| Spend 5,000 coins in total | 150 | High Roller |
| Reach a 7-day login streak | 100 | Loyal |
| Claim 10 daily quests | 60 | Adventurer |
| Finish all 3 daily quests in one day, 7 times | 200 | Quest Master |

### Title looks

Every title has a tier. Harder titles get a stronger look:

| Tier | Look | Used by |
|------|------|---------|
| Bronze | colored text, dashed border | common titles |
| Silver | color + element icon | rare titles |
| Gold | color + icon + glow | epic titles |
| Mythic | icon + animation (flicker, shimmer, sparkle, metal shine, flame, rainbow, coin shine, heartbeat, rising stars) | legendary titles |

Titles show in the wardrobe, on public profiles and next to names on leaderboards. The "Light graphics" setting stops the animations and keeps the colors.

## Character, shop and profiles

Every player has a pixel-art character with **23 slots** and **196 items**, drawn in code (no image files). The catalog lives in `shared/character_items.json`, and both the backend and the frontend read that same file, so prices and unlock rules can't drift apart.

| Group | Slots |
|-------|-------|
| Body (all free at start) | skin, eyes, eyebrows, mouth, hair, hair color, facial hair |
| Head | hat, glasses, mask, earrings |
| Clothes | shirt, jacket, pants, shoes, gloves |
| Extras | necklace, back (cape/wings/backpack), held item, pet |
| Profile | background, frame, title |

There are four ways to get an item:
- **Starter:** owned by everyone.
- **Level:** owned automatically when you reach that level. The level-up pop-up shows what you just unlocked.
- **Coins:** buy it in the shop.
- **Token wheel:** wheel-only exclusives at 1 token per spin (Rare 50%, Epic 38%, Legendary 12%). Landing on an item you own re-spins for free, so you never get a duplicate.

The shop also sells a **mystery box** for 250 coins. It gives a random shop item, and a duplicate refunds half its price.

You can save up to **3 outfit presets**. Your public profile at `/u/<name>` shows your character, level, items and game stats, and leaderboards show each player's face. Profiles never show email or coin balances.

The server checks every outfit: you can only wear items you own, in the slot they belong to, and required slots can't be left empty.

## Connect Four

- **Modes:** vs AI (Easy, Medium, Hard, Impossible) or local 2-player on one device. Player 1 always moves first.
- **Series:** best of 3 or best of 5. Draws don't count toward the series.
- **Turn timer** (Settings: off / 10s / 20s / 30s): when it runs out, a random move is played.
- **Undo** (AI only): max 3 per game, disabled on Impossible. Using undo in a series forfeits its reward spin.
- **Anti-cheat:** AI matches run entirely on the server. The client sends a column number; the server validates it, plays the AI reply, and decides wins, points and spins. Local 2-player games give no points or spins.
- **Points:** winning a series earns Easy 1 / Medium 3 / Hard 6 / Impossible 15 points (doubled for best of 5). The leaderboard shows each player's total.
- **Skins & spin wheel:** winning a series without undo grants one spin. Landing on a skin you already own re-spins for free.

| Skin | Rarity |
|------|--------|
| Classic Red, Classic Blue | Common (starter, free) |
| Lime Green | Common |
| Royal Purple, Red Bird, Piggy | Rare |
| Bomb Bird, Golden Egg, TNT Crate | Epic |
| Golden | Legendary |

| Spin odds  | Common | Rare | Epic | Legendary |
|------------|--------|------|------|-----------|
| Easy       | 50%    | 35%  | 12%  | 3%        |
| Medium     | 30%    | 45%  | 20%  | 5%        |
| Hard       | 10%    | 45%  | 35%  | 10%       |
| Impossible | 0%     | 0%   | 75%  | 25%       |

## Prerequisites

- PostgreSQL 16+ (installed locally, or Docker + Docker Compose)
- Rust (stable) + Cargo
- Node.js 18+ and npm

## Quick start (local dev)

1. Make sure Postgres is running on `localhost:5432`, with the user, password and database from `backend/.env.example` (`DATABASE_URL`). Use one of these:
   - **Local install (Windows, macOS, Linux):** start the PostgreSQL service. On Windows it starts with the computer.
   - **Docker:**
     ```bash
     docker compose up -d db
     ```
     Run only one of them: both use port 5432.
2. Backend (applies database migrations on start):
   ```bash
   cd backend
   cp .env.example .env
   cargo run
   ```
   API listens on `http://localhost:8080`.
3. Frontend:
   ```bash
   cd frontend
   cp .env.example .env
   npm install
   npm run dev
   ```
   App served on `http://localhost:5173`.

## Tests

```bash
cd backend;  cargo test
cd frontend; npm test
```

## Project layout

```
zero_signal/
├── docker-compose.yml          # local Postgres
├── shared/
│   ├── character_items.json    # character slots + items (read by backend AND frontend)
│   └── tic_tac_toe_items.json  # boards + faces (read by backend AND frontend)
├── backend/                    # Rust + Axum API
│   ├── migrations/             # sqlx SQL migrations
│   └── src/
│       ├── games.rs            # game catalog (allowed game ids)
│       ├── scores.rs           # per-game leaderboards + Angry Bird scorer
│       ├── economy.rs          # coins, tokens, XP/levels, daily cap, ledger
│       ├── daily.rs            # WIB (UTC+7) day boundary for everything daily
│       ├── daily_login.rs      # 7-day login streak reward
│       ├── quests/             # daily quest pool, progress hooks, claim/reroll API
│       ├── achievements.rs     # 38 achievements, live progress, claim + titles
│       ├── character/          # item catalog, outfits, presets, shop, profiles
│       ├── tic_tac_toe/        # rules, perfect AI, matches, boards/faces, photo
│       ├── whack_a_mole/       # seeded mole schedule, tap replay scorer, runs API
│       ├── minefield/          # no-guess board generator + solver, games API
│       ├── game_2048/          # board, seeded tile drops, undo, move replay scorer, runs API
│       ├── connect_four/       # rules (bitboard), AI, skins/spins, match API
│       └── physics/            # rapier2d authoritative simulation
└── frontend/                   # React + TS
    └── src/
        ├── platform/           # GameModule contract + registry
        ├── games/<id>/         # one self-contained folder per game
        └── pages/              # Hub, PlayGame, Leaderboard, auth
```

## API

| Method | Path | Notes |
|--------|------|-------|
| POST | `/api/auth/guest` | start a guest session; returns a guest JWT (20 per hour per IP) |
| POST | `/api/auth/register` | create account; with a guest token, the guest becomes the account (`kept_guest_progress`) |
| POST | `/api/auth/login` | returns JWT; with a guest token, the guest's results move in (`merged`) |
| GET  | `/api/me` | your account (`is_guest`); guests also get a refreshed token; 401 while a deletion is pending |
| GET  | `/api/me/account` | username, email, join date, next allowed rename (members) |
| PUT  | `/api/me/password` | `{current_password, new_password}` (members) |
| PUT  | `/api/me/email` | `{current_password, email}` (members) |
| PUT  | `/api/me/username` | `{username}`; once per 30 days; returns a new token (members) |
| POST | `/api/me/delete` | `{current_password, confirm_username}`; deleted after 7 days, logging in cancels (members) |
| GET  | `/api/me/wallet` | coins, tokens, XP, level, coins earned today (auth) |
| GET  | `/api/me/stats` | your records in every game, for the Stats page (auth) |
| GET  | `/api/me/weekly-prizes` | your top-3 places last week and whether they're claimed (auth) |
| POST | `/api/me/weekly-prizes/claim` | claim every unclaimed weekly prize (auth) |
| GET  | `/api/me/daily-login` | login streak status and the 7-day reward table (auth) |
| POST | `/api/me/daily-login/claim` | claim today's login reward, once per WIB day (auth) |
| GET  | `/api/me/quests` | today's 3 quests, progress, reroll and bonus status (auth) |
| POST | `/api/me/quests/:slot/claim` | claim a finished quest; the 3rd claim adds the bonus token (auth) |
| POST | `/api/me/quests/:slot/reroll` | swap one unfinished quest, once per day (auth) |
| GET  | `/api/me/achievements` | all 38 achievements with live progress (auth) |
| POST | `/api/me/achievements/:id/claim` | claim an unlocked achievement: coins + XP + title (auth) |
| GET  | `/api/me/character` | outfit, owned items, presets, wallet (auth) |
| PUT  | `/api/me/character/loadout` | wear an outfit (server checks ownership) (auth) |
| PUT  | `/api/me/character/presets/:n` | save outfit preset 1–3 (auth) |
| POST | `/api/shop/buy` | `{item_id}` buy a coin item (auth) |
| POST | `/api/shop/mystery-box` | 250 coins for a random shop item (auth) |
| POST | `/api/shop/wheel` | 1 token for a wheel exclusive (auth) |
| GET  | `/api/users/:username/profile` | public profile |
| POST | `/api/games/tic-tac-toe/matches` | start an AI series `{difficulty, best_of, face, board}` (auth) |
| POST | `/api/games/tic-tac-toe/matches/:id/move` | `{cell}` 0–8; server replies with the AI move (auth) |
| POST | `/api/games/tic-tac-toe/matches/:id/{undo,next,forfeit}` | same as Connect Four (auth) |
| GET  | `/api/games/tic-tac-toe/collection` | boards, faces, spins, has_photo (auth) |
| POST | `/api/games/tic-tac-toe/buy` | `{kind, id}` buy a board or face (auth) |
| POST | `/api/games/tic-tac-toe/spins` | spend a reward spin (auth) |
| GET/PUT/DELETE | `/api/me/photo` | your private photo face (raw image body) (auth) |
| GET  | `/api/games` | catalog |
| GET  | `/api/games/:id/leaderboard` | top 20 for that game; `?period=` `all`, `today`, `week` or `last_week`; `?level=` picks one board (Whack-a-Mole: 1 Classic, 2 Frenzy, 3 Survival, 4 Daily; Minefield: 1 Beginner, 2 Intermediate, 3 Expert, 4 Daily; 2048: 1 Classic, 2 Big, 3 Tiny, 4 Daily), `period=today` keeps today only; entries may carry a `detail` (2048: biggest tile) |
| GET  | `/api/games/:id/scores/me` | your history (auth) |
| POST | `/api/games/angry-bird/scores` | shot inputs only; server computes score (auth) |
| GET  | `/api/games/angry-bird/birds` | bird catalog + unlocks |
| POST | `/api/games/whack-a-mole/runs` | `{mode, grid, hammer?, theme?}` start a run; returns `run_id` + `seed` (auth) |
| GET  | `/api/games/whack-a-mole/collection` | hammers and themes with prices and what you own (auth) |
| POST | `/api/games/whack-a-mole/buy` | `{kind: "hammer"\|"theme", id}` buy with coins (auth) |
| POST | `/api/games/whack-a-mole/runs/:id/finish` | `{taps:[{t, hole}]}`; server replays and scores, pays rewards (auth) |
| POST | `/api/games/minefield/games` | `{difficulty}` new game; Daily returns today's board (auth) |
| GET  | `/api/games/minefield/games/active` | your unfinished game, or null (auth) |
| POST | `/api/games/minefield/games/:id/reveal` | `{cell}`; the first one builds the board (auth) |
| POST | `/api/games/minefield/games/:id/chord` | `{cell, flags}` open around a number (auth) |
| POST | `/api/games/minefield/games/:id/{hint,forfeit}` | open a safe cell (+20 s) / give up (auth) |
| POST | `/api/games/2048/runs` | `{mode}` start a game; returns `run_id`, `seed`, `size`, `undos` (Daily: continues today's if open) (auth) |
| GET  | `/api/games/2048/runs/active` | your unfinished game with its saved moves, or null (auth) |
| POST | `/api/games/2048/runs/:id/save` | `{moves}` save progress; must extend the saved moves (auth) |
| POST | `/api/games/2048/runs/:id/finish` | `{moves}`; server replays and scores, pays rewards (auth) |
| POST | `/api/games/connect-four/matches` | start an AI series `{difficulty, best_of, skin}` (auth) |
| GET  | `/api/games/connect-four/matches/active` | resume your unfinished series (auth) |
| POST | `/api/games/connect-four/matches/:id/move` | `{column}`; server replies with the AI move (auth) |
| POST | `/api/games/connect-four/matches/:id/undo` | undo your last move + AI reply (auth) |
| POST | `/api/games/connect-four/matches/:id/next` | start the next game of the series (auth) |
| POST | `/api/games/connect-four/matches/:id/forfeit` | give up the series (auth) |
| GET  | `/api/games/connect-four/skins` | skin collection + unspent spins (auth) |
| POST | `/api/games/connect-four/spins` | spend a spin; server rolls the result (auth) |

Guests (`is_guest`) get **403** from account-only endpoints: wardrobe and presets, shop, mystery box, item wheel, daily login claim, quest claim/reroll, achievement claim, weekly prize claim and the photo upload.

## Adding a game

1. Backend: add a `GameInfo` to `backend/src/games.rs` (`ComingSoon` first).
2. Frontend: create `frontend/src/games/<id>/index.ts` exporting a `GameModule`, and add it to `GAMES` in `src/platform/registry.ts`. It appears on the hub as "coming soon"; its leaderboard already works.
3. To go live: add a lazy `Play` component, set status `live`, and add a server handler that **computes the score from player inputs** (never accept a client-sent score).

`npm test` fails if the frontend and backend game lists drift apart.

## Angry Bird: bird unlock thresholds

| Bird      | Color      | Ability             | Unlock (best score) |
|-----------|------------|---------------------|---------------------|
| Red       | red        | balanced            | 0 (default)         |
| Chuck     | yellow     | speed dash          | 2,000               |
| Bomb      | black      | explode on tap      | 5,000               |
| Matilda   | white      | drop egg bomb       | 9,000               |
| Terence   | dark red   | heavy mass          | 15,000              |
| Blues     | blue       | split into 3        | 22,000              |
