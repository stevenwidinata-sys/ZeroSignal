# Angry Bird

A full-physics Angry Birds style game with **authoritative server-side scoring** (clients cannot cheat).

- **Frontend:** React + TypeScript + Vite + matter-js (visual physics)
- **Backend:** Rust + Axum + sqlx + rapier2d (authoritative physics & scoring)
- **Database:** PostgreSQL 16

## Features

- User register / login (Argon2 password hashing + JWT auth)
- Authoritative server-side physics: the client sends only shot *inputs*; the Rust server re-simulates with `rapier2d` and computes the real score. Clients cannot submit fake scores.
- Global leaderboard + personal score history
- 6 bird variants with distinct colors and abilities, **unlocked via score thresholds**
- Destructible structures and pigs, slingshot aiming

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

## Project layout

```
angry_bird/
├── docker-compose.yml          # local Postgres
├── backend/                    # Rust + Axum API
│   ├── migrations/             # sqlx SQL migrations (0003 = per-game scores)
│   └── src/
│       ├── games.rs            # game catalog (allowed game ids)
│       ├── scores.rs           # per-game leaderboards + Angry Bird scorer
│       └── physics/            # rapier2d authoritative simulation
└── frontend/                   # PIXELPLAY (React + TS)
    └── src/
        ├── platform/           # GameModule contract + registry
        ├── games/<id>/         # one self-contained folder per game
        └── pages/              # Hub, PlayGame, Leaderboard, auth
```

## API

| Method | Path | Notes |
|--------|------|-------|
| GET  | `/api/games` | catalog |
| GET  | `/api/games/:id/leaderboard` | top 20 for that game |
| GET  | `/api/games/:id/scores/me` | your history (auth) |
| POST | `/api/games/angry-bird/scores` | shot inputs only; server computes score (auth) |
| GET  | `/api/games/angry-bird/birds` | bird catalog + unlocks |

## Adding a game

1. Backend: add a `GameInfo` to `backend/src/games.rs` (`ComingSoon` first).
2. Frontend: create `frontend/src/games/<id>/index.ts` exporting a `GameModule`, and add it to `GAMES` in `src/platform/registry.ts`. It appears on the hub as "coming soon"; its leaderboard already works.
3. To go live: add a lazy `Play` component, set status `live`, and add a server handler at `POST /api/games/<id>/scores` that **computes the score from player inputs** (never accept a client-sent score).

`npm test` fails if the frontend and backend game lists drift apart.

## Bird unlock thresholds

| Bird      | Color      | Ability             | Unlock (best score) |
|-----------|------------|---------------------|---------------------|
| Red       | red        | balanced            | 0 (default)         |
| Chuck     | yellow     | speed dash          | 2,000               |
| Bomb      | black      | explode on tap      | 5,000               |
| Matilda   | white      | drop egg bomb       | 9,000               |
| Terence   | dark red   | heavy mass          | 15,000              |
| Blues     | blue       | split into 3        | 22,000              |
