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
| Whack-a-Mole | Coming soon | |

## Features

- Register / login (Argon2 password hashing + JWT auth). Browsing the hub and leaderboards is open; playing requires an account.
- Per-game leaderboards and personal history.
- Anti-cheat by design: clients send only player *inputs*; the server computes every score.
- Dark / light theme and a settings panel (sound, volume, music, light graphics, colorblind-friendly, turn timer), saved in the browser.
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

## Coins, tokens and levels

Only the server pays rewards, and only for results it verified itself, inside the same database transaction that records the result. Local 2-player games pay nothing.

| Game | Coins | XP | Token drop |
|------|-------|----|------------|
| Angry Bird | 1 per 1,000 points | 10 + up to 90 for big scores | 3% → 15% (bigger score, better chance) |
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

Every day (00:00 WIB) you get 3 different random quests, shown on the Hub and on the **Quests** page (`/quests`). The nav shows a badge when one is ready to claim. Only results the server verified count: AI games, Angry Bird rounds and mystery boxes. Local 2-player games don't count.

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

## Achievements

The `/achievements` page lists 25 one-time achievements with progress bars; locked ones are visible too. The server works out progress from results it already verified (matches, scores, the coin ledger, owned items, login and quest history), so progress made before achievements existed counts as well. Press **Claim** to get the coins, the same amount of XP, and a **title** to wear. Achievement coins don't count toward the daily cap. Claimed achievements show on your public profile.

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

Every player has a pixel-art character with **23 slots** and **183 items**, drawn in code (no image files). The catalog lives in `shared/character_items.json`, and both the backend and the frontend read that same file, so prices and unlock rules can't drift apart.

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

- Docker + Docker Compose
- Rust (stable) + Cargo
- Node.js 18+ and npm

## Quick start (local dev)

1. Start Postgres:
   ```bash
   docker compose up -d db
   ```
2. Backend:
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
│       ├── achievements.rs     # 25 achievements, live progress, claim + titles
│       ├── character/          # item catalog, outfits, presets, shop, profiles
│       ├── tic_tac_toe/        # rules, perfect AI, matches, boards/faces, photo
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
| POST | `/api/auth/register` | create account |
| POST | `/api/auth/login` | returns JWT |
| GET  | `/api/me/wallet` | coins, tokens, XP, level, coins earned today (auth) |
| GET  | `/api/me/daily-login` | login streak status and the 7-day reward table (auth) |
| POST | `/api/me/daily-login/claim` | claim today's login reward, once per WIB day (auth) |
| GET  | `/api/me/quests` | today's 3 quests, progress, reroll and bonus status (auth) |
| POST | `/api/me/quests/:slot/claim` | claim a finished quest; the 3rd claim adds the bonus token (auth) |
| POST | `/api/me/quests/:slot/reroll` | swap one unfinished quest, once per day (auth) |
| GET  | `/api/me/achievements` | all 25 achievements with live progress (auth) |
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
| GET  | `/api/games/:id/leaderboard` | top 20 for that game |
| GET  | `/api/games/:id/scores/me` | your history (auth) |
| POST | `/api/games/angry-bird/scores` | shot inputs only; server computes score (auth) |
| GET  | `/api/games/angry-bird/birds` | bird catalog + unlocks |
| POST | `/api/games/connect-four/matches` | start an AI series `{difficulty, best_of, skin}` (auth) |
| GET  | `/api/games/connect-four/matches/active` | resume your unfinished series (auth) |
| POST | `/api/games/connect-four/matches/:id/move` | `{column}`; server replies with the AI move (auth) |
| POST | `/api/games/connect-four/matches/:id/undo` | undo your last move + AI reply (auth) |
| POST | `/api/games/connect-four/matches/:id/next` | start the next game of the series (auth) |
| POST | `/api/games/connect-four/matches/:id/forfeit` | give up the series (auth) |
| GET  | `/api/games/connect-four/skins` | skin collection + unspent spins (auth) |
| POST | `/api/games/connect-four/spins` | spend a spin; server rolls the result (auth) |

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
