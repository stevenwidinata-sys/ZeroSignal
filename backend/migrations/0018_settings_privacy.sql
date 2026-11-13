-- Settings that follow a registered player to every device, and privacy
-- choices: hide from leaderboards (no weekly prizes then) and a private
-- profile (name only).
ALTER TABLE users ADD COLUMN IF NOT EXISTS settings JSONB;
ALTER TABLE users ADD COLUMN IF NOT EXISTS hide_on_leaderboards BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS private_profile BOOLEAN NOT NULL DEFAULT FALSE;
