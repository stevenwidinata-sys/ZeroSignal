-- Daily quests. One `daily_quest_days` row per user per WIB day (also the
-- lock that serializes progress, claims and rerolls), plus 3 quest slots.
CREATE TABLE IF NOT EXISTS daily_quest_days (
    user_id       UUID    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day           DATE    NOT NULL,
    rerolled      BOOLEAN NOT NULL DEFAULT FALSE,
    bonus_claimed BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (user_id, day)
);

CREATE TABLE IF NOT EXISTS daily_quests (
    user_id    UUID        NOT NULL,
    day        DATE        NOT NULL,
    slot       SMALLINT    NOT NULL CHECK (slot BETWEEN 0 AND 2),
    quest_id   VARCHAR(32) NOT NULL,
    progress   INTEGER     NOT NULL DEFAULT 0 CHECK (progress >= 0),
    target     INTEGER     NOT NULL CHECK (target > 0),
    claimed_at TIMESTAMPTZ,
    PRIMARY KEY (user_id, day, slot),
    FOREIGN KEY (user_id, day) REFERENCES daily_quest_days (user_id, day) ON DELETE CASCADE
);
