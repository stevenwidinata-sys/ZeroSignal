-- Daily login reward: one row per claimed WIB day.
-- The primary key makes claiming the same day twice impossible.
CREATE TABLE IF NOT EXISTS login_claims (
    user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day        DATE        NOT NULL,
    -- Position in the 7-day streak (1..7) this claim paid.
    streak_day SMALLINT    NOT NULL CHECK (streak_day BETWEEN 1 AND 7),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, day)
);
