-- Named display screens: each TV opens /display?screen=<slug> once and is then
-- controlled on its own from the admin panel. 'main' is the plain /display
-- screen and inherits whatever the old single shared layout was showing.
CREATE TABLE IF NOT EXISTS display_screens (
    slug                  TEXT PRIMARY KEY,
    name                  TEXT NOT NULL,
    mode                  INTEGER NOT NULL DEFAULT 1,
    match_ids             TEXT[] NOT NULL DEFAULT '{}',
    show_player_animation BOOLEAN NOT NULL DEFAULT FALSE,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO display_screens (slug, name, mode, match_ids)
SELECT 'main', 'Main Display', mode, match_ids FROM current_display_layout
ON CONFLICT (slug) DO NOTHING;

INSERT INTO display_screens (slug, name) VALUES ('main', 'Main Display')
ON CONFLICT (slug) DO NOTHING;
