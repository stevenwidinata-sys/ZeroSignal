-- Scores: one row per completed game. Score is computed authoritatively server-side.
CREATE TABLE IF NOT EXISTS scores (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    score        INTEGER     NOT NULL CHECK (score >= 0),
    level        INTEGER     NOT NULL DEFAULT 1 CHECK (level >= 1),
    bird_variant VARCHAR(32) NOT NULL DEFAULT 'red',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scores_score_desc ON scores (score DESC);
CREATE INDEX IF NOT EXISTS idx_scores_user       ON scores (user_id);
