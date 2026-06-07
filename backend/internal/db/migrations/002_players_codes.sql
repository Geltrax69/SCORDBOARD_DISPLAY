-- Match code for simple scorer device pairing
ALTER TABLE matches ADD COLUMN IF NOT EXISTS match_code VARCHAR(8) UNIQUE;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS team_a_logo VARCHAR(500) DEFAULT '';
ALTER TABLE matches ADD COLUMN IF NOT EXISTS team_b_logo VARCHAR(500) DEFAULT '';

-- Auto-generate 6-digit codes for any existing matches
UPDATE matches
SET match_code = LPAD((FLOOR(RANDOM() * 900000) + 100000)::TEXT, 6, '0')
WHERE match_code IS NULL;

-- Match players (max 5 per team enforced in application layer)
CREATE TABLE IF NOT EXISTS match_players (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id      UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    team          VARCHAR(1) NOT NULL CHECK (team IN ('A', 'B')),
    name          VARCHAR(255) NOT NULL,
    jersey_number INTEGER NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_match_players_match_id ON match_players(match_id, team);

-- Device sessions (persisted heartbeats; primary truth is in-memory WS hub)
CREATE TABLE IF NOT EXISTS device_sessions (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_name  VARCHAR(255) NOT NULL DEFAULT 'Unknown Device',
    ip_address   VARCHAR(45) NOT NULL DEFAULT '',
    match_id     UUID REFERENCES matches(id) ON DELETE SET NULL,
    match_code   VARCHAR(8),
    connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    disconnected_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_device_sessions_match_id ON device_sessions(match_id);
