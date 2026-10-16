-- Multi-game platform: every score belongs to a game, and each game has its
-- own leaderboard. Existing rows were all Angry Bird, so they backfill to it.
ALTER TABLE scores
    ADD COLUMN IF NOT EXISTS game_id VARCHAR(64) NOT NULL DEFAULT 'angry-bird';

ALTER TABLE scores
    ADD CONSTRAINT scores_game_id_format CHECK (game_id ~ '^[a-z0-9-]{1,64}$');

-- bird_variant is Angry Bird specific; other games leave it NULL.
ALTER TABLE scores ALTER COLUMN bird_variant DROP NOT NULL;
ALTER TABLE scores ALTER COLUMN bird_variant DROP DEFAULT;

-- Per-game leaderboard and per-user history lookups.
CREATE INDEX IF NOT EXISTS idx_scores_game_score ON scores (game_id, score DESC);
CREATE INDEX IF NOT EXISTS idx_scores_game_user  ON scores (game_id, user_id);
