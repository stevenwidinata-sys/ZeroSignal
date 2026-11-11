-- Weekly leaderboards.
-- `gained` = points this result added. Best-score games: the score itself.
-- Connect Four / Tic-Tac-Toe rows hold running totals, so gained is the
-- difference from the player's previous row (backfilled here).
ALTER TABLE scores ADD COLUMN IF NOT EXISTS gained INTEGER;

UPDATE scores s SET gained = d.gained
FROM (
    SELECT id,
           score - COALESCE(LAG(score) OVER (PARTITION BY user_id, game_id ORDER BY created_at, score), 0) AS gained
    FROM scores
    WHERE game_id IN ('connect-four', 'tic-tac-toe')
) d
WHERE s.id = d.id AND s.gained IS NULL;

UPDATE scores SET gained = score WHERE gained IS NULL;

CREATE INDEX IF NOT EXISTS idx_scores_game_created ON scores (game_id, created_at);

-- One weekly prize per player, week and board.
CREATE TABLE IF NOT EXISTS weekly_prize_claims (
    user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- Monday (WIB) the prize week started.
    week       DATE        NOT NULL,
    game_id    VARCHAR(64) NOT NULL,
    -- Board within the game; 0 = the whole game.
    level      INTEGER     NOT NULL,
    rank       SMALLINT    NOT NULL CHECK (rank BETWEEN 1 AND 3),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, week, game_id, level)
);
