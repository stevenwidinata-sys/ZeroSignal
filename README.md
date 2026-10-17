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
| Tic-Tac-Toe  | Coming soon | |

## Features

- Register / login (Argon2 password hashing + JWT auth). Browsing the hub and leaderboards is open; playing requires an account.
- Per-game leaderboards and personal history.
- Anti-cheat by design: clients send only player *inputs*; the server computes every score.
- Dark / light theme and a settings panel (sound, volume, light graphics, turn timer), saved in the browser.

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
├── backend/                    # Rust + Axum API
│   ├── migrations/             # sqlx SQL migrations
│   └── src/
│       ├── games.rs            # game catalog (allowed game ids)
│       ├── scores.rs           # per-game leaderboards + Angry Bird scorer
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
