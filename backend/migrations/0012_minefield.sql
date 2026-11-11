-- Minefield games. The mines live only here; the client sees opened cells.
CREATE TABLE IF NOT EXISTS mf_games (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    difficulty  VARCHAR(16) NOT NULL CHECK (difficulty IN ('beginner', 'intermediate', 'expert', 'daily')),
    -- new = waiting for the first click (the board is made then).
    status      VARCHAR(8)  NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'playing', 'won', 'lost')),
    -- WIB day of a Daily game (one per player per day).
    day         DATE,
    -- One byte per cell (1 = mine); NULL until the first click.
    mines       BYTEA,
    -- One byte per cell (1 = opened).
    opened      BYTEA       NOT NULL,
    hints       SMALLINT    NOT NULL DEFAULT 0,
    clicks      INTEGER     NOT NULL DEFAULT 0,
    three_bv    INTEGER,
    -- The mine that ended a lost game.
    exploded    INTEGER,
    time_ms     INTEGER,
    score       INTEGER,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at  TIMESTAMPTZ,
    finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_mf_games_user ON mf_games (user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mf_one_daily ON mf_games (user_id, day) WHERE difficulty = 'daily';
