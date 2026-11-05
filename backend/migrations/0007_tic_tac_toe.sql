-- Tic-Tac-Toe: server-run AI series, owned boards/faces, reward spins, and
-- private player photos used as a custom face.

CREATE TABLE IF NOT EXISTS ttt_matches (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    difficulty  VARCHAR(16) NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
    best_of     SMALLINT    NOT NULL CHECK (best_of IN (3, 5)),
    face        VARCHAR(32) NOT NULL,
    board       VARCHAR(32) NOT NULL,
    user_wins   SMALLINT    NOT NULL DEFAULT 0 CHECK (user_wins >= 0),
    ai_wins     SMALLINT    NOT NULL DEFAULT 0 CHECK (ai_wins >= 0),
    draws       SMALLINT    NOT NULL DEFAULT 0 CHECK (draws >= 0),
    moves       VARCHAR(9)  NOT NULL DEFAULT '' CHECK (moves ~ '^[0-8]*$'),
    game_over   BOOLEAN     NOT NULL DEFAULT FALSE,
    undos_used  SMALLINT    NOT NULL DEFAULT 0 CHECK (undos_used BETWEEN 0 AND 3),
    used_undo   BOOLEAN     NOT NULL DEFAULT FALSE,
    status      VARCHAR(16) NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'won', 'lost', 'drawn', 'forfeited')),
    points      INTEGER     NOT NULL DEFAULT 0 CHECK (points >= 0),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ttt_matches_one_active
    ON ttt_matches (user_id) WHERE status = 'active';

-- Bought or won boards/faces, keyed "board:<id>" or "face:<id>".
CREATE TABLE IF NOT EXISTS ttt_items (
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_key    VARCHAR(48) NOT NULL,
    source      VARCHAR(16) NOT NULL CHECK (source IN ('shop', 'spin')),
    acquired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, item_key)
);

-- One reward spin per finished series (UNIQUE match_id = no double payout).
CREATE TABLE IF NOT EXISTS ttt_spins (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    match_id    UUID        NOT NULL UNIQUE REFERENCES ttt_matches(id) ON DELETE CASCADE,
    difficulty  VARCHAR(16) NOT NULL,
    result_key  VARCHAR(48),
    spun_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ttt_spins_unspent ON ttt_spins (user_id) WHERE spun_at IS NULL;

-- A player's own photo (already cropped to a small square in the browser).
-- Private: only ever served back to its owner. Deleted with the account.
CREATE TABLE IF NOT EXISTS user_photos (
    user_id    UUID        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    mime       VARCHAR(16) NOT NULL CHECK (mime IN ('image/jpeg', 'image/png', 'image/webp')),
    data       BYTEA       NOT NULL CHECK (octet_length(data) <= 65536),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
