-- Whack-a-Mole runs. `start` stores the seed; `finish` replays the player's
-- taps against it, so the score is always computed by the server.
CREATE TABLE IF NOT EXISTS wam_runs (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mode        VARCHAR(16) NOT NULL CHECK (mode IN ('classic', 'frenzy', 'survival', 'daily')),
    grid        SMALLINT    NOT NULL CHECK (grid IN (3, 4)),
    -- A u32 seed.
    seed        BIGINT      NOT NULL CHECK (seed BETWEEN 0 AND 4294967295),
    started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ,
    score       INTEGER,
    best_streak INTEGER,
    golden_hits INTEGER,
    fever       BOOLEAN,
    -- When the round ended, in ms of game time (Survival: how long you lasted).
    ended_ms    INTEGER
);

CREATE INDEX IF NOT EXISTS idx_wam_runs_user ON wam_runs (user_id, started_at DESC);
