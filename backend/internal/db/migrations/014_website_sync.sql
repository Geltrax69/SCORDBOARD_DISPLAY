-- Website (HSTA) sync: tournaments and approved district teams are mirrored
-- from the website backend. external_id holds the website's Mongo _id so a
-- re-sync updates rows instead of duplicating them.
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS external_id TEXT UNIQUE;

ALTER TABLE teams
    ADD COLUMN IF NOT EXISTS external_id   TEXT UNIQUE,
    ADD COLUMN IF NOT EXISTS tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS district      VARCHAR(255) NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS event_type    VARCHAR(20)  NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS sync_hash     TEXT         NOT NULL DEFAULT '';

-- Synced teams are scoped to a tournament, so two tournaments may both have a
-- "Rohtak" team. Hand-made teams keep their global unique name.
ALTER TABLE teams DROP CONSTRAINT IF EXISTS teams_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS teams_local_name_key ON teams(name) WHERE external_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_teams_tournament_id ON teams(tournament_id);
