-- Pre-built sponsor cards and announcements the admin can push to the display
-- with one click (like adding a match). type = 'sponsor' | 'announcement'.
CREATE TABLE IF NOT EXISTS display_assets (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type        TEXT NOT NULL,
    title       TEXT NOT NULL DEFAULT '',
    body        TEXT NOT NULL DEFAULT '',
    image_url   TEXT NOT NULL DEFAULT '',
    duration    INTEGER NOT NULL DEFAULT 10,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_display_assets_type ON display_assets(type);
