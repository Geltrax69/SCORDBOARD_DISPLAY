-- Admin-selectable scorecard display style: 'classic' (default) | 'cards'.
ALTER TABLE current_display_layout ADD COLUMN IF NOT EXISTS display_style TEXT NOT NULL DEFAULT 'classic';
