-- Guest play: anyone can play before registering. A guest is a normal user
-- row (so every game works unchanged) with a placeholder name/email and no
-- usable password. Registering turns it into a real account; guests not
-- seen for 30 days are deleted.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_guest BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_users_guest_seen ON users (last_seen_at) WHERE is_guest;
