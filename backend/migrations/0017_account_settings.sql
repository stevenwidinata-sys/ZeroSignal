-- Account settings: renames are limited to one per 30 days, and deleting an
-- account waits 7 days (logging in during that time cancels it).
ALTER TABLE users ADD COLUMN IF NOT EXISTS username_changed_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS delete_requested_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_delete_requested ON users (delete_requested_at) WHERE delete_requested_at IS NOT NULL;
