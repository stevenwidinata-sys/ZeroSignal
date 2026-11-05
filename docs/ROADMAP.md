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

## Phase 2 (in progress)

Branches, each merged into `main` after tests pass:
`feat/daily-rewards`, `feat/achievements`, `feat/music`, `feat/accessibility`.

### Daily day boundary
- Everything daily resets at **00:00 WIB (UTC+7)**: login reward, quests and
  the daily coin cap. The cap currently resets at 00:00 UTC and must move.

### Daily login reward (`feat/daily-rewards`)
- 7-day streak: day 1 = 10 coins, 2 = 15, 3 = 20, 4 = 25, 5 = 30, 6 = 40,
  7 = 100 coins + 1 token. After day 7 the streak restarts at day 1.
- Missing a day resets the streak to day 1.
- A pop-up with a "Claim" button appears when you open the site.
- Login rewards do **not** count toward the daily coin cap.

### Daily quests (`feat/daily-rewards`)
- 3 random quests per day from a pool, e.g. "Win 2 Connect Four games vs
  Medium or harder", "Play 3 Tic-Tac-Toe games vs the AI", "Score 5,000 in
  Angry Bird", "Win a series without undo", "Open a mystery box".
- Each pays 20 to 60 coins + XP. Completing all 3 gives a bonus token.
- Only server-verified results count. 1 free reroll per day.

### Achievements (`feat/achievements`)
- About 25 one-time achievements, e.g. "Beat Impossible", "Survive Hard
  Tic-Tac-Toe", "Collect every skin", "Reach level 10", "7-day login streak".
- Each pays coins + XP once; some unlock exclusive character titles
  (e.g. "Pig Slayer").
- Shown on the public profile.

### Background music (`feat/music`)
- Chiptune generated in code (Web Audio), no music files.
- 3 tracks: hub, calm (Tic-Tac-Toe / Connect Four), upbeat (Angry Bird).
- Separate music on/off + volume in Settings. Default **on at 40%**, starting
  after the first click (browsers block autoplay).

### Colorblind mode (`feat/accessibility`)
- One "colorblind-friendly" switch (option a): color-safe palette everyone can
  tell apart, plus shapes on top of colors (e.g. marks on Connect Four chips).

### Tutorials (`feat/accessibility`)
- Short 3–4 step "how to play" the first time each game is opened, plus a "?"
  button to see it again. Seen tutorials are remembered in the browser.

## Phase 3 (planned)

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
