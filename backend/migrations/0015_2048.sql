-- 2048 runs. `start` stores the seed; `save` and `finish` replay the move
-- string against it, so the score is always computed by the server.
CREATE TABLE IF NOT EXISTS g2048_runs (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mode        VARCHAR(8)  NOT NULL CHECK (mode IN ('classic', 'big', 'tiny', 'daily')),
    -- A u32 seed.
    seed        BIGINT      NOT NULL CHECK (seed BETWEEN 0 AND 4294967295),
    -- WIB day of a Daily run (one per player per day); NULL for other modes.
    day         DATE,
    -- Moves so far: U D L R, Z = undo. Append-only.
    moves       TEXT        NOT NULL DEFAULT '',
    score       INTEGER     NOT NULL DEFAULT 0,
    -- Score after the mode multiplier (what the leaderboard shows).
    points      INTEGER     NOT NULL DEFAULT 0,
    max_tile    INTEGER     NOT NULL DEFAULT 0,
    undos_used  SMALLINT    NOT NULL DEFAULT 0,
    game_over   BOOLEAN     NOT NULL DEFAULT FALSE,
    -- Left unfinished for 24 h: closed without a score.
    abandoned   BOOLEAN     NOT NULL DEFAULT FALSE,
    started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_g2048_runs_user ON g2048_runs (user_id, started_at DESC);
-- One unfinished game per player, one Daily per player per day.
CREATE UNIQUE INDEX IF NOT EXISTS uq_g2048_one_active ON g2048_runs (user_id) WHERE finished_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_g2048_daily ON g2048_runs (user_id, day) WHERE mode = 'daily';

-- A short extra shown next to a leaderboard score (2048: the biggest tile).
ALTER TABLE scores ADD COLUMN IF NOT EXISTS detail VARCHAR(32);
