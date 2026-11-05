-- Achievements: one row per claimed achievement. Progress is computed live
-- from data the server already verified, so nothing else needs storing.
CREATE TABLE IF NOT EXISTS user_achievements (
    user_id        UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    achievement_id VARCHAR(32) NOT NULL,
    claimed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, achievement_id)
);

-- Achievement titles are stored as owned character items.
ALTER TABLE user_items DROP CONSTRAINT IF EXISTS user_items_source_check;
ALTER TABLE user_items ADD CONSTRAINT user_items_source_check
    CHECK (source IN ('shop', 'box', 'wheel', 'achievement'));
