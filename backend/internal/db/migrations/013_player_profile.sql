-- Registration details carried over from the player spreadsheet import.
ALTER TABLE team_players
    ADD COLUMN IF NOT EXISTS player_code         VARCHAR(50)  NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS category            VARCHAR(50)  NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS date_of_birth       VARCHAR(20)  NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS age                 INTEGER      NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS district_games      INTEGER      NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS state_games         INTEGER      NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS national_games      INTEGER      NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS international_games INTEGER      NOT NULL DEFAULT 0;
