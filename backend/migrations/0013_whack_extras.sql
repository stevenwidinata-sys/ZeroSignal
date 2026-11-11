-- Whack-a-Mole extras: owned hammers/themes, and boss knock-outs per run.
CREATE TABLE IF NOT EXISTS wam_items (
    user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- "hammer:<id>" or "theme:<id>" (catalog: shared/whack_items.json).
    item_key   VARCHAR(64) NOT NULL,
    source     VARCHAR(8)  NOT NULL CHECK (source IN ('shop', 'drop')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, item_key)
);

ALTER TABLE wam_runs ADD COLUMN IF NOT EXISTS bosses_beaten INTEGER;
ALTER TABLE wam_runs ADD COLUMN IF NOT EXISTS hammer VARCHAR(32);
ALTER TABLE wam_runs ADD COLUMN IF NOT EXISTS theme VARCHAR(32);
