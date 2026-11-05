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

## Features

- Register / login (Argon2 password hashing + JWT auth). Browsing the hub and leaderboards is open; playing requires an account.
- Per-game leaderboards and personal history.
- Anti-cheat by design: clients send only player *inputs*; the server computes every score.
- Dark / light theme and a settings panel (sound, volume, light graphics, turn timer), saved in the browser.
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

- **Daily cap:** at most 1,000 coins per day from games (resets 00:00 UTC). XP and tokens are not capped.
- **Levels:** level 1 → 2 needs 100 XP, and each level needs 50 more than the one before.
- Every change is recorded in `wallet_ledger` for auditing.

## Character, shop and profiles

Every player has a pixel-art character with **23 slots** and **158 items**, drawn in code (no image files). The catalog lives in `shared/character_items.json`, and both the backend and the frontend read that same file, so prices and unlock rules can't drift apart.

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
