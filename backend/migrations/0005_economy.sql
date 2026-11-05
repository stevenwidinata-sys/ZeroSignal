-- Player economy shared by every game: coins, tokens and XP.
-- Only the server writes here, and only from server-verified game results.

-- One wallet per user, created lazily on the first reward or read.
CREATE TABLE IF NOT EXISTS wallets (
    user_id    UUID        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    coins      BIGINT      NOT NULL DEFAULT 0 CHECK (coins >= 0),
    tokens     INTEGER     NOT NULL DEFAULT 0 CHECK (tokens >= 0),
    xp         BIGINT      NOT NULL DEFAULT 0 CHECK (xp >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Audit trail of every change (positive = earned, negative = spent).
-- `counts_to_cap` marks game rewards that count toward the daily coin cap.
CREATE TABLE IF NOT EXISTS wallet_ledger (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason        VARCHAR(48) NOT NULL,
    coins         BIGINT      NOT NULL DEFAULT 0,
    tokens        INTEGER     NOT NULL DEFAULT 0,
    xp            BIGINT      NOT NULL DEFAULT 0,
    counts_to_cap BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wallet_ledger_user_time
    ON wallet_ledger (user_id, created_at DESC);
