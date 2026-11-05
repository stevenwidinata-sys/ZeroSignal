-- Player character: owned items, current outfit and saved outfit presets.
-- Item ids come from shared/character_items.json (validated by the server).

-- Items bought in the shop or won on the wheel. Starter and level items are
-- owned implicitly and never stored here.
CREATE TABLE IF NOT EXISTS user_items (
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_id     VARCHAR(48) NOT NULL,
    source      VARCHAR(16) NOT NULL CHECK (source IN ('shop', 'box', 'wheel')),
    acquired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, item_id)
);

-- The outfit currently worn: { "slot": "item-id", ... }.
CREATE TABLE IF NOT EXISTS avatars (
    user_id    UUID        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    loadout    JSONB       NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Up to three saved outfits per player.
CREATE TABLE IF NOT EXISTS outfit_presets (
    user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    slot_no    SMALLINT    NOT NULL CHECK (slot_no BETWEEN 1 AND 3),
    name       VARCHAR(24) NOT NULL,
    loadout    JSONB       NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, slot_no)
);
