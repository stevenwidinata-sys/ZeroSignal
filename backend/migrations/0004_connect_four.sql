-- Connect Four: server-authoritative AI matches, chip skins and reward spins.

-- One row per best-of series against the AI. The server owns the board
-- (`moves` = digit string of columns), so clients can't fake results.
CREATE TABLE IF NOT EXISTS cf_matches (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    difficulty     VARCHAR(16) NOT NULL
                   CHECK (difficulty IN ('easy', 'medium', 'hard', 'impossible')),
    best_of        SMALLINT    NOT NULL CHECK (best_of IN (3, 5)),
    skin           VARCHAR(32) NOT NULL,
    user_wins      SMALLINT    NOT NULL DEFAULT 0 CHECK (user_wins >= 0),
    ai_wins        SMALLINT    NOT NULL DEFAULT 0 CHECK (ai_wins >= 0),
    draws          SMALLINT    NOT NULL DEFAULT 0 CHECK (draws >= 0),
    moves          VARCHAR(42) NOT NULL DEFAULT '' CHECK (moves ~ '^[0-6]*$'),
    game_over      BOOLEAN     NOT NULL DEFAULT FALSE,
    -- Undos used in the current game (max 3) and whether any were ever used
    -- in this series (an undo forfeits the reward spin).
    undos_used     SMALLINT    NOT NULL DEFAULT 0 CHECK (undos_used BETWEEN 0 AND 3),
    used_undo      BOOLEAN     NOT NULL DEFAULT FALSE,
    status         VARCHAR(16) NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active', 'won', 'lost', 'forfeited')),
    points         INTEGER     NOT NULL DEFAULT 0 CHECK (points >= 0),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- At most one active series per user.
CREATE UNIQUE INDEX IF NOT EXISTS idx_cf_matches_one_active
    ON cf_matches (user_id) WHERE status = 'active';

-- Skins a user has won (the free starter skins are implicit, not stored).
CREATE TABLE IF NOT EXISTS user_skins (
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    skin_id     VARCHAR(32) NOT NULL,
    acquired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, skin_id)
);

-- Reward spins: granted by the server when a series is won without undo.
-- `match_id` is UNIQUE so a series can never pay out twice.
CREATE TABLE IF NOT EXISTS cf_spins (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    match_id    UUID        NOT NULL UNIQUE REFERENCES cf_matches(id) ON DELETE CASCADE,
    difficulty  VARCHAR(16) NOT NULL,
    result_skin VARCHAR(32),
    spun_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cf_spins_unspent ON cf_spins (user_id) WHERE spun_at IS NULL;
