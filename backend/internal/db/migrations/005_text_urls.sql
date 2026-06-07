-- Expand logo / photo URL columns from VARCHAR(500) to TEXT
ALTER TABLE matches
    ALTER COLUMN team_a_logo TYPE TEXT,
    ALTER COLUMN team_b_logo TYPE TEXT;

ALTER TABLE match_players
    ALTER COLUMN photo_url TYPE TEXT;
