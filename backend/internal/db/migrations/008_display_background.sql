-- Persistent full-screen background image for the display (empty = default dark).
ALTER TABLE current_display_layout ADD COLUMN IF NOT EXISTS background_url TEXT NOT NULL DEFAULT '';
