-- Event format decides how many rounds a match is played over:
--   regu   → 1 round
--   double → 2 rounds, plus a decider 3rd round only if tied 1–1
--   quad   → 3 rounds, always played out; winner leads on rounds
-- Each round is still best-of-3 sets (first to 2 sets takes the round).
ALTER TABLE tournaments
    ADD COLUMN IF NOT EXISTS event_type VARCHAR(20) NOT NULL DEFAULT 'regu'
        CHECK (event_type IN ('regu','double','quad'));

-- Denormalised onto the match so a match's format is frozen at creation and
-- editing the tournament later can't rewrite a match already in progress.
ALTER TABLE matches
    ADD COLUMN IF NOT EXISTS event_type VARCHAR(20) NOT NULL DEFAULT 'regu'
        CHECK (event_type IN ('regu','double','quad'));
