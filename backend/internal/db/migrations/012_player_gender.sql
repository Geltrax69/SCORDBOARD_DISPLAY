-- Preserve the registration gender on saved rosters and match snapshots.
ALTER TABLE team_players
    ADD COLUMN IF NOT EXISTS gender VARCHAR(30) NOT NULL DEFAULT '';

ALTER TABLE match_players
    ADD COLUMN IF NOT EXISTS gender VARCHAR(30) NOT NULL DEFAULT '';
