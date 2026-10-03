-- A screen can follow a court: it then shows that court's live match, or the
-- next pending one, and switches by itself as matches start and finish.
ALTER TABLE display_screens
    ADD COLUMN IF NOT EXISTS follow_court_id UUID REFERENCES courts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_display_screens_follow_court ON display_screens(follow_court_id);
