-- ── 4-digit match codes ──────────────────────────────────────────────────
-- Re-generate all match codes as 4-digit (1000-9999)
ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_match_code_key;
ALTER TABLE matches ALTER COLUMN match_code TYPE VARCHAR(6);

UPDATE matches
SET match_code = LPAD((1000 + FLOOR(RANDOM() * 9000))::TEXT, 4, '0');

ALTER TABLE matches ADD CONSTRAINT matches_match_code_key UNIQUE (match_code);

-- ── Player enhancements ───────────────────────────────────────────────────
ALTER TABLE match_players
    ADD COLUMN IF NOT EXISTS status   VARCHAR(20) NOT NULL DEFAULT 'playing'
        CHECK (status IN ('playing','sub')),
    ADD COLUMN IF NOT EXISTS photo_url VARCHAR(500) NOT NULL DEFAULT '';

-- ── Current display layout (in-memory preferred, persisted for reload) ──
CREATE TABLE IF NOT EXISTS current_display_layout (
    singleton BOOLEAN PRIMARY KEY DEFAULT TRUE,
    mode      INTEGER  NOT NULL DEFAULT 1,
    match_ids TEXT[]   NOT NULL DEFAULT '{}',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT one_row CHECK (singleton = TRUE)
);
INSERT INTO current_display_layout (mode, match_ids) VALUES (1, '{}')
ON CONFLICT DO NOTHING;
